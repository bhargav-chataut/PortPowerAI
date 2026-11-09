import type { OperatingScenario, OperationsConflict } from "./types.js";

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 160;
const minute = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1440;
const kind = (v: unknown) => v === "forklift" || v === "yard-tractor";

/** Validate unknown JSON before deterministic schedule calculations. */
export function validateOperatingScenario(value: unknown): string[] {
  if (!record(value)) return ["Scenario must be an object."];
  const issues: string[] = [];
  if (value.schemaVersion !== "operations-1.0" || value.id !== "gulfport-demo-v1" ||
      value.synthetic !== true || value.region !== "gulfport") issues.push("Use the fictional Gulfport operations-1.0 contract (synthetic: true).");
  if (!text(value.name)) issues.push("Scenario name is required (maximum 160 characters).");
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || Number(value.revision) >= 2147483647) issues.push("Revision must be a positive integer below 2147483647.");
  const collections = ["berths", "vessels", "equipment", "tasks"] as const;
  for (const key of collections) {
    const entries = value[key];
    if (!Array.isArray(entries) || entries.length > 100 || (key === "berths" && entries.length === 0)) {
      issues.push(`${key}: provide an array of up to 100 entries${key === "berths" ? ", with at least one berth" : ""}.`);
      continue;
    }
    const ids = new Set<string>();
    entries.forEach((item, index) => {
      const label = `${key} row ${index + 1}`;
      if (!record(item)) { issues.push(`${label}: expected an object.`); return; }
      if (!text(item.id) || !/^[a-zA-Z0-9-]{1,60}$/.test(item.id) || ids.has(item.id)) issues.push(`${label}: ID must be unique, 1–60 letters, digits or hyphens.`);
      if (typeof item.id === "string") ids.add(item.id);
      if (!text(item.name)) issues.push(`${label}: name is required (maximum 160 characters).`);
      if (key === "vessels") {
        if (!text(item.berthId)) issues.push(`${label}: berth is required.`);
        if (!minute(item.arrival) || !minute(item.departure) || item.arrival >= item.departure) issues.push(`${label}: arrival must precede departure within 00:00–24:00.`);
      }
      if (key === "equipment") {
        if (!kind(item.kind) || typeof item.enabled !== "boolean") issues.push(`${label}: valid equipment type and availability flag required.`);
        if (!minute(item.availableFrom) || !minute(item.availableUntil) || item.availableFrom >= item.availableUntil) issues.push(`${label}: availability start must precede end within the day.`);
      }
      if (key === "tasks") {
        if (!text(item.vesselId) || !kind(item.requiredKind) || typeof item.priority !== "string" || !["high", "normal", "low"].includes(item.priority)) issues.push(`${label}: valid vessel, priority and equipment type required.`);
        if (!minute(item.start) || !minute(item.duration) || item.duration < 1 || item.start + item.duration > 1440) issues.push(`${label}: positive duration must finish within the planning day.`);
        if (!Array.isArray(item.equipmentIds) || item.equipmentIds.length > 100 || !item.equipmentIds.every(text) || new Set(item.equipmentIds).size !== item.equipmentIds.length) issues.push(`${label}: equipment assignments must be a unique array of IDs.`);
      }
    });
  }
  if (issues.length) return issues;
  const s = value as unknown as OperatingScenario;
  for (const vessel of s.vessels) {
    if (!s.berths.some(b => b.id === vessel.berthId)) issues.push(`${vessel.name}: unknown berth.`);
  }
  for (const task of s.tasks) {
    if (!s.vessels.some(v => v.id === task.vesselId)) issues.push(`${task.name}: unknown vessel call.`);
    for (const id of task.equipmentIds) if (!s.equipment.some(e => e.id === id)) issues.push(`${task.name}: unknown equipment ${id}.`);
  }
  return issues;
}

/** Half-open intervals: departure/release at a start time permits reuse. */
export function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

export function detectOperationsConflicts(s: OperatingScenario): OperationsConflict[] {
  const issues = validateOperatingScenario(s);
  if (issues.length) throw new Error(issues.join(" "));
  const conflicts: OperationsConflict[] = [];
  const add = (code: OperationsConflict["code"], message: string, ...entityIds: string[]) => conflicts.push({ code, message, entityIds });
  for (let i = 0; i < s.vessels.length; i++) {
    const a = s.vessels[i];
    for (const b of s.vessels.slice(i + 1)) {
      if (a.berthId === b.berthId && overlaps(a.arrival, a.departure, b.arrival, b.departure)) {
        add("BERTH_OVERLAP", `${s.berths.find(x => x.id === a.berthId)!.name}: ${a.name} and ${b.name} have overlapping berth assignments.`, a.id, b.id, a.berthId);
      }
    }
  }
  for (const task of s.tasks) {
    const vessel = s.vessels.find(v => v.id === task.vesselId)!;
    if (task.start < vessel.arrival || task.start + task.duration > vessel.departure) add("TASK_OUTSIDE_CALL", `${task.name}: work must fit between ${vessel.name}'s arrival and departure.`, task.id, vessel.id);
    if (!task.equipmentIds.length) add("UNASSIGNED_TASK", `${task.name}: assign at least one ${task.requiredKind}.`, task.id);
    for (const id of task.equipmentIds) {
      const e = s.equipment.find(e => e.id === id)!;
      if (!e.enabled || task.start < e.availableFrom || task.start + task.duration > e.availableUntil) add("EQUIPMENT_UNAVAILABLE", `${task.name}: ${e.name} is unavailable for part or all of this task.`, task.id, e.id);
      if (e.kind !== task.requiredKind) add("EQUIPMENT_KIND", `${task.name}: ${e.name} does not match required type ${task.requiredKind}.`, task.id, e.id);
    }
  }
  for (let i = 0; i < s.tasks.length; i++) {
    const a = s.tasks[i];
    for (const b of s.tasks.slice(i + 1)) {
      if (!overlaps(a.start, a.start + a.duration, b.start, b.start + b.duration)) continue;
      for (const id of a.equipmentIds.filter(id => b.equipmentIds.includes(id))) {
        add("EQUIPMENT_OVERLAP", `${s.equipment.find(e => e.id === id)!.name}: double-booked for ${a.name} and ${b.name}.`, a.id, b.id, id);
      }
    }
  }
  return conflicts;
}

export function berthStatus(s: OperatingScenario, berthId: string, at: number): "occupied" | "scheduled" | "available" {
  const calls = s.vessels.filter(v => v.berthId === berthId);
  if (calls.some(v => v.arrival <= at && at < v.departure)) return "occupied";
  return calls.some(v => v.arrival > at) ? "scheduled" : "available";
}

export function equipmentStatus(s: OperatingScenario, id: string, at: number): "unavailable" | "assigned" | "available" {
  const e = s.equipment.find(e => e.id === id)!;
  if (!e.enabled || at < e.availableFrom || at >= e.availableUntil) return "unavailable";
  return s.tasks.some(t => t.equipmentIds.includes(id) && t.start <= at && at < t.start + t.duration) ? "assigned" : "available";
}

export function formatMinute(value: number): string {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

export function equipmentWorkload(s: OperatingScenario, id: string): { taskCount: number; assignedMinutes: number } {
  const tasks = s.tasks.filter(task => task.equipmentIds.includes(id));
  return { taskCount: tasks.length, assignedMinutes: tasks.reduce((sum, task) => sum + task.duration, 0) };
}
