import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { app } from "../src/app.js";
import { saveVessel, type Vessel } from "../src/ais/vesselStore.js";
import { pool } from "../src/config/db.js";
import { getVesselRegion } from "../src/utils/vesselRegion.js";

// All observations in this suite are synthetic test data.
function observation(mmsi: number, latitude: number, longitude: number): Vessel {
  return { mmsi, name: "Synthetic test vessel", latitude, longitude,
    speedKnots: null, lastUpdated: "2026-01-01T00:00:00.000Z" };
}

test("monitoring rectangles include edges and exclude observations outside", () => {
  for (const [region, south, north, west, east] of [
    ["gulfport", 30.05, 30.55, -89.35, -88.80],
    ["miami", 25.603, 25.835, -80.208, -79.879],
  ] as const) {
    for (const lat of [south, north]) {
      for (const lon of [west, east]) assert.equal(getVesselRegion(lat, lon), region);
    }
    const lat = (south + north) / 2;
    const lon = (west + east) / 2;
    for (const [y, x] of [[south - 0.001, lon], [north + 0.001, lon],
      [lat, west - 0.001], [lat, east + 0.001]]) {
      assert.equal(getVesselRegion(y, x), "other");
    }
  }
});

test("vessel HTTP endpoints isolate latest observations and preserve compatibility", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function list(query = "") {
    const response = await fetch(`${base}/api/vessels${query}`);
    assert.equal(response.status, 200);
    return response.json();
  }

  assert.deepEqual(await list("?region=gulfport"), { count: 0, vessels: [] });
  assert.deepEqual(await list("?region=miami"), { count: 0, vessels: [] });
  const gulfport = observation(100000001, 30.3, -89.1);
  const miami = observation(100000002, 25.7, -80.1);
  const other = observation(100000003, 0, 0);
  [gulfport, miami, other].forEach(saveVessel);
  assert.deepEqual(await list("?region=gulfport"), { count: 1, vessels: [gulfport] });
  assert.deepEqual(await list("?region=miami"), { count: 1, vessels: [miami] });
  assert.deepEqual(await list(), { count: 3, vessels: [gulfport, miami, other] });

  const moved = { ...gulfport, latitude: miami.latitude, longitude: miami.longitude,
    lastUpdated: "2026-01-01T00:01:00.000Z" };
  saveVessel(moved);
  assert.deepEqual(await list("?region=gulfport"), { count: 0, vessels: [] });
  assert.deepEqual(await list("?region=miami"), { count: 2, vessels: [moved, miami] });
  saveVessel({ ...moved, latitude: 0, longitude: 0 });
  saveVessel({ ...miami, latitude: gulfport.latitude, longitude: gulfport.longitude });
  assert.deepEqual(await list("?region=miami"), { count: 0, vessels: [] });
  assert.deepEqual((await list("?region=gulfport")).vessels.map((v: Vessel) => v.mmsi), [miami.mmsi]);

  for (const query of ["region=other", "region=", "region=Gulfport", "region=unknown",
    "region=gulfport&region=miami", "region[]=gulfport", "region[name]=miami"]) {
    const response = await fetch(`${base}/api/vessels?${query}`);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: "Region must be gulfport or miami" });
  }

  // Stub only the database transport; exercise the existing history route and repository.
  const queryMock = t.mock.method(pool, "query", async (_sql: string, values: unknown[]) => {
    assert.deepEqual(values, [100000001, 2]);
    return { rows: [] };
  });
  const history = await fetch(`${base}/api/vessels/100000001/history?limit=2`);
  assert.equal(history.status, 200);
  assert.deepEqual(await history.json(), { mmsi: 100000001, count: 0, positions: [] });
  assert.equal(queryMock.mock.callCount(), 1);
  for (const path of ["bad/history", "100000001/history?limit=0", "100000001/history?limit=abc"]) {
    assert.equal((await fetch(`${base}/api/vessels/${path}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
