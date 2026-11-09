import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleFcfs } from "../dist/index.js";

// Every resource, duration and requirement below is a synthetic software fixture.
const utc = (hour, minute = 0) => new Date(Date.UTC(2026, 10, 9, hour, minute)).toISOString();
const berth = (id, status = "available") => ({ id, berthNumber: Number(id), name: `Synthetic berth ${id}`, status,
  maxLengthM: null, maxDraftM: null, availableForPlanning: status === "available" });
const equipment = (id, type = "forklift", assignedBerthId = null) => ({ id, code: `SYN-${id}`, type,
  capacityTonnes: 5, energyType: "electric", status: "available", assignedBerthId, availableForPlanning: true, productivity: null });
const arrival = (id, plannedEta = utc(8), serviceDurationMinutes = 60) => ({ id, mmsi: String(100000000 + Number(id)), vesselName: `Synthetic vessel ${id}`,
  plannedEta, cargoType: "general", workload: { quantity: 50, unit: "tonnes" }, serviceDurationMinutes,
  durationSource: "manager-planning-record", preferredBerthId: null, status: "planned", equipmentRequirements: null });
function fixture(arrivals = [arrival("1"), arrival("2")]) {
  return { arrivals, berths: [berth("1")], equipment: [equipment("1")], assumptions: [] };
}
function assumptions(input, end = utc(18)) {
  return { horizonStartUtc: utc(6), horizonEndUtc: end,
    availableResources: { source: "simulated", note: "Synthetic resource availability for this planning horizon" },
    equipmentRequirements: input.arrivals.map(a => ({ arrivalId: a.id, source: "simulated", note: "Synthetic one-forklift whole-service requirement",
      requirements: [{ type: "forklift", count: 1 }] })) };
}
function deepFreeze(value) {
  Object.freeze(value);
  for (const item of Object.values(value)) if (item && typeof item === "object" && !Object.isFrozen(item)) deepFreeze(item);
  return value;
}

test("FCFS sorts ETAs and computes waiting, turnaround and completion from actual assignments", () => {
  const input = fixture([arrival("2", utc(8, 30)), arrival("1")]);
  const result = scheduleFcfs(input, assumptions(input));
  assert.deepEqual(result.assignments.map(a => a.arrivalId), ["1", "2"]);
  assert.equal(result.assignments[0].serviceStartUtc, utc(8));
  assert.equal(result.assignments[1].serviceStartUtc, utc(9));
  assert.equal(result.assignments[1].completionTimeUtc, utc(10));
  assert.equal(result.assignments[1].waitingMinutes, 30);
  assert.equal(result.assignments[1].turnaroundMinutes, 90);
  assert.deepEqual(result.metrics, { scheduledCount: 2, unscheduledCount: 0, totalWaitingMinutes: 30, averageWaitingMinutes: 15, lastCompletionTimeUtc: utc(10) });
});

test("simultaneous arrivals and resource tie-breaks are stable across input permutations", () => {
  const input = fixture([arrival("2"), arrival("1")]);
  input.berths = [berth("2"), berth("1")]; input.equipment = [equipment("2"), equipment("1")];
  const config = assumptions(input), expected = scheduleFcfs(input, config);
  assert.deepEqual(expected.assignments.map(a => a.arrivalId), ["1", "2"]);
  assert.deepEqual(expected.assignments.map(a => a.berthId), ["1", "2"]);
  assert.deepEqual(expected.assignments.map(a => a.equipmentIds), [["1"], ["2"]]);
  assert.deepEqual(scheduleFcfs({ ...input, arrivals: [...input.arrivals].reverse(), berths: [...input.berths].reverse(), equipment: [...input.equipment].reverse() }, config), expected);
});

test("shared berths, equipment and same-MMSI calls never overlap", () => {
  for (const constrained of ["berth", "equipment", "vessel"]) {
    const input = fixture();
    if (constrained !== "berth") input.berths.push(berth("2"));
    if (constrained !== "equipment") input.equipment.push(equipment("2"));
    if (constrained === "vessel") input.arrivals[1].mmsi = input.arrivals[0].mmsi;
    const result = scheduleFcfs(input, assumptions(input));
    assert.equal(result.assignments[1].serviceStartUtc, utc(9), constrained);
    assert.equal(result.assignments[0].completionTimeUtc, result.assignments[1].serviceStartUtc);
  }
});

test("occupied, closed and maintenance berths remain blocked without guessed release times", () => {
  const input = fixture([arrival("1")]);
  input.berths = [berth("1", "occupied"), berth("2", "closed"), berth("3", "maintenance")];
  const result = scheduleFcfs(input, assumptions(input));
  assert.equal(result.assignments.length, 0); assert.equal(result.unscheduled[0].reason, "NO_AVAILABLE_BERTH");
  input.berths.push(berth("4"));
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].berthId, "4");
  input.berths[3].availableForPlanning = false;
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments.length, 0);
});

test("preferred berth wins equal starts, with fallback when blocked or later", () => {
  const input = fixture([arrival("1")]); input.berths.push(berth("2"));
  input.arrivals[0].preferredBerthId = "2";
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].berthId, "2");
  input.berths[1].status = "maintenance";
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].berthId, "1");
  input.berths[1].status = "available";
  input.equipment.push(equipment("2"));
  input.arrivals = [arrival("1"), arrival("2", utc(8, 15))];
  input.arrivals[0].preferredBerthId = "1"; input.arrivals[1].preferredBerthId = "1";
  const result = scheduleFcfs(input, assumptions(input));
  assert.equal(result.assignments[1].berthId, "2"); assert.equal(result.assignments[1].serviceStartUtc, utc(8, 15));
});

test("unavailable or insufficient equipment returns explicit reasons", () => {
  for (const status of ["in_use", "maintenance", "out_of_service"]) {
    const input = fixture([arrival("1")]); input.equipment[0].status = status;
    assert.equal(scheduleFcfs(input, assumptions(input)).unscheduled[0].reason, "INSUFFICIENT_EQUIPMENT");
  }
  const input = fixture([arrival("1")]), config = assumptions(input);
  config.equipmentRequirements[0].requirements[0].count = 2;
  assert.equal(scheduleFcfs(input, config).unscheduled[0].reason, "INSUFFICIENT_EQUIPMENT");
  input.equipment = [];
  assert.equal(scheduleFcfs(input, assumptions(input)).unscheduled[0].reason, "INSUFFICIENT_EQUIPMENT");
});

test("equipment capabilities and berth restrictions are honored without inferred capacities", () => {
  const input = fixture([arrival("1")]); input.berths.push(berth("2"));
  input.equipment[0].assignedBerthId = "2";
  input.arrivals[0].preferredBerthId = "1";
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].berthId, "2");
  const config = assumptions(input); config.equipmentRequirements[0].requirements[0].minimumCapacityTonnes = 6;
  assert.equal(scheduleFcfs(input, config).unscheduled[0].reason, "INSUFFICIENT_EQUIPMENT");
  input.equipment[0].capacityTonnes = null;
  config.equipmentRequirements[0].requirements[0].minimumCapacityTonnes = 1;
  assert.equal(scheduleFcfs(input, config).assignments.length, 0);
  input.equipment[0].capacityTonnes = 5;
  input.equipment[0].type = "terminal_tractor";
  assert.equal(scheduleFcfs(input, config).assignments.length, 0);
});

test("multiple equipment types and counts are reserved together for the full service", () => {
  const input = fixture(); input.berths.push(berth("2"));
  input.equipment = [equipment("1"), equipment("2"), equipment("3", "terminal_tractor")];
  const config = assumptions(input);
  for (const entry of config.equipmentRequirements) entry.requirements = [{ type: "forklift", count: 2 }, { type: "terminal_tractor", count: 1 }];
  const result = scheduleFcfs(input, config);
  assert.deepEqual(result.assignments[0].equipmentIds, ["1", "2", "3"]);
  assert.deepEqual(result.assignments[1].equipmentIds, ["1", "2", "3"]);
  assert.equal(result.assignments[1].serviceStartUtc, result.assignments[0].completionTimeUtc);
});

test("never starts before ETA or horizon, normalizes timezone offsets and crosses midnight in UTC", () => {
  const input = fixture([arrival("1", "2026-11-09T08:00:00-06:00")]);
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].serviceStartUtc, utc(14));
  input.arrivals[0].plannedEta = utc(4);
  assert.equal(scheduleFcfs(input, assumptions(input)).assignments[0].serviceStartUtc, utc(6));
  input.arrivals[0].plannedEta = utc(23, 30);
  const result = scheduleFcfs(input, assumptions(input, "2026-11-10T02:00:00Z"));
  assert.equal(result.assignments[0].completionTimeUtc, "2026-11-10T00:30:00.000Z");
});

test("horizon limits return unscheduled calls and allow exact boundary completion", () => {
  const input = fixture([arrival("1"), arrival("2")]);
  const result = scheduleFcfs(input, assumptions(input, utc(9)));
  assert.equal(result.assignments.length, 1); assert.equal(result.assignments[0].completionTimeUtc, utc(9));
  assert.equal(result.unscheduled[0].arrivalId, "2"); assert.equal(result.unscheduled[0].reason, "NO_SLOT_IN_HORIZON");
  input.arrivals[0].plannedEta = utc(20);
  assert.equal(scheduleFcfs(input, assumptions(input)).unscheduled[0].reason, "NO_SLOT_IN_HORIZON");
});

test("strict FCFS does not allow later calls to start ahead of an earlier waiting call", () => {
  const input = fixture([arrival("1", utc(8), 120), arrival("2", utc(8, 10), 30), arrival("3", utc(8, 20), 20)]);
  input.berths.push(berth("2")); input.equipment = [equipment("1", "forklift", "1"), equipment("2", "terminal_tractor", "2")];
  const config = assumptions(input); config.equipmentRequirements[2].requirements[0].type = "terminal_tractor";
  const result = scheduleFcfs(input, config);
  assert.deepEqual(result.assignments.map(a => a.serviceStartUtc), [utc(8), utc(10), utc(10)]);
});

test("missing required inputs are explicit; one infeasible arrival does not discard later work", () => {
  const input = fixture(); input.arrivals[0].serviceDurationMinutes = null;
  input.arrivals[0].durationSource = "unknown";
  const config = assumptions(input), result = scheduleFcfs(input, config);
  assert.equal(result.unscheduled[0].reason, "MISSING_SERVICE_DURATION");
  assert.equal(result.assignments[0].arrivalId, "2");
  input.arrivals[0].serviceDurationMinutes = 60; input.arrivals[0].durationSource = "manager-planning-record";
  config.equipmentRequirements.shift();
  assert.equal(scheduleFcfs(input, config).unscheduled[0].reason, "MISSING_EQUIPMENT_REQUIREMENTS");
});

test("explicit berth-only requirements are allowed; missing requirements never assume zero equipment", () => {
  const input = fixture([arrival("1")]); input.equipment = [];
  const config = assumptions(input); config.equipmentRequirements[0].requirements = [];
  assert.equal(scheduleFcfs(input, config).assignments.length, 1);
  config.equipmentRequirements = [];
  assert.equal(scheduleFcfs(input, config).unscheduled[0].reason, "MISSING_EQUIPMENT_REQUIREMENTS");
});

test("empty inputs return deterministic zero metrics and no invented assignments", () => {
  const input = { arrivals: [], berths: [], equipment: [], assumptions: [] };
  const result = scheduleFcfs(input, assumptions(input));
  assert.deepEqual(result.assignments, []); assert.deepEqual(result.unscheduled, []);
  assert.deepEqual(result.metrics, { scheduledCount: 0, unscheduledCount: 0, totalWaitingMinutes: 0, averageWaitingMinutes: 0, lastCompletionTimeUtc: null });
});

test("function is pure, preserves assumption provenance, and returns independent output objects", () => {
  const input = fixture(), config = assumptions(input);
  const before = structuredClone({ input, config }); deepFreeze(input); deepFreeze(config);
  const result = scheduleFcfs(input, config);
  assert.deepEqual(scheduleFcfs(input, config), result);
  assert.deepEqual({ input, config }, before);
  result.assumptions.equipmentRequirements[0].requirements[0].count = 99;
  assert.equal(config.equipmentRequirements[0].requirements[0].count, 1);
  assert.equal(result.assumptions.availableResources.source, "simulated");
});

test("simulated durations require matching provenance and sub-millisecond work rounds up", () => {
  const input = fixture([arrival("1", utc(8), 0.000001)]);
  input.arrivals[0].durationSource = "simulated";
  assert.throws(() => scheduleFcfs(input, assumptions(input)), /matching input provenance/);
  input.assumptions.push({ kind: "simulated", path: "arrivals.1.serviceDurationMinutes", value: 0.000001, unit: "minutes", note: "Synthetic tiny-duration boundary test" });
  const result = scheduleFcfs(input, assumptions(input));
  assert.equal(result.assignments[0].completionTimeUtc, "2026-11-09T08:00:00.001Z");
  assert.ok(result.assignments[0].serviceDurationMinutes >= 0.000001);
  assert.deepEqual(result.inputAssumptions, input.assumptions);
});

test("malformed assumptions and invalid records are rejected before assignment", () => {
  const changes = [
    (i, c) => { c.horizonEndUtc = c.horizonStartUtc; },
    (i, c) => { c.availableResources.note = ""; },
    (i, c) => { c.equipmentRequirements[0].requirements[0].count = 0; },
    (i, c) => { c.equipmentRequirements[0].requirements[0].minimumCapacityTonnes = -1; },
    (i, c) => { c.equipmentRequirements[0].requirements.push({ type: "forklift", count: 1 }); },
    (i, c) => { c.equipmentRequirements[0].arrivalId = "missing"; },
    i => { i.arrivals[0].plannedEta = "2026-02-30T08:00:00Z"; },
    i => { i.arrivals[0].plannedEta = "2026-11-09T08:00"; },
    i => { i.arrivals[0].serviceDurationMinutes = -5; },
    i => { i.equipment[0].assignedBerthId = "unknown"; },
    i => { i.arrivals.push({ ...i.arrivals[0] }); },
  ];
  for (const change of changes) {
    const input = fixture([arrival("1")]), config = assumptions(input); change(input, config);
    assert.throws(() => scheduleFcfs(input, config), TypeError);
  }
});
