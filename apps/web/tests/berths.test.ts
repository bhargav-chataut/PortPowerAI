import assert from "node:assert/strict";
import { test } from "node:test";
import { getBerths, updateBerth, parseBerthCapacity } from "../src/services/berthApi.ts";

test("berth client sends session cookies and PATCH values without accepting a port ID", async t => {
  const calls: { url: string; options: RequestInit }[] = [];
  const berth = { id: "9007199254740993", berth_number: 1, name: "Synthetic berth", status: "available", max_length_m: null, max_draft_m: null };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(options.method === "PATCH" ? { berth } : { berths: [berth] }));
  });
  const controller = new AbortController();
  assert.deepEqual(await getBerths(controller.signal), [berth]);
  assert.deepEqual(await updateBerth(berth.id, { status: "closed", max_draft_m: null }), berth);
  assert.equal(calls[0].url, "/api/berths"); assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[1].url, `/api/berths/${berth.id}`); assert.equal(calls[1].options.method, "PATCH");
  assert.equal(calls[0].options.credentials, "include"); assert.equal(calls[1].options.credentials, "include");
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), { status: "closed", max_draft_m: null });
});

test("blank capacities stay unknown; invalid dimensions cannot silently become zero", () => {
  assert.equal(parseBerthCapacity("", 999999.99), null);
  assert.equal(parseBerthCapacity("  ", 999999.99), null);
  assert.equal(parseBerthCapacity("7.50", 999999.99), 7.5);
  for (const value of ["0", "-1", "NaN", "Infinity", "invalid", "1.234", "1000000"]) {
    assert.throws(() => parseBerthCapacity(value, 999999.99), /Capacity must be positive/);
  }
});

test("berth client surfaces expired sessions, authorization and save errors", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
  await assert.rejects(getBerths(), /session has expired/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: "Berth not found for your port" }), { status: 404 }));
  await assert.rejects(updateBerth("1", { status: "closed" }), /not found for your port/);
  mock.mock.mockImplementation(async () => new Response("{}", { status: 500 }));
  await assert.rejects(updateBerth("1", { max_length_m: 200 }), /Berth request failed/);
});
