import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { test, type TestContext } from "node:test";
import express from "express";
import session from "express-session";
import { buildSchedulingInputs, SchedulingInputValidationError, type SchedulingInputConfiguration } from "../../../packages/core/dist/index.js";
import { loadSchedulingInputs } from "../src/services/schedulingInputService.js";
import { createOptimizationRouter } from "../src/routes/optimizationRoutes.js";

// All identities, quantities and timestamps here are synthetic software test inputs.
function fixture(portId = "10", code = "gulfport") {
  return {
    port: { id: portId, code },
    berths: [{ id: "9007199254740993", port_id: portId, berth_number: 1, name: "Synthetic berth", status: "available", max_length_m: "150.25" as string | null, max_draft_m: "7.50" as string | null }],
    equipment: [{ id: "31", port_id: portId, equipment_code: "SYN-F1", equipment_type: "forklift", capacity_tonnes: "5.25" as string | null,
      energy_type: "electric", status: "available", assigned_berth_id: "9007199254740993" as string | null }],
    arrivals: [{ id: "41", port_id: portId, mmsi: "100000001", vessel_name: "Synthetic planning vessel", planned_eta: "2026-11-09T08:00:00-06:00" as string | Date,
      cargo_type: "general", workload_quantity: "200.50", workload_unit: "tonnes", estimated_service_hours: "2.50" as string | null,
      preferred_berth_id: "9007199254740993" as string | null, status: "planned" }],
  };
}

test("normalizes planning records with explicit units, UTC times and lossless IDs", () => {
  const raw = fixture(), before = structuredClone(raw);
  const result = buildSchedulingInputs(raw);
  assert.deepEqual(raw, before);
  assert.equal(result.source, "manager-planning-records");
  assert.equal(result.port.id, "10"); assert.equal(result.berths[0].id, "9007199254740993");
  assert.equal(result.arrivals[0].plannedEta, "2026-11-09T14:00:00.000Z");
  assert.equal(result.arrivals[0].serviceDurationMinutes, 150);
  assert.equal(result.arrivals[0].durationSource, "manager-planning-record");
  assert.deepEqual(result.arrivals[0].workload, { quantity: 200.5, unit: "tonnes" });
  assert.equal(result.berths[0].maxLengthM, 150.25); assert.equal(result.equipment[0].capacityTonnes, 5.25);
  assert.equal(result.equipment[0].productivity, null); assert.equal(result.arrivals[0].equipmentRequirements, null);
  assert.deepEqual(result.assumptions, []);
  assert.equal(result.readyForScheduling, true); // Minimum duration-based input completeness only.
  assert.ok(result.issues.some(i => i.code === "UNKNOWN_PRODUCTIVITY"));
  assert.ok(result.issues.some(i => i.code === "UNKNOWN_AVAILABILITY_WINDOWS"));
  assert.ok(result.issues.some(i => i.code === "UNKNOWN_EQUIPMENT_REQUIREMENTS"));
  raw.arrivals[0].planned_eta = new Date("2026-11-09T14:00:00Z");
  assert.equal(buildSchedulingInputs(raw).arrivals[0].plannedEta, result.arrivals[0].plannedEta);
});

test("active statuses and distinct cargo/workload units are preserved; finished arrivals are excluded", () => {
  const raw = fixture();
  raw.arrivals.push({ ...raw.arrivals[0], id: "42", status: "arrived", cargo_type: "containers", workload_unit: "container_moves" },
    { ...raw.arrivals[0], id: "43", status: "in_service", cargo_type: "roro", workload_unit: "vehicle_moves" },
    { ...raw.arrivals[0], id: "44", status: "cancelled", estimated_service_hours: null },
    { ...raw.arrivals[0], id: "45", status: "completed", estimated_service_hours: null });
  const result = buildSchedulingInputs(raw);
  assert.deepEqual(result.arrivals.map(a => a.id), ["41", "42", "43"]);
  assert.deepEqual(result.arrivals.map(a => a.workload.unit), ["tonnes", "container_moves", "vehicle_moves"]);
  assert.ok(!result.issues.some(i => i.code === "MISSING_SERVICE_DURATION"));
});

test("missing durations/resources produce actionable errors without fabricated rates or dimensions", () => {
  const raw = fixture(); raw.arrivals[0].estimated_service_hours = null;
  raw.berths[0].max_draft_m = null; raw.equipment[0].capacity_tonnes = null;
  raw.equipment[0].status = "maintenance"; raw.berths[0].status = "occupied";
  const result = buildSchedulingInputs(raw);
  assert.equal(result.readyForScheduling, false);
  assert.equal(result.arrivals[0].serviceDurationMinutes, null);
  assert.equal(result.arrivals[0].durationSource, "unknown");
  assert.equal(result.berths[0].maxDraftM, null); assert.equal(result.equipment[0].capacityTonnes, null);
  assert.equal(result.berths[0].availableForPlanning, false); assert.equal(result.equipment[0].availableForPlanning, false);
  for (const code of ["MISSING_SERVICE_DURATION", "NO_AVAILABLE_BERTHS", "NO_AVAILABLE_EQUIPMENT", "UNKNOWN_BERTH_LIMIT", "UNKNOWN_EQUIPMENT_CAPACITY", "PREFERRED_BERTH_UNAVAILABLE"]) {
    assert.ok(result.issues.some(i => i.code === code), code);
  }
  assert.deepEqual(result.assumptions, []);
  const empty = buildSchedulingInputs({ port: raw.port, berths: [], equipment: [], arrivals: [] });
  assert.equal(empty.readyForScheduling, false); assert.deepEqual(empty.arrivals, []);
  assert.ok(empty.issues.some(i => i.code === "NO_ACTIVE_ARRIVALS"));
});

test("simulated duration is opt-in, validated, attributed and never replaces a manager value", () => {
  const raw = fixture(); raw.arrivals[0].estimated_service_hours = null;
  const config: SchedulingInputConfiguration = { simulatedServiceDurations: [{ arrivalId: "41", minutes: 90, note: "Synthetic demonstration assumption, not measured productivity" }] };
  const result = buildSchedulingInputs(raw, config);
  assert.equal(result.arrivals[0].durationSource, "simulated"); assert.equal(result.arrivals[0].serviceDurationMinutes, 90);
  assert.deepEqual(result.assumptions, [{ kind: "simulated", path: "arrivals.41.serviceDurationMinutes", value: 90, unit: "minutes", note: config.simulatedServiceDurations![0].note }]);
  raw.arrivals[0].estimated_service_hours = "1.25";
  assert.equal(buildSchedulingInputs(raw, config).arrivals[0].serviceDurationMinutes, 75);
  assert.deepEqual(buildSchedulingInputs(raw, config).assumptions, []);
  for (const config of [{ defaultProductivity: 100 }, { simulatedServiceDurations: {} },
    { simulatedServiceDurations: [{ arrivalId: "41", minutes: 0, note: "synthetic" }] },
    { simulatedServiceDurations: [{ arrivalId: "41", minutes: 90, note: "" }] },
    { simulatedServiceDurations: [{ arrivalId: "41", minutes: 90, note: "synthetic" }, { arrivalId: "41", minutes: 60, note: "duplicate" }] }]) {
    assert.throws(() => buildSchedulingInputs(raw, config as SchedulingInputConfiguration), SchedulingInputValidationError);
  }
});

test("runtime validation fails closed on foreign-port records, references, units and invalid values", () => {
  const mutate: ((s: ReturnType<typeof fixture>) => void)[] = [
    s => { s.berths[0].port_id = "20"; }, s => { s.equipment[0].port_id = "20"; }, s => { s.arrivals[0].port_id = "20"; },
    s => { s.equipment[0].assigned_berth_id = "99"; }, s => { s.arrivals[0].preferred_berth_id = "99"; },
    s => { s.arrivals[0].workload_unit = "container_moves"; }, s => { s.arrivals[0].workload_quantity = "NaN"; },
    s => { s.arrivals[0].estimated_service_hours = "0"; }, s => { s.arrivals[0].mmsi = "bad"; },
    s => { s.arrivals[0].planned_eta = "2026-11-09T08:00"; }, s => { s.arrivals[0].planned_eta = "2026-02-30T08:00:00Z"; },
    s => { s.equipment[0].capacity_tonnes = "-1"; }, s => { s.equipment[0].equipment_type = "invented"; },
    s => { s.berths[0].max_length_m = "0"; }, s => { s.arrivals.push({ ...s.arrivals[0] }); },
    s => { s.equipment[0].id = "90071992547409939999999"; },
  ];
  for (const change of mutate) {
    const raw = fixture(); change(raw);
    assert.throws(() => buildSchedulingInputs(raw), (error: unknown) => error instanceof SchedulingInputValidationError && error.issues[0].path.length > 0);
  }
  for (const raw of [null, {}, { ...fixture(), berths: null }]) assert.throws(() => buildSchedulingInputs(raw), SchedulingInputValidationError);
});

function database() {
  const calls: string[] = []; let released = 0; let failAt = ""; let leak = false;
  const snapshots = { "10": fixture(), "20": fixture("20", "miami") };
  const db = { async connect() { return {
    async query(sql: string, params: string[] = []) {
      calls.push(sql);
      assert.ok(!/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(sql));
      assert.ok(!/\b(?:vessels|vessel_positions|operating_scenarios)\b/.test(sql));
      if (failAt && sql.includes(failAt)) throw new Error("private database connection information");
      if (sql.includes("FROM port_manager_assignments")) {
        assert.match(sql, /u\.is_active = TRUE/); assert.match(sql, /u\.role = 'port_manager'/);
        return { rows: params[0] === "gulf-manager" ? [snapshots["10"].port] : params[0] === "miami-manager" ? [snapshots["20"].port] : [] };
      }
      if (sql.includes("FROM manager_")) {
        assert.match(sql, /WHERE port_id = \$1/);
        const snapshot = snapshots[params[0] as "10" | "20"];
        if (sql.includes("FROM manager_berths")) return { rows: leak ? fixture("99").berths : snapshot.berths };
        if (sql.includes("FROM manager_equipment")) return { rows: snapshot.equipment };
        assert.match(sql, /status NOT IN \('cancelled', 'completed'\)/);
        return { rows: snapshot.arrivals };
      }
      return { rows: [] };
    }, release() { released++; },
  }; } };
  return { db: db as unknown as Parameters<typeof createOptimizationRouter>[0], calls, snapshots,
    released: () => released, fail: (part: string) => { failAt = part; }, leak: () => { leak = true; } };
}

test("loader uses a consistent read-only transaction and releases/rolls back on failure", async () => {
  const store = database();
  assert.equal((await loadSchedulingInputs("gulf-manager", store.db)).port.code, "gulfport");
  assert.equal(store.calls[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(store.calls.at(-1), "COMMIT"); assert.equal(store.released(), 1);
  store.fail("FROM manager_equipment");
  await assert.rejects(loadSchedulingInputs("gulf-manager", store.db));
  assert.equal(store.calls.at(-1), "ROLLBACK"); assert.equal(store.released(), 2);
});

async function serve(t: TestContext, store: ReturnType<typeof database>) {
  const app = express(); app.use(express.json());
  app.use(session({ secret: "synthetic-inputs-test-session-secret", resave: false, saveUninitialized: false }));
  app.post("/test/session", (req, res) => { req.session.managerId = req.body.managerId; res.json({ ok: true }); });
  app.use("/api/optimization", createOptimizationRouter(store.db));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async login(managerId: string) {
      const response = await fetch(`${base}/test/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managerId }) });
      const cookie = response.headers.get("set-cookie"); assert.ok(cookie); return cookie.split(";")[0];
    },
    get: (cookie = "", query = "") => fetch(`${base}/api/optimization/inputs${query}`, { headers: { Cookie: cookie } }),
  };
}

test("inspection endpoint enforces session, active port assignment and forbids port overrides", async t => {
  const store = database(), api = await serve(t, store);
  assert.equal((await api.get()).status, 401); assert.equal(store.calls.length, 0);
  assert.equal((await api.get("connect.sid=forged")).status, 401);
  const invalid = await api.login("inactive-or-unassigned");
  assert.equal((await api.get(invalid)).status, 403); assert.equal(store.calls.at(-1), "ROLLBACK");
  for (const manager of ["gulf-manager", "miami-manager"]) {
    const cookie = await api.login(manager);
    assert.equal((await api.get(cookie, "?port_id=999")).status, 400);
    assert.equal((await api.get(cookie, "?simulatedServiceDuration=1")).status, 400);
    const response = await api.get(cookie); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).port.code, manager === "gulf-manager" ? "gulfport" : "miami");
  }
});

test("inspection returns useful incompleteness issues, rejects foreign records, and sanitizes outages", async t => {
  const store = database(), api = await serve(t, store), cookie = await api.login("gulf-manager");
  store.snapshots["10"].arrivals[0].estimated_service_hours = null;
  const incomplete = await api.get(cookie); assert.equal(incomplete.status, 200);
  const body = await incomplete.json(); assert.equal(body.readyForScheduling, false);
  assert.ok(body.issues.some((i: { code: string }) => i.code === "MISSING_SERVICE_DURATION"));
  store.leak();
  const foreign = await api.get(cookie); assert.equal(foreign.status, 422);
  assert.equal((await foreign.json()).issues[0].code, "CROSS_PORT_RECORD");
  store.fail("FROM manager_berths");
  const failure = await api.get(cookie); assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("private database"));
});
