# PortPower AI — Shared Data & API Contracts (v1 proposal)

## OPS-01 contract proposal (additive)

The operations-only contract is introduced in `packages/core/src/types.ts`;
there is no existing core implementation to migrate. `OperatingScenario` is
separate from the proposed energy `PortScenario`. All operational input is
marked `synthetic: true`, region `gulfport`, schema version `operations-1.0`.
Time is an integer minute in one fictional day, 0–1440, with half-open
assignment intervals [start, end); back-to-back assignments do not conflict.
Durations are minutes. IDs are unique within each collection and references
must exist. This slice does not validate vessel dimensions or cargo capacities.

`GET /api/operations/scenarios/gulfport-demo-v1` returns
`{scenario, conflicts, persistence: 'postgres'}`.
`PUT` on the same path accepts the full scenario with its current `revision`.
The server validates, atomically increments the revision, and returns the same
envelope. Stale revision: 409; invalid input: 400; unknown scenario: 404;
database unavailable: 503. Scheduling conflicts are saved as visibly flagged
drafts, never as feasible recommendations. Errors use `{error: string}` with
validation `issues?: string[]`. PostgreSQL stores scenario metadata and a JSON
snapshot in `operating_scenarios`. OPS-02 adds authoritative collection tables:
`berths`, `vessel_calls`, `equipment`, `cargo_tasks`, and
`task_equipment_assignments`. Reads reconstruct the same v1 response from these
rows; saves atomically update the snapshot, revision, and related rows.
Composite scenario-scoped foreign keys prevent cross-scenario references.
All child tables enforce `synthetic = true`; times/durations use integer minutes.
The one-time transactional backfill preserves saved revisions and assumptions.
Subsequent startup migrations do not reseed edited or empty collections.
AIS tables and APIs are unchanged. Use the planner/API for changes so revision
and cross-field validation run; direct SQL changes bypass those safeguards.

Offline mode is explicitly selected, uses the same validation and fixture,
and stores a separate browser-local draft. It does not sync to PostgreSQL.

**Rule:** Shared domain types go in `packages/core/src/types.ts`. Keep them framework-independent. Every contributor and Codex agent must code against these types instead of inventing equivalents.

## 1. Domain interfaces (proposal, implement as TypeScript)

```ts
type ProvenanceKind = 'synthetic' | 'public-source' | 'user-entered' | 'derived';
type EquipmentKind = 'diesel' | 'electric';
type SlotState = 'active' | 'idle' | 'charging' | 'off';
type ConstraintCode = 'WORK_UNMET' | 'CHARGER_LIMIT' | 'SITE_POWER_LIMIT' | 'SOC_LIMIT' | 'INVALID_WINDOW' | 'INVALID_ASSET' | 'INCOMPLETE_INPUT';

interface Provenance { kind: ProvenanceKind; note: string; sourceUrl?: string; }
interface Slot { index: number; hour: number; baseLoadKw: number; electricityUsdPerKwh: number; requiredWorkUnits: number; }
interface Equipment {
  id: string; label: string; kind: EquipmentKind;
  activeGalPerHour?: number; idleGalPerHour?: number; // diesel only
  activeKwhPerHour?: number; idleKwhPerHour?: number;  // electric only
  batteryCapacityKwh?: number; initialSocKwh?: number; minSocKwh?: number;
  maxChargeKw?: number; chargeEfficiency?: number; // electric only
  states: SlotState[];            // length equals slot count
  interruptibleIdleSlots?: number[]; // diesel idle nudge only
  allowedChargeSlots?: number[];     // electric only
}
interface Site {
  maxGridKw: number;
  chargerCount: number;
  chargerPowerKw: number;
  dieselUsdPerGallon: number;
  dieselKgCo2ePerGallon: number;
  gridKgCo2ePerKwh: number;
  demandChargeUsdPerKwPerBillingPeriod: number;
  modeledBillingPeriod: string; // e.g. 'illustrative monthly billing period'
}
interface ScenarioFinancials {
  incrementalCapexUsd?: number;
  maintenanceUsdPerOperatingDay?: number;
  annualOperatingDays?: number;
}
interface PortScenario {
  schemaVersion: '1.0'; datasetVersion: string;
  scenarioId: string; parentScenarioId?: string;
  name: string; synthetic: boolean;
  slotHours: number; slots: Slot[];
  equipment: Equipment[]; site: Site; financials?: ScenarioFinancials;
  provenance: Record<string, Provenance>;
}
interface ConstraintViolation { code: ConstraintCode; message: string; equipmentId?: string; slotIndex?: number; }
interface SimulationMetrics {
  dieselGallons: number; gridKwh: number; peakGridKw: number;
  dieselCostUsd: number; electricityEnergyCostUsd: number;
  demandChargeUsdPerBillingPeriod: number;
  emissionsKgCo2e: number; requiredWorkUnits: number; completedWorkUnits: number;
}
interface SimulationResult {
  scenarioId: string; datasetVersion: string;
  feasible: boolean; violations: ConstraintViolation[];
  metrics: SimulationMetrics;
  slotGridKw: number[]; equipmentSocKwhBySlot: Record<string, number[]>;
  assumptions: string[];
}
interface Nudge {
  id: string; kind: 'idle-reduction' | 'charge-stagger';
  fromScenarioId: string; proposedScenario: PortScenario;
  summary: string; changes: string[];
}
interface InspectionDraft {
  equipmentCategoryGuess?: string;
  issueSummary: string;
  missingFields: string[];
  suggestedFields: Record<string, string | number | null>;
  requiresUserConfirmation: true;
}
```

### Validation invariants
- `slots` nonempty, ordered and contiguous; `slotHours > 0`; `states.length === slots.length` for all equipment.
- Finite nonnegative costs, rates, loads, required jobs and capacities. Valid SOC initial/min/capacity hierarchy.
- Diesel fields required for diesel; electric fields required for electric. Reject kind-incompatible states and missing fields rather than silently substituting defaults.
- `completedWorkUnits` is derived from number of `active` asset-slot assignments; each slot must meet `requiredWorkUnits`.
- An asset's `charging` state must be in `allowedChargeSlots`, and charging concurrency ≤ charger count; capped by `min(maxChargeKw, chargerPowerKw)`.
- Site max grid applies to `baseLoadKw + charging load` in every slot.
- For battery simulation, update SOC each slot: subtract active/idle consumption or add charging gain, with explicit chronological ordering. Define initial SOC as state before slot 0. SOC array length = slots length + 1.
- Monetary metrics should not be combined into a single daily amount when demand charge is per billing period; UI displays these categories separately until billing assumptions are fixed.

## 2. Example fixture fragment — illustrative, NOT sufficient for production demo

```json
{
  "schemaVersion": "1.0",
  "datasetVersion": "gulf-demo-v1",
  "scenarioId": "diesel-baseline",
  "name": "Fictional Gulf Coast terminal — diesel baseline",
  "synthetic": true,
  "slotHours": 1,
  "slots": [
    {"index": 0, "hour": 8, "baseLoadKw": 100, "electricityUsdPerKwh": 0.12, "requiredWorkUnits": 1},
    {"index": 1, "hour": 9, "baseLoadKw": 110, "electricityUsdPerKwh": 0.12, "requiredWorkUnits": 1}
  ],
  "equipment": [
    {"id": "forklift-d1", "label": "Forklift D1", "kind": "diesel", "activeGalPerHour": 1.2, "idleGalPerHour": 0.4, "states": ["active", "idle"], "interruptibleIdleSlots": [1]}
  ],
  "site": {"maxGridKw": 300, "chargerCount": 2, "chargerPowerKw": 20, "dieselUsdPerGallon": 4, "dieselKgCo2ePerGallon": 10.2, "gridKgCo2ePerKwh": 0.4, "demandChargeUsdPerKwPerBillingPeriod": 8, "modeledBillingPeriod": "illustrative monthly"},
  "provenance": {"site.dieselUsdPerGallon": {"kind": "synthetic", "note": "Demo assumption, not real terminal fuel price"}}
}
```

**Important:** Values above are synthetic **software test examples**, not verified fuel prices, emissions factors or a complete port model. The real fixture must include four diesel units, a complete 24-slot day and valid work allocations. Research lead must vet the assumptions ledger. Do not use the two-slot example directly for the pitch.

## 3. Pure-function signatures

```ts
validateScenario(scenario: PortScenario): ConstraintViolation[];
simulate(scenario: PortScenario): SimulationResult;
proposeIdleReduction(scenario: PortScenario): Nudge | { error: ConstraintViolation };
proposeChargingStagger(scenario: PortScenario): Nudge | { error: ConstraintViolation };
compare(a: SimulationResult, b: SimulationResult): {
  validComparison: boolean; reason?: string;
  delta: Partial<SimulationMetrics>;
};
```

`simulate()` returns violations for bad constraints; malformed structural data can throw a typed validation exception. `compare()` checks compatible dataset/version/lineage and does not hide inappropriate mixes of per-day and per-billing-period charges.

## 4. Optional FastAPI contract (P1 only)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | none | `{ "status": "ok" }` |
| POST | `/api/inspect/text` | `{ "text": "..." }` | `InspectionDraft` |
| POST | `/api/inspect/image` | multipart image + optional `context` | `InspectionDraft` |

**Errors:** `{ "error": { "code": "INVALID_INPUT | UPSTREAM_UNAVAILABLE | TIMEOUT | INTERNAL_ERROR", "message": "Safe display message" } }`. Return standard HTTP status codes; no raw provider responses or keys in errors. Backend returns structured *drafts* only, never authoritative numeric asset data.

**Env vars:** `AI_PROVIDER_API_KEY` (server only), `ALLOWED_ORIGINS`, optional `AI_MODEL`. `.env.example` uses blank placeholders; never commit `.env`.

## 5. Frontend integration rules
- Import shared types/functions from `@portpower/core`, not duplicated inline interfaces.
- Store scenario input as source of truth, simulation output as recomputed derived state.
- Manual fixture mode works without backend; P1 intake is progressive enhancement.
- Display `feasible=false` as invalid recommendation, never as a savings card.
- Every exported report includes scenario IDs/version, inputs, provenance, algorithm version, results, deltas, infeasibility warnings and limitations.

## 6. Versioning decisions
Changes to `PortScenario`, `SimulationResult`, units or calculation semantics require version bump and fixture/test update. Freeze v1 contracts before parallel development.
