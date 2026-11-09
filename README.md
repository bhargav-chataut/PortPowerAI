# PortPowerAI — Offline Demo MVP

## Shared FCFS scheduler

`scheduleFcfs(input, assumptions)` is exported by `packages/core`. It is a pure
TypeScript function; this step adds no UI, API route or database writes.
Pass the validated scheduling-input collections (`arrivals`, `berths`, `equipment`,
`assumptions`) and explicit scheduling assumptions:

```ts
const result = scheduleFcfs(inputs, {
  horizonStartUtc: "2026-11-09T06:00:00Z",
  horizonEndUtc: "2026-11-10T06:00:00Z",
  availableResources: {
    source: "simulated",
    note: "Synthetic demo: resources marked available remain usable in this horizon",
  },
  equipmentRequirements: [{
    arrivalId: "41", // Synthetic example; use a matching input arrival ID.
    source: "simulated",
    note: "Synthetic demonstration requirement, not inferred from cargo quantity",
    requirements: [{ type: "forklift", count: 1 }],
  }],
});
```

This example's dates and resource requirement are synthetic, not real port data.
For confirmed plans use `source: "planner-confirmed"` with a meaningful note.
Requirements must be supplied for every scheduled arrival; an explicitly confirmed
empty list permits berth-only work, while a missing list leaves the arrival unscheduled.
An optional `minimumCapacityTonnes` filters equipment using known capacities;
unknown capacity cannot satisfy that constraint. No equipment productivity is inferred.

Arrivals are processed by ETA then locale-independent string ID. Service starts
are nondecreasing (strict FCFS); an infeasible arrival does not discard later work.
The earliest feasible berth/resource start is chosen, with preferred berth used
when start times tie. A busy preferred berth does not cause avoidable waiting
when another eligible berth can serve earlier. Occupied/closed/maintenance berths
and unavailable equipment remain blocked for the entire supplied horizon.
Equipment berth restrictions and same-MMSI vessel exclusivity are preserved.

Results include `assignments`, `unscheduled` reasons, scheduled-call waiting and
turnaround minutes, UTC service/completion times, aggregate waiting metrics and
assumption provenance. Empty results have zero counts/waiting and null completion.
Positive durations round up to milliseconds; no required work is shortened.
This is a scheduling heuristic, not a physical berth-fit, energy/SOC, workforce or
globally optimal plan guarantee. It does not automatically operate port equipment.

Run `npm test --prefix packages/core` from the repository root. Its pretest uses
the existing backend TypeScript compiler to build core; backend dependencies must
already be installed. Tests use synthetic fixtures and require no database or API key.

## Scheduling input inspection

After signing in, open `GET /api/optimization/inputs` through the same app origin
(for example `http://localhost:5173/api/optimization/inputs`). The endpoint accepts
no port/query overrides: the active manager's session determines the port.
It loads only the assigned port's manager berths, equipment and active arrivals
in a repeatable-read, read-only PostgreSQL transaction. Cancelled/completed arrivals
are excluded; real AIS records and the fictional scenario tables are never queried.

The `scheduling-inputs-1.0` response includes `port`, `berths`, `equipment`,
`arrivals`, explicit `units`, `assumptions`, `issues`, `limitations`, and
`readyForScheduling`. BIGINT IDs stay strings, known NUMERIC values become numbers,
ETAs normalize to UTC, and supplied service hours convert to minutes.
Missing service durations or available resources give actionable error issues
and `readyForScheduling: false`, while still returning the inspection snapshot.
Corrupt records or cross-port references return 422; anonymous requests return 401,
inactive/unassigned managers 403, unsupported query parameters 400, and storage
outages a sanitized 503. No tables or records are created or updated.

Unknown capacities, productivity, shift/release windows and task-specific equipment
requirements are surfaced explicitly. Readiness means minimum completeness for a
duration-based planning pass; it does not guarantee a feasible assignment or physical
compatibility. There is no scheduling optimizer in this endpoint.

Defaults invent no operational values. The trusted server composition function
`createOptimizationRouter(db, configuration)` can optionally accept:

```ts
// Synthetic example only; configure a real planning arrival ID explicitly.
const configuration = {
  simulatedServiceDurations: [
    { arrivalId: "41", minutes: 90, note: "Synthetic demo duration, not measured productivity" },
  ],
};
```

An override applies only if that active arrival's stored duration is null and is
reported with `durationSource: "simulated"` plus an attributed assumption. It never
replaces a manager-supplied duration, estimates productivity, or supplies capacities.
The default mounted endpoint uses no overrides. The shared contract and runtime
builder live in `packages/core`; the read-only loader is
`services/vessel-api/src/services/schedulingInputService.ts`.

Synthetic tests cover validation, missing fields, assumption provenance, units,
port isolation, authenticated cookies, exclusion of completed/cancelled arrivals,
transaction cleanup and sanitized failures. Run the backend suite without optional
database-writing checks using `OPERATIONS_POSTGRES_TEST=0 BERTH_POSTGRES_TEST=0 npm test`.

## Manager berth management

Signed-in managers can open `/gulfport/berths` or `/miami/berths`, or choose
**Berths** from their dashboard. The page displays the existing assigned-port
`manager_berths` records (currently three per port) and lets managers save status,
maximum vessel length and maximum draft in metres. Blank capacity means unknown.
Each berth saves separately through `GET /api/berths` and `PATCH /api/berths/:id`.
Session ownership is enforced on the server. No schema migration or seed is needed.

Run `npm test` and `npm run build` in `apps/web` and `services/vessel-api`.
The optional backend check `OPERATIONS_POSTGRES_TEST=0 BERTH_POSTGRES_TEST=1 npm test`
tests real PostgreSQL berth updates using temporary records and existing active
Gulfport/Miami manager assignments; its transaction is rolled back without changing
saved inventory. Existing operations-migration tests are separate.

## Fictional port operations planner

The React app now provides `/operations`, alongside the existing `/gulfport`,
`/miami`, and `/vessels/:mmsi` pages. All operational schedules and equipment
records are fictional Gulfport demo assumptions, separate from live AIS.

1. In `services/vessel-api`, run `npm install` then `npm run dev` using your
   existing PostgreSQL `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
   Startup applies the migrations and inserts the synthetic scenario only if
   it is missing. `npm run db:migrate` also applies them without starting AIS.
   Existing AIS tables are untouched.
2. In `apps/web`, run `npm install` then `npm run dev` and open
   `http://localhost:5173/operations` (use Vite's printed port if different).
3. Edit berth assignments, vessel calls, task duration/priority, equipment
   assignments or availability. Warnings update immediately. Click **Save
   scenario draft** to persist to PostgreSQL. Conflicts remain visible in saved
   drafts; a newer saved revision produces a 409 instead of overwriting it.
4. If the API is unavailable, select **Use offline fictional demo**. This mode
   saves only in this browser's local storage and does not update PostgreSQL.

No AIS key is required for the operations module. Missing AIS credentials only
disable live vessel reception. The original standalone `index.html` remains offline.

Data sources: `packages/core/src/fixture.ts` contains the synthetic records;
`packages/core/src/types.ts` defines the shared operations contract. The new
PostgreSQL stores the operational records in separate related tables:

| Table | Fictional records |
| --- | --- |
| `operating_scenarios` | Scenario metadata, revision, last saved JSON snapshot |
| `berths` | Berth names |
| `vessel_calls` | Planned vessel calls, berth, arrival/departure minutes |
| `equipment` | Forklifts, yard tractors, service status and availability |
| `cargo_tasks` | Tasks, vessel calls, durations, priorities and required equipment type |
| `task_equipment_assignments` | Equipment reserved for each task |

Refresh **portpower_db → Schemas → public → Tables** in pgAdmin to see them.
Every child record has a `scenario_id` and enforced `synthetic = true`.
The backend reads these tables and updates them transactionally on planner saves.
The original JSON is retained as a saved snapshot. Use the planner/API to edit
records so revision checks and scheduling validation run.

```sql
SELECT id, revision, updated_at, jsonb_pretty(document)
FROM operating_scenarios;

SELECT jsonb_array_elements(document->'equipment') AS fictional_equipment
FROM operating_scenarios WHERE id = 'gulfport-demo-v1';

SELECT * FROM berths;
SELECT * FROM vessel_calls;
SELECT * FROM equipment;
SELECT * FROM cargo_tasks;
SELECT * FROM task_equipment_assignments;
```

API: `GET`/`PUT /api/operations/scenarios/gulfport-demo-v1`. PUT accepts the
whole scenario and its current revision. See `docs/API_AND_DATA_CONTRACTS.md`.
The core builds automatically before frontend/backend dev, build and test commands;
no root npm workspace or additional package installation is required for core.

Validation commands:

```text
cd apps/web
npm test
npm run build

cd ../../services/vessel-api
npm test
npm run build
OPERATIONS_POSTGRES_TEST=1 npm test
```

The last command uses the configured local PostgreSQL server in a unique test
schema, removed after the test. It leaves saved scenarios and AIS data intact.
Tests require Node 22.6+; `npm test` without the flag skips the real database test.
Production hosting must route `/api` to Express and use an SPA fallback for React routes.

Planning limits: one fictional day, half-open intervals, no automatic rescheduling,
no cargo capacity or berth dimension checks, and no dispatch or financial estimates.

## Run it
For the separate vessel backend, run `npm run build` and `npm test` from `services/vessel-api` (after `npm install`). Region filtering accepts `GET /api/vessels?region=gulfport` or `?region=miami`; omitting the region returns all latest observations.

Open `index.html` in any modern browser. No npm, server, API key or account needed. Fonts fall back to system fonts when offline.

## Tomorrow's demo (90 seconds)
1. Explain the fictional port: four forklifts, diesel energy use, considering 2 electric replacements.
2. Point to the scenario controls. Change electric units from 2 to 3 and back.
3. Compare naive simultaneous charging (amber) against coordinated charging (mint) on the chart.
4. Reduce site capacity to 150 kW to show the feasibility guardrail.
5. Restore 180 kW, change idle reduction, and export the assumptions/report.

## What is real / what is not
- **Real software**: fully functional calculations, deterministic heuristic optimizer, input controls, visual comparisons, JSON export, feasibility alerts.
- **Synthetic**: facility hourly base load, fleet duty cycle, consumption rates, emissions factor, costs, and motion visualization.
- **Not implemented**: AI vision, real port data import, production persistence, hardware control, CAPEX/payback, genuine telematics, real-time physics synchronization.
- **Do not claim** displayed savings are achievable at a particular port. This is a concept validation simulation.

## Current simplifying assumptions
- Four forklifts, 8 active hours + 2 idle hours/day per machine, 300 days/year.
- Diesel active: 2.2 L/hour; diesel idle: 1.1 L/hour.
- Electric work: 9 kWh/hour and 90% charging efficiency.
- An 8-hour overnight 22:00–06:00 charging window.
- One dedicated charger per electric forklift (same selected kW per charger).
- All electric forklifts must receive full daily grid energy before 06:00.
- Site load is a synthetic 24-hour profile.
- Daily site peak is assumed representative of every billing month for illustrative demand charges. Total annual cost includes diesel, *incremental electric forklift* energy and a monthly demand charge on total site peak; common facility kWh charges are excluded in all scenarios.
- Diesel CO2 factor 2.68 kg/L is illustrative; grid factor adjustable.
- Idle reduction only affects diesel idle fuel, not workload.
- No upfront electric equipment or charger capital investment, battery degradation, labor expenses, charger installation, or maintenance modeled.

## Technical notes
Pure HTML/CSS/JavaScript in a single file to make a meeting demo robust. Scheduling is greedy plus local swaps; not an exact solver or globally optimal guarantee. For a production prototype separate the calculation engine and test it on edge cases, then implement constraint-aware optimization with formal validation.
