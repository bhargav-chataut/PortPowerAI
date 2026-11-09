/** Operations-only contracts. Every entity is fictional, with no AIS identity. */
export type EquipmentKind = "forklift" | "yard-tractor";
export interface Berth { id: string; name: string }
export interface VesselCall {
  id: string; name: string; berthId: string;
  arrival: number; departure: number;
}
export interface OperatingEquipment {
  id: string; name: string; kind: EquipmentKind; enabled: boolean;
  availableFrom: number; availableUntil: number;
}
export interface CargoTask {
  id: string; name: string; vesselId: string;
  start: number; duration: number; priority: "high" | "normal" | "low";
  requiredKind: EquipmentKind; equipmentIds: string[];
}
export interface OperatingScenario {
  schemaVersion: "operations-1.0"; id: "gulfport-demo-v1";
  synthetic: true; region: "gulfport"; revision: number; name: string;
  berths: Berth[]; vessels: VesselCall[];
  equipment: OperatingEquipment[]; tasks: CargoTask[];
}
export interface OperationsConflict {
  code: "BERTH_OVERLAP" | "EQUIPMENT_OVERLAP" | "EQUIPMENT_UNAVAILABLE" |
    "TASK_OUTSIDE_CALL" | "EQUIPMENT_KIND" | "UNASSIGNED_TASK";
  message: string; entityIds: string[];
}
export interface OperationsResponse {
  scenario: OperatingScenario; conflicts: OperationsConflict[];
  persistence: "postgres" | "browser";
}

/** Manager planning inputs, kept separate from fictional fixtures and AIS. */
export type SchedulingPortCode = "gulfport" | "miami";
export type SchedulingEquipmentType = "forklift" | "reach_stacker" | "mobile_crane" | "gantry_crane" | "terminal_tractor";
export type SchedulingCargoType = "containers" | "general" | "bulk" | "roro";
export interface SchedulingInputIssue {
  code: "INVALID_RECORD" | "CROSS_PORT_RECORD" | "INVALID_REFERENCE" | "INVALID_CONFIGURATION" |
    "NO_ACTIVE_ARRIVALS" | "NO_AVAILABLE_BERTHS" | "NO_AVAILABLE_EQUIPMENT" | "MISSING_SERVICE_DURATION" |
    "UNKNOWN_BERTH_LIMIT" | "UNKNOWN_EQUIPMENT_CAPACITY" | "UNKNOWN_PRODUCTIVITY" |
    "PREFERRED_BERTH_UNAVAILABLE" | "UNKNOWN_AVAILABILITY_WINDOWS" | "UNKNOWN_EQUIPMENT_REQUIREMENTS";
  severity: "error" | "warning"; path: string; message: string;
}
export interface SchedulingBerth {
  id: string; berthNumber: number; name: string;
  status: "available" | "occupied" | "maintenance" | "closed";
  maxLengthM: number | null; maxDraftM: number | null;
  availableForPlanning: boolean;
}
export interface SchedulingEquipment {
  id: string; code: string; type: SchedulingEquipmentType;
  capacityTonnes: number | null; energyType: "diesel" | "electric" | "hybrid" | null;
  status: "available" | "in_use" | "maintenance" | "out_of_service";
  assignedBerthId: string | null; availableForPlanning: boolean;
  productivity: null;
}
export interface SchedulingArrival {
  id: string; mmsi: string; vesselName: string | null; plannedEta: string;
  cargoType: SchedulingCargoType; workload: { quantity: number; unit: "container_moves" | "tonnes" | "vehicle_moves" };
  serviceDurationMinutes: number | null; durationSource: "manager-planning-record" | "simulated" | "unknown";
  preferredBerthId: string | null; status: "planned" | "arrived" | "in_service";
  equipmentRequirements: null;
}
export interface SchedulingInputConfiguration {
  simulatedServiceDurations?: { arrivalId: string; minutes: number; note: string }[];
}
export interface SchedulingInputs {
  schemaVersion: "scheduling-inputs-1.0";
  source: "manager-planning-records";
  port: { id: string; code: SchedulingPortCode };
  units: { dimensions: "m"; equipmentCapacity: "tonnes"; duration: "minutes"; timestamps: "UTC ISO 8601" };
  berths: SchedulingBerth[]; equipment: SchedulingEquipment[]; arrivals: SchedulingArrival[];
  assumptions: { kind: "simulated"; path: string; value: number; unit: "minutes"; note: string }[];
  issues: SchedulingInputIssue[]; readyForScheduling: boolean;
  limitations: string[];
}
