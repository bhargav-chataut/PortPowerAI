import { createOperatingScenario, detectOperationsConflicts, validateOperatingScenario,
  type OperatingScenario, type OperationsResponse } from "../../../../packages/core/dist/index.js";

const URL = "/api/operations/scenarios/gulfport-demo-v1";
const KEY = "portpower:fictional-operations:1";

async function request(method: "GET" | "PUT", scenario?: OperatingScenario, signal?: AbortSignal): Promise<OperationsResponse> {
  const response = await fetch(URL, {
    method, signal,
    ...(scenario ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(scenario) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Operations API returned ${response.status}`);
  const issues = validateOperatingScenario(body.scenario);
  if (issues.length) throw new Error("The server returned an invalid scenario.");
  return { scenario: body.scenario, conflicts: detectOperationsConflicts(body.scenario), persistence: "postgres" };
}

export const loadOperations = (signal?: AbortSignal) => request("GET", undefined, signal);
export const saveOperations = (scenario: OperatingScenario) => request("PUT", scenario);

export function loadBrowserScenario(storage: Pick<Storage, "getItem"> = localStorage): OperatingScenario {
  const saved = storage.getItem(KEY);
  if (!saved) return createOperatingScenario();
  const parsed: unknown = JSON.parse(saved);
  if (validateOperatingScenario(parsed).length) throw new Error("The saved browser draft is invalid. It has not been overwritten.");
  return parsed as OperatingScenario;
}

export function saveBrowserScenario(scenario: OperatingScenario, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): OperatingScenario {
  const issues = validateOperatingScenario(scenario);
  if (issues.length) throw new Error(issues.join(" "));
  const current = loadBrowserScenario(storage);
  if (current.revision !== scenario.revision) throw new Error("A newer browser draft exists. Reload before saving.");
  const saved = { ...scenario, revision: scenario.revision + 1 };
  storage.setItem(KEY, JSON.stringify(saved));
  return saved;
}
