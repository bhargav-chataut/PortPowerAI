import assert from "node:assert/strict";
import { test } from "node:test";
import { createOperatingScenario } from "../../../packages/core/dist/index.js";
import { loadBrowserScenario, saveBrowserScenario, loadOperations, saveOperations } from "../src/services/operationsApi.ts";

test("offline demo saves and reloads a separate fictional draft with version checks", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const original = loadBrowserScenario(storage);
  assert.equal(original.synthetic, true);
  const updated = { ...original, name: "Synthetic edited browser plan" };
  const saved = saveBrowserScenario(updated, storage);
  assert.equal(saved.revision, 2);
  assert.deepEqual(loadBrowserScenario(storage), saved);
  assert.throws(() => saveBrowserScenario(original, storage), /newer browser draft/);
  assert.throws(() => loadBrowserScenario({ getItem: () => '{"synthetic":false}' }), /invalid/);
  assert.throws(() => saveBrowserScenario(saved, { ...storage, setItem: () => { throw new Error("Storage full"); } }), /Storage full/);
});

test("planner API reads and writes fictional scenario documents", async t => {
  const calls: { url: string; options: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ scenario: createOperatingScenario(), persistence: "postgres", conflicts: [] }));
  });
  assert.equal((await loadOperations()).scenario.synthetic, true);
  await saveOperations(createOperatingScenario());
  assert.equal(calls[0].url, "/api/operations/scenarios/gulfport-demo-v1");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(JSON.parse(String(calls[1].options.body)).synthetic, true);
});

test("failed saves and invalid server data are not reported as successful", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: "Newer revision exists" }), { status: 409 }));
  await assert.rejects(saveOperations(createOperatingScenario()), /Newer revision/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ scenario: { synthetic: false } })));
  await assert.rejects(loadOperations(), /invalid scenario/);
});
