import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { test, type TestContext } from "node:test";
import express from "express";
import session from "express-session";
import { pool } from "../src/config/db.js";
import { createBerthRouter, validateBerthPatch } from "../src/routes/berthRoutes.js";

// Synthetic fixtures and a private test-only login harness. Production auth is unchanged.
async function serve(t: TestContext, db: Parameters<typeof createBerthRouter>[0]) {
  const app = express(); app.use(express.json());
  app.use(session({ secret: "synthetic-berth-test-session-secret", resave: false, saveUninitialized: false }));
  app.post("/test/session", (req, res) => { req.session.managerId = req.body.managerId; res.json({ ok: true }); });
  app.use("/api/berths", createBerthRouter(db));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function login(managerId: string) {
    const response = await fetch(`${base}/test/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managerId }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie"); assert.ok(cookie);
    return cookie.split(";")[0];
  }
  return {
    login,
    get: (cookie = "", query = "") => fetch(`${base}/api/berths${query}`, { headers: { Cookie: cookie } }),
    patch: (cookie: string, id: string, body: unknown) => fetch(`${base}/api/berths/${id}`, {
      method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  };
}

function fixtureDatabase() {
  const rows = ["10", "20"].flatMap((port, p) => [1, 2, 3].map(n => ({
    id: String(p * 3 + n), port_id: port, berth_number: n, name: `Synthetic berth ${p}-${n}`,
    status: "available", max_length_m: "100.00" as string | number | null, max_draft_m: null as string | number | null,
  })));
  let fail = false;
  const db = {
    async query(sql: string, params: unknown[]) {
      if (fail) throw new Error("private database details");
      if (sql.includes("FROM port_manager_assignments")) {
        assert.match(sql, /u\.is_active = TRUE/); assert.match(sql, /u\.role = 'port_manager'/);
        const port = params[0] === "gulf-manager" ? "10" : params[0] === "miami-manager" ? "20" : null;
        return { rows: port ? [{ port_id: port }] : [] };
      }
      if (sql.includes("UPDATE manager_berths")) {
        assert.match(sql, /WHERE id = \$1 AND port_id = \$2/);
        const row = rows.find(r => r.id === params[0] && r.port_id === params[1]);
        if (!row) return { rows: [] };
        Object.assign(row, JSON.parse(String(params[2])));
        return { rows: [{ ...row }] };
      }
      assert.match(sql, /FROM manager_berths WHERE port_id = \$1 ORDER BY berth_number ASC/);
      return { rows: rows.filter(r => r.port_id === params[0]).map(r => ({ ...r })) };
    },
  };
  return { rows, db: db as unknown as Parameters<typeof createBerthRouter>[0], setFailure: () => { fail = true; } };
}

test("berth payload validation accepts supported fields and rejects unsafe values", () => {
  for (const status of ["available", "occupied", "maintenance", "closed"]) assert.equal(validateBerthPatch({ status }), true);
  assert.equal(validateBerthPatch({ max_length_m: 125.25, max_draft_m: null }), true);
  for (const body of [undefined, null, [], {}, { port_id: 2 }, { name: "override" }, { status: null },
    { status: "scheduled" }, { status: "AVAILABLE" }, { max_length_m: "100" }, { max_length_m: true },
    { max_length_m: 0 }, { max_draft_m: -1 }, { max_length_m: 100000000 }, { max_draft_m: 1000000 },
    { max_length_m: NaN }, { max_draft_m: Infinity }, { max_draft_m: 2.345 }, { status: "available", id: "3" }]) {
    assert.equal(validateBerthPatch(body), false);
  }
});

test("berths require a valid manager session and active port assignment", async t => {
  const api = await serve(t, fixtureDatabase().db);
  assert.equal((await api.get()).status, 401);
  assert.equal((await api.patch("", "1", { status: "closed" })).status, 401);
  const invalid = await api.login("inactive-or-unassigned");
  assert.equal((await api.get(invalid)).status, 403);
  assert.equal((await api.patch(invalid, "1", { status: "closed" })).status, 403);
  // An unsigned/forged session cookie cannot grant access.
  assert.equal((await api.get("connect.sid=forged")).status, 401);
});

test("manager port controls listing and modifications regardless of supplied port parameters", async t => {
  const fixture = fixtureDatabase(); const api = await serve(t, fixture.db);
  const gulf = await api.login("gulf-manager"), miami = await api.login("miami-manager");
  const gulfRows = await (await api.get(gulf, "?port_id=20")).json();
  assert.deepEqual(gulfRows.berths.map((b: { id: string }) => b.id), ["1", "2", "3"]);
  assert.deepEqual((await (await api.get(miami)).json()).berths.map((b: { id: string }) => b.id), ["4", "5", "6"]);
  const before = structuredClone(fixture.rows);
  assert.equal((await api.patch(gulf, "4", { status: "closed" })).status, 404);
  assert.equal((await api.patch(miami, "1", { status: "closed" })).status, 404);
  assert.equal((await api.patch(gulf, "1", { status: "closed", port_id: "20" })).status, 400);
  assert.deepEqual(fixture.rows, before);
});

test("PATCH supports all statuses, partial capacity updates and explicit unknown values", async t => {
  const fixture = fixtureDatabase(); const api = await serve(t, fixture.db);
  const cookie = await api.login("gulf-manager");
  for (const status of ["occupied", "maintenance", "closed", "available"]) {
    const response = await api.patch(cookie, "1", { status }); assert.equal(response.status, 200);
    assert.equal((await response.json()).berth.status, status);
  }
  assert.equal((await api.patch(cookie, "1", { max_length_m: 180.25, max_draft_m: 6.5 })).status, 200);
  assert.equal((await api.patch(cookie, "1", { status: "occupied" })).status, 200);
  assert.equal(fixture.rows[0].max_length_m, 180.25);
  assert.equal((await api.patch(cookie, "1", { max_draft_m: null })).status, 200);
  const reloaded = await (await api.get(cookie)).json();
  assert.equal(reloaded.berths[0].max_draft_m, null);
  assert.equal(reloaded.berths[0].max_length_m, 180.25);
  assert.equal(reloaded.berths[0].status, "occupied");
});

test("HTTP validation rejects invalid IDs/payloads without updating stored records", async t => {
  const fixture = fixtureDatabase(); const api = await serve(t, fixture.db);
  const cookie = await api.login("gulf-manager"), before = structuredClone(fixture.rows);
  for (const id of ["0", "-1", "abc", "1.5", "9223372036854775808", "99999999999999999999"]) {
    assert.equal((await api.patch(cookie, id, { status: "available" })).status, 400);
  }
  for (const body of [[], {}, { status: "unknown" }, { max_length_m: "" }, { max_draft_m: 0 }, { max_length_m: 1.234 }, { max_draft_m: 1000000 }]) {
    assert.equal((await api.patch(cookie, "1", body)).status, 400);
  }
  assert.equal((await api.patch(cookie, "999", { status: "closed" })).status, 404);
  assert.deepEqual(fixture.rows, before);
});

test("empty berth lists and sanitized database failures have explicit responses", async t => {
  const fixture = fixtureDatabase(); const api = await serve(t, fixture.db);
  const cookie = await api.login("gulf-manager");
  fixture.rows.splice(0, fixture.rows.length);
  assert.deepEqual(await (await api.get(cookie)).json(), { berths: [] });
  fixture.setFailure();
  const response = await api.get(cookie); assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("private database"));
});

test("PostgreSQL berth updates persist across requests and remain port-scoped", {
  skip: process.env.BERTH_POSTGRES_TEST !== "1",
}, async t => {
  const client = await pool.connect();
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  await client.query("BEGIN");
  // Use the existing schema shape, but only TEMP rows; never update saved inventory.
  await client.query("CREATE TEMP TABLE manager_berths (LIKE public.manager_berths INCLUDING ALL) ON COMMIT DROP");
  const managers = await client.query(`SELECT a.user_id::text, a.port_id::text, p.code
    FROM port_manager_assignments a JOIN users u ON u.id = a.user_id JOIN ports p ON p.id = a.port_id
    WHERE u.is_active AND u.role = 'port_manager' AND p.code IN ('gulfport', 'miami')`);
  const gulf = managers.rows.find(m => m.code === "gulfport"), miami = managers.rows.find(m => m.code === "miami");
  assert.ok(gulf && miami, "Both existing active manager assignments are needed for this opt-in test");
  await client.query(`INSERT INTO manager_berths (id, port_id, berth_number, name)
    VALUES (101, $1, 1, 'Synthetic test Gulfport berth'), (102, $2, 1, 'Synthetic test Miami berth')`, [gulf.port_id, miami.port_id]);
  const api = await serve(t, client);
  const gulfCookie = await api.login(gulf.user_id), miamiCookie = await api.login(miami.user_id);
  const result = await api.patch(gulfCookie, "101", { status: "maintenance", max_length_m: 150.25, max_draft_m: 7.5 });
  assert.equal(result.status, 200);
  const updated = (await result.json()).berth;
  assert.equal(updated.status, "maintenance"); assert.equal(Number(updated.max_length_m), 150.25);
  assert.equal((await api.patch(miamiCookie, "101", { status: "closed" })).status, 404);
  assert.equal((await api.patch(gulfCookie, "102", { status: "closed" })).status, 404);
  assert.equal((await api.patch(gulfCookie, "101", { status: "occupied" })).status, 200);
  const rows = (await (await api.get(gulfCookie)).json()).berths;
  assert.equal(rows.length, 1); assert.equal(rows[0].status, "occupied"); assert.equal(Number(rows[0].max_draft_m), 7.5);
  assert.equal((await api.patch(gulfCookie, "101", { max_draft_m: null })).status, 200);
  const stored = await client.query("SELECT status, max_length_m, max_draft_m FROM manager_berths WHERE id=101");
  assert.deepEqual(stored.rows[0], { status: "occupied", max_length_m: "150.25", max_draft_m: null });
});
