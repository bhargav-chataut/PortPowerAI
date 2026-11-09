import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import express from "express";
import { createOperationsRouter } from "../src/routes/operationsRoutes.js";
import { initializeOperations, scenarioRepository, type ScenarioRepository } from "../src/operations/scenarioRepository.js";
import { pool } from "../src/config/db.js";
import { createOperatingScenario, detectOperationsConflicts, validateOperatingScenario,
  berthStatus, equipmentStatus, equipmentWorkload, type OperatingScenario } from "../../../packages/core/dist/index.js";

test("fictional fixture is valid, deterministic, and has no scheduling conflicts", () => {
  const s = createOperatingScenario();
  assert.equal(s.synthetic, true);
  assert.deepEqual(validateOperatingScenario(s), []);
  assert.deepEqual(detectOperationsConflicts(s), []);
  assert.deepEqual(createOperatingScenario(), s);
  assert.equal(berthStatus(s, "b1", 600), "occupied");
  assert.equal(berthStatus(s, "b2", 600), "scheduled");
  assert.equal(berthStatus(s, "b3", 600), "available");
  assert.equal(berthStatus(s, "b1", 840), "scheduled");
  assert.equal(equipmentStatus(s, "f1", 600), "assigned");
  assert.equal(equipmentStatus(s, "f1", 720), "available");
  assert.equal(equipmentStatus(s, "y2", 600), "unavailable");
  assert.deepEqual(equipmentWorkload(s, "f1"), { taskCount: 2, assignedMinutes: 360 });
  assert.deepEqual(equipmentWorkload(s, "y2"), { taskCount: 0, assignedMinutes: 0 });
});

test("detects berth overlap and permits back-to-back berth calls", () => {
  const s = createOperatingScenario();
  s.vessels[2].arrival = 839;
  assert.ok(detectOperationsConflicts(s).some(c => c.code === "BERTH_OVERLAP"));
  s.vessels[2].arrival = 840;
  assert.ok(!detectOperationsConflicts(s).some(c => c.code === "BERTH_OVERLAP"));
});

test("detects equipment overlap, availability, type, missing assignment and call window conflicts", () => {
  const s = createOperatingScenario();
  s.tasks[2].start = 600;
  let codes = detectOperationsConflicts(s).map(c => c.code);
  assert.ok(codes.includes("EQUIPMENT_OVERLAP"));
  assert.ok(codes.includes("TASK_OUTSIDE_CALL"));
  s.tasks[2].start = 720;
  assert.ok(!detectOperationsConflicts(s).some(c => c.code === "EQUIPMENT_OVERLAP"));
  s.tasks[0].equipmentIds = ["y2"];
  codes = detectOperationsConflicts(s).map(c => c.code);
  assert.ok(codes.includes("EQUIPMENT_UNAVAILABLE"));
  assert.ok(codes.includes("EQUIPMENT_KIND"));
  s.tasks[0].equipmentIds = [];
  assert.ok(detectOperationsConflicts(s).some(c => c.code === "UNASSIGNED_TASK"));
  s.equipment[0].availableFrom = 600;
  s.tasks[0].equipmentIds = ["f1"];
  assert.ok(detectOperationsConflicts(s).some(c => c.code === "EQUIPMENT_UNAVAILABLE"));
});

test("rejects malformed data, false provenance, invalid ranges, duplicates and references", () => {
  for (const input of [null, {}, [], { ...createOperatingScenario(), synthetic: false },
    { ...createOperatingScenario(), revision: 0 }, { ...createOperatingScenario(), tasks: [null] }]) {
    assert.ok(validateOperatingScenario(input).length);
  }
  const mutations: ((s: OperatingScenario) => void)[] = [
    s => { s.vessels[0].berthId = "unknown"; },
    s => { s.tasks[0].vesselId = "unknown"; },
    s => { s.tasks[0].equipmentIds = ["unknown"]; },
    s => { s.tasks[0].equipmentIds = ["f1", "f1"]; },
    s => { s.tasks[0].duration = -1; },
    s => { s.tasks[0].duration = NaN; },
    s => { s.tasks[0].start = 1400; },
    s => { s.vessels[0].departure = s.vessels[0].arrival; },
    s => { s.equipment[0].availableUntil = 1441; },
    s => { s.equipment[0].id = s.equipment[1].id; },
  ];
  for (const mutate of mutations) {
    const s = createOperatingScenario(); mutate(s);
    assert.ok(validateOperatingScenario(s).length);
    assert.throws(() => detectOperationsConflicts(s));
  }
  const empty = { ...createOperatingScenario(), vessels: [], tasks: [], equipment: [] };
  assert.deepEqual(validateOperatingScenario(empty), []);
  assert.deepEqual(detectOperationsConflicts(empty), []);
});

test("scenario API retrieves, saves conflicts as drafts, rejects invalid and stale updates", async t => {
  let stored = createOperatingScenario();
  const repository: ScenarioRepository = {
    async get(id) { return id === stored.id ? structuredClone(stored) : null; },
    async save(s) {
      if (s.revision !== stored.revision) return null;
      stored = { ...structuredClone(s), revision: s.revision + 1 };
      return stored;
    },
  };
  const app = express(); app.use(express.json());
  app.use("/api/operations/scenarios", createOperationsRouter(repository));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/operations/scenarios/`;
  const put = (body: unknown, id = stored.id) => fetch(base + id, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(base + "missing")).status, 404);
  const initial = await (await fetch(base + stored.id)).json();
  assert.equal(initial.persistence, "postgres");
  assert.equal(initial.scenario.synthetic, true);
  assert.equal((await put({ ...stored, synthetic: false })).status, 400);
  assert.equal((await put(stored, "different" as typeof stored.id)).status, 400);
  const conflicting = structuredClone(stored);
  conflicting.vessels[2].arrival = 800;
  const result = await put(conflicting); assert.equal(result.status, 200);
  const saved = await result.json(); assert.equal(saved.scenario.revision, 2);
  assert.ok(saved.conflicts.some((c: { code: string }) => c.code === "BERTH_OVERLAP"));
  assert.equal((await put(conflicting)).status, 409);
  assert.equal((await (await fetch(base + stored.id)).json()).scenario.revision, 2);
  t.mock.method(repository, "get", async () => { throw new Error("private connection details"); });
  const failed = await fetch(base + stored.id); assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private connection"));
});

test("PostgreSQL migrates legacy scenarios, saves relational rows atomically and prevents lost updates", {
  skip: process.env.OPERATIONS_POSTGRES_TEST !== "1",
}, async t => {
  // All DDL/data stays in a unique test schema, cleaned up after the test.
  const schema = `operations_test_${process.pid}_${Date.now()}`;
  const admin = await pool.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const testPool = new Pool({ ...pool.options, options: `-c search_path=${schema}` });
  t.after(async () => {
    await testPool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    admin.release(); await pool.end();
  });
  const queryMock = t.mock.method(pool, "query", testPool.query.bind(testPool));
  const connectMock = t.mock.method(pool, "connect", testPool.connect.bind(testPool));
  await testPool.query(await readFile(new URL("../migrations/001_operating_scenarios.sql", import.meta.url), "utf8"));
  const legacy = createOperatingScenario();
  legacy.revision = 7; legacy.equipment[0].name = "Synthetic edited forklift";
  await testPool.query("INSERT INTO operating_scenarios (id, revision, document) VALUES ($1, $2, $3)", [legacy.id, legacy.revision, legacy]);
  await initializeOperations();
  const first = await scenarioRepository.get("gulfport-demo-v1"); assert.ok(first);
  assert.deepEqual(first, legacy);
  const counts = await testPool.query(`SELECT
    (SELECT count(*)::int FROM berths) AS berths,
    (SELECT count(*)::int FROM vessel_calls) AS calls,
    (SELECT count(*)::int FROM equipment) AS equipment,
    (SELECT count(*)::int FROM cargo_tasks) AS tasks,
    (SELECT count(*)::int FROM task_equipment_assignments) AS assignments`);
  assert.deepEqual(counts.rows[0], { berths: 3, calls: 3, equipment: 6, tasks: 4, assignments: 7 });
  first.name = "Synthetic edited plan";
  first.tasks[0].equipmentIds = ["f3"];
  const saved = await scenarioRepository.save(first); assert.equal(saved?.revision, 8);
  assert.deepEqual(await scenarioRepository.get(first.id), saved);
  assert.deepEqual((await testPool.query("SELECT equipment_id FROM task_equipment_assignments WHERE task_id = 't1'")).rows, [{ equipment_id: "f3" }]);
  await initializeOperations();
  assert.equal((await scenarioRepository.get(first.id))?.name, "Synthetic edited plan");
  assert.equal(await scenarioRepository.save(first), null);
  const updates = await Promise.all([
    scenarioRepository.save({ ...saved!, name: "Synthetic planner A" }),
    scenarioRepository.save({ ...saved!, name: "Synthetic planner B" }),
  ]);
  assert.equal(updates.filter(Boolean).length, 1);
  assert.equal((await scenarioRepository.get(first.id))?.revision, 9);

  // A database failure halfway through a save must preserve every old row/revision.
  await testPool.query(`CREATE FUNCTION reject_test_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'Synthetic failing insert' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_test_equipment BEFORE INSERT ON equipment FOR EACH ROW EXECUTE FUNCTION reject_test_equipment()`);
  const beforeFailure = await scenarioRepository.get(first.id); assert.ok(beforeFailure);
  const failing = structuredClone(beforeFailure);
  failing.equipment[0].name = "Synthetic failing insert";
  await assert.rejects(scenarioRepository.save(failing), /test failure/);
  assert.deepEqual(await scenarioRepository.get(first.id), beforeFailure);
  await assert.rejects(testPool.query("INSERT INTO task_equipment_assignments (scenario_id, task_id, equipment_id, sort_order) VALUES ($1, 't1', 'missing', 0)", [first.id]), /foreign key/);
  await assert.rejects(testPool.query("UPDATE equipment SET synthetic = FALSE WHERE id = 'f1'"), /check constraint/);
  await assert.rejects(testPool.query("UPDATE cargo_tasks SET duration_minutes = 0 WHERE id = 't1'"), /check constraint/);

  const empty = { ...beforeFailure, vessels: [], tasks: [], equipment: [] };
  const emptySaved = await scenarioRepository.save(empty); assert.ok(emptySaved);
  assert.deepEqual(await scenarioRepository.get(first.id), emptySaved);
  await initializeOperations();
  assert.deepEqual(await scenarioRepository.get(first.id), emptySaved);
  queryMock.mock.restore(); connectMock.mock.restore();
});
