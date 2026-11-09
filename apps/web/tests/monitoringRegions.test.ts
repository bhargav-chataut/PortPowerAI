import assert from "node:assert/strict";
import { test } from "node:test";
import { MONITORING_REGIONS, isInMonitoringRegion } from "../src/utils/monitoringRegions.ts";
import { fetchVessels, fetchVesselHistory } from "../src/services/vesselApi.ts";

test("synthetic observations stay within their monitoring rectangle", () => {
  const gulfport = { latitude: 30.3, longitude: -89.1 };
  const miami = { latitude: 25.7, longitude: -80.1 };
  for (const region of ["gulfport", "miami"] as const) {
    const bounds = MONITORING_REGIONS[region];
    assert.equal(isInMonitoringRegion(region === "gulfport" ? gulfport : miami, region), true);
    assert.equal(isInMonitoringRegion(region === "gulfport" ? miami : gulfport, region), false);
    assert.equal(isInMonitoringRegion({ latitude: 0, longitude: 0 }, region), false);
    assert.equal(isInMonitoringRegion({ latitude: NaN, longitude: bounds.center[1] }, region), false);
    for (const latitude of [bounds.south, bounds.north]) {
      for (const longitude of [bounds.west, bounds.east]) {
        assert.equal(isInMonitoringRegion({ latitude, longitude }, region), true);
      }
    }
    assert.ok(Math.abs(bounds.center[0] - (bounds.south + bounds.north) / 2) < 1e-10);
    assert.ok(Math.abs(bounds.center[1] - (bounds.west + bounds.east) / 2) < 1e-10);
    assert.equal(isInMonitoringRegion({ latitude: bounds.north + 0.001, longitude: bounds.center[1] }, region), false);
    assert.deepEqual([gulfport, miami].filter(v => isInMonitoringRegion(v, region)), [region === "gulfport" ? gulfport : miami]);
    assert.deepEqual([].filter(v => isInMonitoringRegion(v, region)), []);
  }
});

test("API client scopes requests, supports cancellation, and preserves history", async (t) => {
  const calls: string[] = [];
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    calls.push(url);
    if (url.includes("region=")) assert.equal(options?.signal, controller.signal);
    return new Response(JSON.stringify({ count: 0, vessels: [], positions: [] }));
  });
  assert.deepEqual((await fetchVessels("gulfport", controller.signal)).vessels, []);
  assert.deepEqual((await fetchVessels("miami", controller.signal)).vessels, []);
  await fetchVessels();
  await fetchVesselHistory(100000001, 100);
  assert.deepEqual(calls, ["/api/vessels?region=gulfport", "/api/vessels?region=miami",
    "/api/vessels", "/api/vessels/100000001/history?limit=100"]);
});

test("API failures propagate to dashboard error handling", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(fetchVessels("gulfport"), /Failed to fetch vessels: 503/);
});
