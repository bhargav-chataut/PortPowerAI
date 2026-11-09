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
