import type {
  SchedulingInputs, SchedulingInputConfiguration, SchedulingInputIssue,
  SchedulingBerth, SchedulingEquipment, SchedulingArrival,
} from "./types.js";

export class SchedulingInputValidationError extends Error {
  constructor(public issues: SchedulingInputIssue[]) {
    super("Planning records failed runtime validation.");
    this.name = "SchedulingInputValidationError";
  }
}

function fail(path: string, message: string, code: SchedulingInputIssue["code"] = "INVALID_RECORD"): never {
  throw new SchedulingInputValidationError([{ code, severity: "error", path, message }]);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "Expected a planning record object.");
  return value as Record<string, unknown>;
}
function id(value: unknown, path: string): string {
  const result = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof result !== "string" || !/^[1-9]\d{0,18}$/.test(result) || BigInt(result) > 9223372036854775807n) fail(path, "Expected a positive PostgreSQL BIGINT ID (keep large IDs as strings).");
  return result;
}
function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(path, `Expected nonempty text up to ${maximum} characters.`);
  return value;
}
function positive(value: unknown, path: string): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) fail(path, "Expected a positive numeric planning value.");
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) fail(path, "Expected a finite positive planning value.");
  return result;
}
function optionalPositive(value: unknown, path: string): number | null { return value === null ? null : positive(value, path); }
function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (!options.some(item => item === value)) fail(path, `Expected one of: ${options.join(", ")}.`);
  return value as T;
}
function rows(value: unknown, path: string, portId: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) fail(path, "Expected an array of planning records.");
  const seen = new Set<string>();
  return value.map((entry, i) => {
    const row = object(entry, `${path}[${i}]`);
    const rowId = id(row.id, `${path}[${i}].id`);
    if (seen.has(rowId)) fail(`${path}[${i}].id`, "Duplicate planning record ID.");
    seen.add(rowId);
    if (id(row.port_id, `${path}[${i}].port_id`) !== portId) fail(`${path}[${i}].port_id`, "Record belongs to another port; the snapshot was rejected.", "CROSS_PORT_RECORD");
    return row;
  });
}

export function validateSchedulingInputConfiguration(value: unknown): asserts value is SchedulingInputConfiguration {
  const config = object(value, "configuration");
  if (Object.keys(config).some(key => key !== "simulatedServiceDurations")) fail("configuration", "Unsupported assumption configuration.", "INVALID_CONFIGURATION");
  if (config.simulatedServiceDurations === undefined) return;
  if (!Array.isArray(config.simulatedServiceDurations)) fail("configuration.simulatedServiceDurations", "Expected an array of explicit simulated duration assumptions.", "INVALID_CONFIGURATION");
  const seen = new Set<string>();
  for (const [i, entry] of config.simulatedServiceDurations.entries()) {
    const path = `configuration.simulatedServiceDurations[${i}]`;
    const row = object(entry, path);
    if (Object.keys(row).some(key => !["arrivalId", "minutes", "note"].includes(key))) fail(path, "Unknown assumption field.", "INVALID_CONFIGURATION");
    const arrivalId = id(row.arrivalId, `${path}.arrivalId`);
    if (seen.has(arrivalId)) fail(`${path}.arrivalId`, "Duplicate simulated arrival duration.", "INVALID_CONFIGURATION");
    seen.add(arrivalId);
    if (typeof row.minutes !== "number") fail(`${path}.minutes`, "Simulated minutes must be a finite positive number.", "INVALID_CONFIGURATION");
    positive(row.minutes, `${path}.minutes`); text(row.note, `${path}.note`, 500);
  }
}

/** Convert database values into an inspection contract, without guessing missing inputs. */
export function buildSchedulingInputs(value: unknown, configuration: SchedulingInputConfiguration = {}): SchedulingInputs {
  validateSchedulingInputConfiguration(configuration);
  const raw = object(value, "inputs"), port = object(raw.port, "port");
  const portId = id(port.id, "port.id");
  const portCode = choice(port.code, ["gulfport", "miami"] as const, "port.code");
  const issues: SchedulingInputIssue[] = [];
  const add = (code: SchedulingInputIssue["code"], severity: "error" | "warning", path: string, message: string) => issues.push({ code, severity, path, message });
  const berths: SchedulingBerth[] = rows(raw.berths, "berths", portId).map((row, i) => {
    const path = `berths[${i}]`;
    const berthNumber = positive(row.berth_number, `${path}.berth_number`);
    if (!Number.isSafeInteger(berthNumber)) fail(`${path}.berth_number`, "Berth number must be an integer.");
    const status = choice(row.status, ["available", "occupied", "maintenance", "closed"] as const, `${path}.status`);
    const berth: SchedulingBerth = { id: id(row.id, `${path}.id`), berthNumber, name: text(row.name, `${path}.name`, 100), status,
      maxLengthM: optionalPositive(row.max_length_m, `${path}.max_length_m`), maxDraftM: optionalPositive(row.max_draft_m, `${path}.max_draft_m`), availableForPlanning: status === "available" };
    if (berth.maxLengthM === null || berth.maxDraftM === null) add("UNKNOWN_BERTH_LIMIT", "warning", path, "Berth length/draft limits are unknown; supply confirmed values before physical compatibility checks.");
    return berth;
  });
  const berthIds = new Set(berths.map(b => b.id));
  const equipment: SchedulingEquipment[] = rows(raw.equipment, "equipment", portId).map((row, i) => {
    const path = `equipment[${i}]`;
    const status = choice(row.status, ["available", "in_use", "maintenance", "out_of_service"] as const, `${path}.status`);
    const assignedBerthId = row.assigned_berth_id === null ? null : id(row.assigned_berth_id, `${path}.assigned_berth_id`);
    if (assignedBerthId && !berthIds.has(assignedBerthId)) fail(`${path}.assigned_berth_id`, "Assigned berth is absent from this port's inventory.", "INVALID_REFERENCE");
    const item: SchedulingEquipment = { id: id(row.id, `${path}.id`), code: text(row.equipment_code, `${path}.equipment_code`, 40),
      type: choice(row.equipment_type, ["forklift", "reach_stacker", "mobile_crane", "gantry_crane", "terminal_tractor"] as const, `${path}.equipment_type`),
      capacityTonnes: optionalPositive(row.capacity_tonnes, `${path}.capacity_tonnes`), energyType: row.energy_type === null ? null : choice(row.energy_type, ["diesel", "electric", "hybrid"] as const, `${path}.energy_type`),
      status, assignedBerthId, availableForPlanning: status === "available", productivity: null };
    if (item.capacityTonnes === null) add("UNKNOWN_EQUIPMENT_CAPACITY", "warning", `${path}.capacityTonnes`, "Equipment capacity is unknown; no lifting capability has been inferred.");
    return item;
  });
  const assumptions: SchedulingInputs["assumptions"] = [];
  const arrivals: SchedulingArrival[] = [];
  for (const [i, row] of rows(raw.arrivals, "arrivals", portId).entries()) {
    const path = `arrivals[${i}]`;
    const status = choice(row.status, ["planned", "arrived", "in_service", "cancelled", "completed"] as const, `${path}.status`);
    if (status === "cancelled" || status === "completed") continue;
    const arrivalId = id(row.id, `${path}.id`);
    if (typeof row.mmsi !== "string" || !/^\d{9}$/.test(row.mmsi)) fail(`${path}.mmsi`, "Planning MMSI must contain exactly nine digits.");
    const vesselName = row.vessel_name === null ? null : text(row.vessel_name, `${path}.vessel_name`, 150);
    const eta = row.planned_eta;
    if (!(eta instanceof Date) && !(typeof eta === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(eta))) fail(`${path}.planned_eta`, "Planned ETA must be a date or ISO timestamp with an explicit timezone.");
    const date = new Date(eta);
    if (!Number.isFinite(date.getTime())) fail(`${path}.planned_eta`, "Planned ETA is invalid.");
    const cargoType = choice(row.cargo_type, ["containers", "general", "bulk", "roro"] as const, `${path}.cargo_type`);
    const unit = cargoType === "containers" ? "container_moves" : cargoType === "roro" ? "vehicle_moves" : "tonnes";
    if (row.workload_unit !== unit) fail(`${path}.workload_unit`, `Cargo type ${cargoType} requires ${unit}.`);
    const hours = optionalPositive(row.estimated_service_hours, `${path}.estimated_service_hours`);
    const simulated = configuration.simulatedServiceDurations?.find(a => a.arrivalId === arrivalId);
    const minutes = hours === null ? simulated?.minutes ?? null : hours * 60;
    if (minutes !== null && !Number.isFinite(minutes)) fail(`${path}.estimated_service_hours`, "Service duration overflows minutes.");
    const preferredBerthId = row.preferred_berth_id === null ? null : id(row.preferred_berth_id, `${path}.preferred_berth_id`);
    if (preferredBerthId && !berthIds.has(preferredBerthId)) fail(`${path}.preferred_berth_id`, "Preferred berth is absent from this port's inventory.", "INVALID_REFERENCE");
    const durationSource = hours !== null ? "manager-planning-record" : simulated ? "simulated" : "unknown";
    if (minutes === null) add("MISSING_SERVICE_DURATION", "error", `${path}.serviceDurationMinutes`, `Arrival ${arrivalId}: enter estimated service hours or explicitly configure a labeled simulated duration. Workload alone cannot determine duration.`);
    if (durationSource === "simulated") assumptions.push({ kind: "simulated", path: `arrivals.${arrivalId}.serviceDurationMinutes`, value: minutes!, unit: "minutes", note: simulated!.note });
    if (preferredBerthId && !berths.find(b => b.id === preferredBerthId)!.availableForPlanning) add("PREFERRED_BERTH_UNAVAILABLE", "warning", `${path}.preferredBerthId`, `Arrival ${arrivalId}: preferred berth is not currently marked available; do not assume a release time.`);
    arrivals.push({ id: arrivalId, mmsi: row.mmsi, vesselName, plannedEta: date.toISOString(), cargoType,
      workload: { quantity: positive(row.workload_quantity, `${path}.workload_quantity`), unit }, serviceDurationMinutes: minutes,
      durationSource, preferredBerthId, status, equipmentRequirements: null });
  }
  if (!arrivals.length) add("NO_ACTIVE_ARRIVALS", "error", "arrivals", "Register a planned, arrived or in-service vessel arrival for this port.");
  if (arrivals.length && !berths.some(b => b.availableForPlanning)) add("NO_AVAILABLE_BERTHS", "error", "berths", "No berth is marked available. Review berth inventory/status; no release times are assumed.");
  if (arrivals.length && !equipment.some(e => e.availableForPlanning)) add("NO_AVAILABLE_EQUIPMENT", "error", "equipment", "No equipment is marked available. Register equipment or review its recorded status.");
  add("UNKNOWN_PRODUCTIVITY", "warning", "equipment.productivity", "Productivity is not stored. No throughput, equipment compatibility or service duration is inferred from capacity or cargo quantity.");
  add("UNKNOWN_AVAILABILITY_WINDOWS", "warning", "availability", "Availability reflects recorded status only. Shift windows and release times are unknown; available does not mean available for an entire shift.");
  add("UNKNOWN_EQUIPMENT_REQUIREMENTS", "warning", "arrivals.equipmentRequirements", "Task-specific equipment types/counts are not stored. A scheduler must obtain those requirements before allocating resources.");
  return { schemaVersion: "scheduling-inputs-1.0", source: "manager-planning-records", port: { id: portId, code: portCode },
    units: { dimensions: "m", equipmentCapacity: "tonnes", duration: "minutes", timestamps: "UTC ISO 8601" },
    berths, equipment, arrivals, assumptions, issues, readyForScheduling: !issues.some(i => i.severity === "error"),
    limitations: ["Inspection readiness checks minimum duration-based inputs only; this is not a feasible schedule or a physical compatibility guarantee.",
      "Manager planning records are not verified port-authority data. Planning MMSIs are identifiers, not AIS-derived schedules.",
      "No date horizon, berth release time, vessel dimensions, equipment rates, work requirements or shift windows are invented."] };
}
