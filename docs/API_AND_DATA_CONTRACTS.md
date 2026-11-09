# PortPower AI — Shared Data & API Contracts (v1 proposal)

## SCHED-02 — additive FCFS contract proposal

`scheduleFcfs(input, assumptions)` is a pure shared-core function. Input reuses
the validated `SchedulingInputs` arrival/berth/equipment collections. Assumptions
provide an explicit UTC planning horizon, documented availability of currently
available resources throughout that horizon, and per-arrival equipment type/count
requirements (including an explicitly confirmed empty list for berth-only work).
Each assumption is labeled planner-confirmed or simulated with a note.

Order is ETA then arrival ID using locale-independent string ordering. Successful
service starts are nondecreasing in that order; infeasible calls do not block later
calls. Choose earliest feasible start, preferred berth on equal starts, then berth
ID; equipment ties use availability then ID. Unavailable resources stay blocked
for the horizon. Existing equipment-to-berth restrictions are preserved. The same
MMSI cannot receive overlapping calls. Assignments are half-open intervals.
Missing durations/requirements and infeasible resources/horizon produce explicit
unscheduled records. All successful timestamps serialize as UTC ISO strings.
Positive durations round up to milliseconds so work is never shortened.

This is an assignment heuristic, not an energy optimizer or physical compatibility
guarantee. No vessel dimensions, rates or release times are inferred. Existing
simulation and scheduling-input contracts are not changed by implication.

## SCHED-01 — scheduling input contract proposal (additive)

Introduce independent `SchedulingInputs` interfaces in `packages/core/src/types.ts`
and a deterministic runtime parser/builder in `schedulingInputs.ts`; existing
`OperatingScenario` and energy proposals are unchanged.
`GET /api/optimization/inputs` derives the active manager's port from the session
and reads only `manager_berths`, `manager_equipment`, `manager_vessel_arrivals`.
It returns a `scheduling-inputs-1.0` inspection snapshot, with string BIGINT IDs,
explicit units, nullable unknown dimensions/capabilities, original resource statuses,
normalized UTC ETAs, service duration minutes, provenance, issues and readiness.
Cancelled/completed calls are excluded. No AIS records are loaded or joined.

Valid but incomplete planning records return 200 with `readyForScheduling: false`
and actionable issues; corrupt records/references return 422 with structured issues.
Authentication: 401; absent/inactive/unsupported manager assignment: 403;
query parameters (including port overrides): 400; database failure: sanitized 503.
The request reads a repeatable-read, read-only transaction. Response caching is disabled.

Readiness covers only minimum input completeness for duration-based planning,
not a feasible schedule or verified physical compatibility. Known service hours
are converted to minutes without estimating productivity. Optional trusted server
configuration may supply `simulatedServiceDurations: [{arrivalId, minutes, note}]`
only when the stored duration is null; applied values are labeled simulated.
No default duration, equipment rate, capacity, compatibility or release time is invented.
Availability means the recorded status at inspection, not guaranteed shift availability.

## BERTH-01 — manager berth management

`GET /api/berths` returns `{berths: [...]}` from the active manager's assigned
port, ordered by berth number. Each berth has `id`, `berth_number`, `name`,
`status`, `max_length_m`, and `max_draft_m`. PostgreSQL BIGINT IDs are preserved
as strings; NUMERIC capacities may be strings or null in responses.

`PATCH /api/berths/:id` accepts a nonempty subset of `status`, `max_length_m`,
and `max_draft_m` and returns `{berth: ...}`. Status is exactly
`available | occupied | maintenance | closed`. Known capacities are JSON numbers
in metres, positive with at most two decimal places; null means unknown.
Storage limits are 99,999,999.99 m for length and 999,999.99 m for draft, matching
existing NUMERIC columns; these are database limits, not asserted port dimensions.
Omitted fields stay unchanged. Unknown payload fields, including `port_id`, are
rejected; a supplied query port cannot override session ownership.

Both endpoints require the existing authenticated session and a current active
`port_manager` assignment. Updates filter by ID and that server-derived port.
Anonymous: 401; inactive/unassigned manager: 403; malformed input: 400;
missing or another port's berth: 404; storage error: sanitized 500.
No migrations or new berths are created. `/gulfport/berths` and `/miami/berths`
use the existing matching-port client guard and render actual stored inventory.
These records are planner inputs/demo assumptions, not verified port-authority data.

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
