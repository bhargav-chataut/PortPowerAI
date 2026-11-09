import type { FcfsSchedulingInput, FcfsSchedulingAssumptions, FcfsScheduleResult,
  FcfsAssignment, FcfsUnscheduledArrival, SchedulingEquipment } from "./types.js";

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const equipmentTypes = ["forklift", "reach_stacker", "mobile_crane", "gantry_crane", "terminal_tractor"];
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(`Invalid FCFS input: ${message}`);
}
function timestamp(value: string): number {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value), "timestamps need an explicit timezone");
  const milliseconds = Date.parse(value);
  requireValue(Number.isFinite(milliseconds), "timestamp is invalid");
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  requireValue(Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10) && Number(value.slice(11, 13)) < 24, "invalid calendar date or clock time");
  return milliseconds;
}
function provenance(value: { source: string; note: string }) {
  requireValue(value && ["planner-confirmed", "simulated"].includes(value.source) && typeof value.note === "string" && value.note.trim(), "assumptions need an explicit source and note");
}
function uniqueIds(rows: { id: string }[], label: string) {
  requireValue(Array.isArray(rows), `${label} must be an array`);
  const seen = new Set<string>();
  for (const row of rows) {
    requireValue(row && typeof row.id === "string" && row.id.trim() && !seen.has(row.id), `${label} IDs must be nonempty unique strings`);
    seen.add(row.id);
  }
}

/** Pure deterministic, non-preemptive scheduling. No clock, database, AI or mutation. */
export function scheduleFcfs(input: FcfsSchedulingInput, assumptions: FcfsSchedulingAssumptions): FcfsScheduleResult {
  requireValue(input && assumptions, "input and assumptions are required");
  const horizonStart = timestamp(assumptions.horizonStartUtc), horizonEnd = timestamp(assumptions.horizonEndUtc);
  requireValue(horizonEnd > horizonStart, "planning horizon end must follow its start");
  provenance(assumptions.availableResources);
  uniqueIds(input.berths, "berth"); uniqueIds(input.equipment, "equipment"); uniqueIds(input.arrivals, "arrival");
  requireValue(Array.isArray(input.assumptions), "input assumption provenance is required");
  requireValue(Array.isArray(assumptions.equipmentRequirements), "equipment requirements must be explicit");
  const berthIds = new Set(input.berths.map(b => b.id)), arrivalIds = new Set(input.arrivals.map(a => a.id));
  const requirements = new Map<string, FcfsSchedulingAssumptions["equipmentRequirements"][number]>();
  for (const entry of assumptions.equipmentRequirements) {
    provenance(entry);
    requireValue(arrivalIds.has(entry.arrivalId) && !requirements.has(entry.arrivalId), "requirement arrival ID must exist and be unique");
    requireValue(Array.isArray(entry.requirements), "requirements must be an array");
    const types = new Set<string>();
    for (const requirement of entry.requirements) {
      requireValue(equipmentTypes.includes(requirement.type) && !types.has(requirement.type), "equipment requirement types must be valid and unique per arrival");
      requireValue(Number.isSafeInteger(requirement.count) && requirement.count > 0, "equipment counts must be positive integers");
      requireValue(requirement.minimumCapacityTonnes === undefined || (Number.isFinite(requirement.minimumCapacityTonnes) && requirement.minimumCapacityTonnes > 0), "minimum capacity must be positive when supplied");
      types.add(requirement.type);
    }
    requirements.set(entry.arrivalId, entry);
  }
  for (const berth of input.berths) {
    requireValue(["available", "occupied", "maintenance", "closed"].includes(berth.status) && typeof berth.availableForPlanning === "boolean", "invalid berth availability");
  }
  for (const equipment of input.equipment) {
    requireValue(equipmentTypes.includes(equipment.type) && ["available", "in_use", "maintenance", "out_of_service"].includes(equipment.status) && typeof equipment.availableForPlanning === "boolean", "invalid equipment type/status");
    requireValue(equipment.capacityTonnes === null || (Number.isFinite(equipment.capacityTonnes) && equipment.capacityTonnes > 0), "invalid equipment capacity");
    requireValue(equipment.assignedBerthId === null || berthIds.has(equipment.assignedBerthId), "assigned berth must exist");
  }
  const ordered = input.arrivals.map(arrival => {
    requireValue(typeof arrival.mmsi === "string" && /^\d{9}$/.test(arrival.mmsi), "arrival needs a nine-digit MMSI for vessel exclusivity");
    requireValue(["planned", "arrived", "in_service"].includes(arrival.status), "only active validated arrivals may be scheduled");
    requireValue(arrival.preferredBerthId === null || berthIds.has(arrival.preferredBerthId), "preferred berth must exist");
    requireValue(arrival.serviceDurationMinutes === null || (Number.isFinite(arrival.serviceDurationMinutes) && arrival.serviceDurationMinutes > 0), "duration must be positive or explicitly unknown");
    requireValue(["manager-planning-record", "simulated", "unknown"].includes(arrival.durationSource), "duration provenance must be explicit");
    requireValue(arrival.serviceDurationMinutes === null || arrival.durationSource !== "unknown", "known duration needs a source");
    if (arrival.durationSource === "simulated") requireValue(input.assumptions.some(a => a.kind === "simulated" && a.path === `arrivals.${arrival.id}.serviceDurationMinutes` && a.value === arrival.serviceDurationMinutes && a.unit === "minutes" && a.note.trim()), "simulated duration needs matching input provenance");
    return { arrival, eta: timestamp(arrival.plannedEta) };
  }).sort((a, b) => a.eta - b.eta || compareId(a.arrival.id, b.arrival.id));

  const availableBerths = input.berths.filter(b => b.status === "available" && b.availableForPlanning).sort((a, b) => compareId(a.id, b.id));
  const availableEquipment = input.equipment.filter(e => e.status === "available" && e.availableForPlanning);
  const berthFree = new Map<string, number>(), equipmentFree = new Map<string, number>(), vesselFree = new Map<string, number>();
  const assignments: FcfsAssignment[] = [], unscheduled: FcfsUnscheduledArrival[] = [];
  let fcfsStart = horizonStart;
  for (const { arrival, eta } of ordered) {
    const reject = (reason: FcfsUnscheduledArrival["reason"], message: string) => unscheduled.push({ arrivalId: arrival.id, reason, message });
    if (arrival.serviceDurationMinutes === null) { reject("MISSING_SERVICE_DURATION", "Provide a confirmed or explicitly labeled simulated service duration; workload alone is insufficient."); continue; }
    const request = requirements.get(arrival.id);
    if (!request) { reject("MISSING_EQUIPMENT_REQUIREMENTS", "Provide equipment type/count requirements, or explicitly confirm that this call needs no equipment."); continue; }
    if (!availableBerths.length) { reject("NO_AVAILABLE_BERTH", "No berth is available. Occupied, maintenance and closed berths are blocked for the entire horizon."); continue; }
    // Round upward to representable UTC milliseconds, never shortening required work.
    const durationMs = Math.ceil(arrival.serviceDurationMinutes * 60000);
    if (!Number.isSafeInteger(durationMs) || durationMs > horizonEnd - horizonStart) { reject("NO_SLOT_IN_HORIZON", "Service duration cannot fit inside the supplied planning horizon."); continue; }
    const candidates: { berthId: string; equipment: SchedulingEquipment[]; start: number }[] = [];
    let sufficientEquipment = false;
    for (const berth of availableBerths) {
      const selected: SchedulingEquipment[] = [];
      let enough = true;
      for (const requirement of request.requirements) {
        const eligible = availableEquipment.filter(e => e.type === requirement.type && (e.assignedBerthId === null || e.assignedBerthId === berth.id) &&
          (requirement.minimumCapacityTonnes === undefined || (e.capacityTonnes !== null && e.capacityTonnes >= requirement.minimumCapacityTonnes)))
          .sort((a, b) => (equipmentFree.get(a.id) ?? horizonStart) - (equipmentFree.get(b.id) ?? horizonStart) || compareId(a.id, b.id));
        if (eligible.length < requirement.count) { enough = false; break; }
        selected.push(...eligible.slice(0, requirement.count));
      }
      if (!enough) continue;
      sufficientEquipment = true;
      const start = Math.max(eta, horizonStart, fcfsStart, berthFree.get(berth.id) ?? horizonStart,
        vesselFree.get(arrival.mmsi) ?? horizonStart, ...selected.map(e => equipmentFree.get(e.id) ?? horizonStart));
      if (start + durationMs <= horizonEnd) candidates.push({ berthId: berth.id, equipment: selected, start });
    }
    candidates.sort((a, b) => a.start - b.start || Number(b.berthId === arrival.preferredBerthId) - Number(a.berthId === arrival.preferredBerthId) || compareId(a.berthId, b.berthId));
    const candidate = candidates[0];
    if (!candidate) {
      reject(sufficientEquipment ? "NO_SLOT_IN_HORIZON" : "INSUFFICIENT_EQUIPMENT", sufficientEquipment ?
        "No complete berth/equipment/vessel interval fits after ETA within the horizon while preserving FCFS order." :
        "No available berth has enough eligible equipment matching type, count, berth restriction and any supplied capacity requirement.");
      continue;
    }
    const end = candidate.start + durationMs;
    berthFree.set(candidate.berthId, end); vesselFree.set(arrival.mmsi, end);
    for (const equipment of candidate.equipment) equipmentFree.set(equipment.id, end);
    fcfsStart = candidate.start;
    assignments.push({ arrivalId: arrival.id, mmsi: arrival.mmsi, plannedEtaUtc: new Date(eta).toISOString(), berthId: candidate.berthId,
      equipmentIds: candidate.equipment.map(e => e.id).sort(compareId), serviceStartUtc: new Date(candidate.start).toISOString(),
      completionTimeUtc: new Date(end).toISOString(), waitingMinutes: (candidate.start - eta) / 60000,
      serviceDurationMinutes: durationMs / 60000, turnaroundMinutes: (end - eta) / 60000, durationSource: arrival.durationSource });
  }
  const totalWaitingMinutes = assignments.reduce((sum, a) => sum + a.waitingMinutes, 0);
  const lastEnd = assignments.length ? Math.max(...assignments.map(a => Date.parse(a.completionTimeUtc))) : null;
  return { algorithm: "fcfs-1.0", assignments, unscheduled,
    metrics: { scheduledCount: assignments.length, unscheduledCount: unscheduled.length, totalWaitingMinutes,
      averageWaitingMinutes: assignments.length ? totalWaitingMinutes / assignments.length : 0,
      lastCompletionTimeUtc: lastEnd === null ? null : new Date(lastEnd).toISOString() },
    assumptions: structuredClone(assumptions), inputAssumptions: structuredClone(input.assumptions),
    limitations: ["FCFS heuristic only; no global optimality, industrial dispatch or physical berth-fit guarantee.",
      "Currently unavailable resources stay blocked; available resources are assumed usable throughout the explicitly supplied horizon.",
      "No productivity, vessel dimensions, release times, charging/SOC, crew or cargo compatibility are inferred.",
      "Equipment is reserved for the entire service interval; explicit berth assignments are respected. Preferred berth is a soft tie-break at the earliest feasible start."] };
}
