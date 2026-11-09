# PortPower AI — scheduling MVP implementation plan

Audit date: 2026-11-09. Status: findings and proposed execution order only.

## 1. Scope and verification limits

This audit inventoried the repository, inspected application source, shared core,
SQL migrations, tests, configuration, seed logic, and existing product/architecture
docs. PostgreSQL `portpower_db` was inspected with `BEGIN READ ONLY`, a statement
timeout, catalog queries, and aggregate counts, followed by `ROLLBACK`.
No application code, migrations, credentials, or database data were changed.
This document is the only repository source file added by the audit. Builds also
regenerated ignored output. Existing uncommitted manager/auth/UI work was preserved.

No migrations, seeds, backend startup, login requests, or database-writing tests
were run. Login/logout end-to-end behavior, a fresh database rebuild, browser
interactions, session persistence across restart, and live AIS reception are **not
verified** by this audit. Build success and mocked tests do not prove those flows.

The nearest existing task-board integration scope is INT-03 (full smoke test);
this is a user-requested prerequisite audit, not completion of INT-03.

## 2. Current architecture and repository inventory

| Area | Current implementation | Reuse / limitation |
| --- | --- | --- |
| `apps/web` | React, TypeScript, Vite, React Router, React Leaflet | Preserve working pages, styles, map markers and history |
| `services/vessel-api` | Express, TypeScript, PostgreSQL, AISStream | Routes contain manager validation and SQL; no scheduler service |
| `packages/core` | Operations types, synthetic fixture, validation, conflict detection, availability and workload helpers | Deterministic primitives; no berth/equipment scheduling optimizer |
| `index.html` at repository root | Separate offline energy demo with inline `calculate`, greedy charging allocation and local improvement | Not imported by React/API; not a manager-arrival scheduler; no dedicated automated tests found |
| SQL migrations | `001_operating_scenarios.sql`, `002_operations_tables.sql`, `003_daily_port_operations.sql` | Incomplete rebuild path; see section 6 |
| Manager seed | `src/scripts/seedManagers.ts` | Reads account inputs from environment, hashes with Argon2id, upserts accounts/assignments; requires pre-existing ports |
| Tests | Two frontend test files and two backend test files | No auth, manager-equipment, manager-arrival, or browser tests found |
| Docs | Technical spec, contracts, task board, architecture v2, progress, READMEs | Several describe proposed FastAPI/energy architecture or older progress; code is the implementation evidence |

There is no root npm workspace manifest, CI workflow, separate optimizer service,
or implemented FastAPI service in the inspected repository. `packages/core` has
no own build/test scripts; frontend/backend hooks compile it with their installed
TypeScript compiler. Imports currently use relative `packages/core/dist` paths.
`apps/web/src/main.tsx` is the active entry; the older `App.tsx` is not mounted.
The supplied concept DOCX referenced in earlier docs is not present in the current
file inventory, so its contents were not revalidated.

### Frontend routes

| Path | Component / behavior | Access in client |
| --- | --- | --- |
| `/` | Redirect to `/gulfport` | Gulfport guard then redirects a Miami manager to Miami |
| `/login` | `LoginPage` | Public |
| `/gulfport`, `/miami` | `FleetDashboard`, map view | `ProtectedRoute` for matching port |
| `/:port/vessels` for the two ports | `FleetDashboard`, vessel-list view | Matching-port guard |
| `/:port/equipment` for the two ports | `EquipmentManagementPage` | Matching-port guard |
| `/:port/arrivals` for the two ports | `VesselArrivalsPage` | Matching-port guard |
| `/operations` | `OperationsDashboard`, fixed fictional Gulfport scenario | Gulfport guard only |
| `/vessels/:mmsi` | `VesselDetailsPage` | No client guard |
| Other routes | Redirect to `/` | No separate not-found screen |

### API routes and persistence

| Method/path | Implementation | Storage / access observed in code |
| --- | --- | --- |
| `POST /api/auth/login` | `authRoutes.ts` | Active assigned manager lookup, Argon2 verification, session regeneration/save |
| `GET /api/auth/me` | `authRoutes.ts` | Session ID plus current active manager/port lookup |
| `POST /api/auth/logout` | `authRoutes.ts` | Session destruction and cookie clearing |
| `GET /api/equipment` | `equipmentRoutes.ts` | Port derived from session assignment; reads `manager_equipment` |
| `POST /api/equipment` | Same | Validates equipment/energy enums and capacity; inserts into assigned port |
| `PATCH /api/equipment/:id/status` | Same | Validates status; update constrained by equipment ID and assigned port |
| `GET /api/arrivals` | `arrivalRoutes.ts` | Session-port scoped arrivals, with same-port preferred berth join |
| `GET /api/arrivals/berths` | Same | Assigned-port berth inventory |
| `POST /api/arrivals` | Same | Validates MMSI, timezone-qualified ETA, cargo/workload, service estimate and same-port berth |
| `GET /api/vessels[?region=…]` | `vesselRoutes.ts` | Latest in-memory observations; optional validated rectangle filter; no server auth |
| `GET /api/vessels/:mmsi/history` | Same / `vesselRepository.ts` | PostgreSQL position history, MMSI/limit validation; no server auth |
| `GET/PUT /api/operations/scenarios/:id` | `operationsRoutes.ts` | Fictional scenario, conflicts and revisioned saves; **no server auth or port ownership filter** |
| `GET /health` | `app.ts` | Process response; not a database/readiness check |

All routes run behind session middleware, but installing that middleware does
not itself require authentication. There are no scheduling/optimization endpoints,
manager berth-edit endpoints, arrival-edit/cancel endpoints, or equipment
berth-assignment endpoints in the current route files.

## 3. Live database findings

Catalog inspection found 15 public tables:

- Identity/access: `ports`, `users`, `port_manager_assignments`, `user_sessions`.
- AIS observations: `vessels`, `vessel_positions`.
- Manager planning inputs: `manager_berths`, `manager_equipment`, `manager_vessel_arrivals`.
- Fictional scenario: `operating_scenarios`, `berths`, `vessel_calls`, `equipment`,
  `cargo_tasks`, `task_equipment_assignments`.

These are distinct data models. Do not delete either model, reseed accounts, or
replace manager records to connect scheduling. Preserve all current IDs/data.

### The three manager tables

| Table | Existing fields and constraints | Scheduling gaps |
| --- | --- | --- |
| `manager_berths` | BIGINT ID; `port_id`; positive berth number; name; nullable positive max length/draft; status available/occupied/maintenance/closed; created time; unique `(port_id, berth_number)` and `(port_id, id)` | Static status only; no dated availability, reservations or manager edit API |
| `manager_equipment` | BIGINT ID; port/code uniqueness; forklift/reach stacker/mobile crane/gantry crane/terminal tractor; nullable positive capacity; nullable diesel/electric/hybrid energy; available/in-use/maintenance/out-of-service; optional assigned berth with composite same-port FK; timestamps | No processing rates, availability intervals, time-based assignments or assignment API |
| `manager_vessel_arrivals` | BIGINT ID; port; nine-digit MMSI; nullable name; timezone-aware ETA; cargo type; positive quantity; cargo/unit consistency check; optional positive service hours; same-port preferred berth FK; lifecycle status; notes; timestamps | No scheduled start/end, equipment requirements/reservations, priority, input version or persisted schedule result |

`003_daily_port_operations.sql` defines these fields, enum checks, composite FKs,
and indexes for berth/equipment port+status and arrivals port+ETA/MMSI. Their live
definitions were inspected. The SQL has no `synthetic`/provenance fields on these
tables; manager input must not be represented as verified port-authority data.

Observed aggregate snapshot (not live dashboard metrics or claims about real ports):

| Port | Active assigned manager accounts | Berths | Equipment | Arrivals |
| --- | ---: | ---: | ---: | ---: |
| Gulfport | 1 | 3 available | 0 | 0 |
| Miami | 1 | 3 available | 2 available | 1 planned |

No passwords, password hashes, session contents, manager emails, or record notes
were retrieved. Account existence is verified; ability to log in was not tested.
Gulfport currently needs planner inputs or an explicitly selected synthetic demo
before its manager-data scheduling flow can be demonstrated.

## 4. Reusable functionality and missing integration

### Preserve and extend

- `ProtectedRoute`, `LoginPage`, and `authApi`: existing session checks and port redirects.
- `EquipmentManagementPage`/`equipmentApi`: creation, inventory/search, status editing,
  loading/error/empty states. Keep their current form and table.
- `VesselArrivalsPage`/`arrivalApi`: arrival form/list, cargo units, service-hour
  assumptions, berth selector, browser-local ETA converted to ISO UTC.
- `FleetDashboard`, `VesselMap`, `VesselDetailsPage`, freshness/region helpers:
  keep map/list navigation, ship markers, region isolation and historical trails.
- `OperationsDashboard`: editable fictional scenario, `TimeSelect`, timeline bars,
  resource-state labels, warnings, save/reload controls and explicit browser-local
  fallback. Extract reusable timeline pieces when integrating; do not rebuild it.
- Core: `validateOperatingScenario`, `detectOperationsConflicts`, `overlaps`,
  `berthStatus`, `equipmentStatus`, `equipmentWorkload`, `formatMinute`, and fixture.
- Scenario repository: transaction boundaries, atomic revision comparison, relational
  reconstruction and one-time JSON backfill are useful persistence patterns.

### Why this is not yet an operations scheduling MVP

The manager pages store inputs but never build a scenario, create cargo tasks, or
call the core conflict checker. The fictional planner uses only `gulfport-demo-v1`.
It does not load `manager_*` data. Its saved collections are separate from manager
inventories and arrivals. Changing a manager arrival/equipment record therefore
does not update that timeline or its warnings.

The core checks an already assigned plan; it does not choose a berth, find an
equipment allocation, schedule service, or recover from an arrival delay. Priority
is metadata only. The root HTML charging heuristic is a separate energy demo and
does not fill this gap. No optimizer code integrated with manager arrivals exists.

Contract mismatches that need an explicit adapter/versioned proposal:

- Core supports one Gulfport fixture ID/region and string IDs; manager inputs use
  BIGINT identifiers and support both ports. Preserve BIGINT IDs as strings.
- Core uses integer minutes within one fictional day; arrivals use `TIMESTAMPTZ`
  and optional fractional service hours. Define planning date, port timezone,
  rounding policy and handling for work crossing midnight; do not silently clamp.
- Core has `forklift`/`yard-tractor`; manager types include additional equipment
  and use `terminal_tractor`. Define supported mappings/compatibility explicitly.
- Core does not enforce physical berth dimensions, cargo capacity, rates or crew.
  Arrival records lack vessel length/draft and equipment-count requirements. Treat
  absent constraints as unknown; do not claim physical feasibility.
- Nullable service hours/rates cannot be filled using invented throughput. For the
  first slice require a planner-confirmed duration and resource requirement; return
  `INCOMPLETE_INPUT` when absent. Keep tonnes, container moves and vehicle moves distinct.
- Existing static `in_use`/occupied statuses lack release times. Initially treat
  blocked resources conservatively rather than assuming when they become free.

## 5. Prioritized findings

| Priority | Finding and evidence | Proposed response |
| --- | --- | --- |
| P0 | `operationsRoutes.ts` never checks session/port; repository GET/UPDATE filters only scenario ID, even though live scenario metadata has a port FK | Add server-side active-manager authorization and scenario port ownership, with negative tests, before connecting manager data |
| P0 | Fresh database setup is incomplete; startup and migration CLI run only 001/002; current initializer expects `ports` and `operating_scenarios.port_id` | Repair additive migration chain and prove fresh/repeat/upgrade behavior in a separate disposable database after approval |
| P0 | Manager input tables and fictional scenario are disconnected | Agree a scheduling input/result contract and a manager-data adapter; keep demo explicit |
| P0 | No integrated berth/equipment scheduler or saveable schedule result | Implement a deterministic feasible scheduler after constraints are defined; validate every result |
| P1 | Equipment/arrival routes derive port from assignment but do not re-check current active status/role; `/me` does | Reuse one active-manager/port authorization helper; test revoked/deactivated accounts |
| P1 | Protected routes validate on mount only; expired sessions on subsequent requests surface as generic errors; no shared auth provider | Add consistent 401 handling/session state without rebuilding page forms |
| P1 | ETA input is interpreted in browser timezone, which may differ from the port | Display chosen timezone and define conversion; test both ports, DST and midnight cases |
| P1 | New manager routes, session lifecycle and cross-port behavior have no automated coverage | Add API/client/UI integration tests before claiming those flows work |
| P1 | Manager-table inputs have no provenance marker; seeded berth specifications cannot be treated as verified | Add explicit source/provenance labeling for demos and planner-entered assumptions |
| P1 | Production session config has secure cookies but no explicit Express proxy-trust setup; CORS is generic | Verify intended same-origin/proxy deployment, cookie flags, origin/CSRF protection and login throttling before exposure |
| P2 | Manager forms lack editing/cancellation workflows, berth assignments, and conflict feedback | Extend existing pages only as required by the scheduling slice |
| P2 | Documentation/root workspace commands and some progress claims lag the implementation | Update docs/scripts after the agreed implementation, without rewriting historical demos |

AIS endpoints and vessel-details page are currently public. Decide explicitly
whether observation/history data should stay public; do not confuse that choice
with the requirement to restrict manager planning data. Login already regenerates
the session and uses Argon2; preserve those behaviors.

## 6. Migration reproducibility assessment

**Fresh-install reproducibility is not established.** Static inspection found:

1. No versioned migrations create `ports`, `users`, `port_manager_assignments`,
   `vessels`, or `vessel_positions` (including its `region` column). They exist live.
2. Live `operating_scenarios.port_id` is NOT NULL and references `ports`; 001/002/003
   do not add that column/FK. The current initializer inserts `port_id` and looks up
   Gulfport, so applying only checked-in schema cannot reproduce that path.
3. 003 depends on `ports` and contains its own `BEGIN/COMMIT`, but the initializer
   reads only 001/002 inside another transaction. Do not simply append 003 without
   resolving transaction ownership; nested transaction wrappers would break atomicity.
4. `user_sessions` is created on demand by `connect-pg-simple` rather than included
   in the application migration chain. Session DDL privileges and explicit schema
   setup need a deployment decision.
5. No migration ledger/checksums or complete port/berth seed path is present.
   `CREATE TABLE IF NOT EXISTS` does not reconcile schema drift or backfill missing
   constraints. Manager seed requires existing ports and updates credentials on rerun;
   it must remain explicit and must not run during ordinary server startup.
6. Server startup runs schema initialization and seeds the fictional scenario before
   listening, coupling every API route to demo initialization. Missing setup can
   prevent auth, AIS, and manager APIs from starting too.
7. The opt-in PostgreSQL test fixture predates the initializer's `ports` lookup and
   `port_id` insert: it provisions 001 in a schema without those dependencies. It
   needs updating before it can substantiate the current migration path. This is a
   source-inspection finding; the writing test was deliberately not executed.

Proposed repair: preserve existing migration files/data; add a reviewed bootstrap
and forward upgrade path, one transaction owner, a version ledger, documented
environment-variable names (never values), explicit demo seeding, and an isolated
test harness. Compare catalog definitions before proposing backfills; do not drop,
truncate, recreate populated tables, change primary keys, or reseed user accounts.

## 7. Proposed dependencies and execution order

No next-phase implementation is authorized by this document. Each step has a
reviewable completion gate; database-changing work requires a separately approved
execution environment and migration plan.

| Order | Work package | Dependencies | Smallest useful deliverable / gate |
| --- | --- | --- | --- |
| 1 | Stabilize current baseline and authorization | Preserve uncommitted work; agree public AIS policy | Add auth/ownership tests and server guard to scenario routes; verify unauthenticated access and wrong-port access cannot read/write plans |
| 2 | Reproducible setup | Live-schema audit; reviewed additive SQL | Fresh install, repeat migration and existing-data upgrade pass in disposable DB; both manager assignments preserved; explicit fixture seed only |
| 3 | Freeze scheduling contracts | Shared-types review; timezone/resource policies | Versioned inputs/results and adapter tests; no changes to v1 energy types by implication |
| 4 | Build a read-only scheduling input adapter | 1–3; manager input APIs | Authenticated same-port snapshot of berths, equipment and arrivals, normalized units/IDs, provenance and clear missing-field errors |
| 5 | Deterministic scheduler in core | 3–4; confirmed service duration/resource requirements | Earliest feasible berth + equipment intervals with stable tie-breaking; no start before ETA; no overlaps/blocked resources; explicit incomplete/infeasible outcomes; core tests |
| 6 | Schedule preview API | 1, 4–5 | Proposed `POST /api/schedules/preview`, server-derived port, no automatic dispatch or implicit persistence; result independently rechecked |
| 7 | Persist and reload plans | 2, 6; reviewed new persistence design | Proposed explicit schedule-save API with source versions/hash, revision check and transactional assignments; stale previews rejected; prior plans preserved |
| 8 | Planner UI integration | 4, 6–7 | Reuse timeline/warnings; add preview/save controls and links from arrivals/equipment; edits visibly invalidate old results; distinguish fictional demo from manager inputs |
| 9 | Recovery demonstration and regression gate | 1–8 | Delayed-arrival and equipment-unavailable cases show feasible alternatives or an honest infeasibility result; both ports isolated; builds/tests and browser flows verified |

For step 5, first agree a scheduling objective such as minimizing waiting time with
stable ETA/priority/ID ordering. Call the initial algorithm a deterministic heuristic,
not a global optimum. Preserve all required tasks and quantities; never drop work
to make a schedule appear feasible. Include waiting minutes, planned service start/end,
berth/equipment reservations, violations and input provenance. Add no numerical energy
or financial recommendations until their inputs and deterministic formulas exist.

Suggested ownership by existing boundaries: core owns contracts/adapter-domain
validation/scheduler; backend owns authorization, SQL, snapshot/preview/save APIs;
frontend owns incremental controls/timeline integration. Shared migrations and contract
changes are coordinated first. No delegated agents were used for this audit.

## 8. Required validation before calling the MVP complete

- Core: repeatable outputs, back-to-back interval reuse, berth/equipment conflicts,
  unavailable resources, missing durations, invalid references, unsupported equipment,
  timezone/day boundary policy, no-resource and over-capacity/infeasible cases.
- API: login/me/logout, revoked session, active/role checks, both ports' authorization,
  foreign-port IDs, validation errors, preview without writes, save/reload/restart,
  stale source inputs, concurrent saves, rollback and preserved historic plans.
- Database: fresh/repeat/upgrade migrations against an approved disposable database;
  same-port foreign keys; no AIS/account data loss; migration failure rollback.
- Frontend/browser: login redirects, port-specific pages, arrival/equipment edits,
  schedule preview/save/reload, conflict explanation, loading/empty/error/401 states,
  mobile tables/timeline, and unchanged AIS search/markers/history.
- Demo: explicitly labeled fixture, no API key requirement for offline fixture/core;
  Gulfport and Miami examples remain distinct; no unsupported claims of measured
  operational performance, guaranteed physical feasibility or validated savings.

## 9. Checks actually executed during this audit

| Working directory | Command | Outcome |
| --- | --- | --- |
| `apps/web` | `npm test` | PASS: 6 tests (region/client handling and browser draft persistence) |
| `apps/web` | `npm run build` | PASS: TypeScript and Vite production build; 84 modules transformed |
| `services/vessel-api` | `npm run build` | PASS: shared core compile and backend TypeScript build |
| `services/vessel-api` | `OPERATIONS_POSTGRES_TEST=0 npm test` | PASS: 7 tests, 1 opt-in PostgreSQL test skipped; local HTTP sockets permitted |
| PostgreSQL | Read-only catalog and aggregate queries | PASS: three manager tables, relevant constraints/indexes, 15 public tables and per-port counts inspected |
| Repository | `git diff --check` | Reports pre-existing trailing whitespace in `apps/web/src/pages/FleetDashboard.tsx:306`; left unchanged to preserve in-progress work |

The passing backend suite exercises synthetic scenario validation/conflicts, mocked
scenario HTTP behavior, and existing vessel endpoints with mocked history access.
It does not exercise the new manager routes or a real authenticated cookie session.
No current fresh-database, mutation-persistence or browser test success is claimed.

## 10. Decisions to settle before implementation

1. Keep the fictional scenario as a separate explicit demo, and use `manager_*`
   records as the authoritative source for manager scheduling (recommended).
2. Define the planning horizon and port timezone, duration/rounding rules,
   equipment counts/compatibility, blocked-resource policy and priority meaning.
3. Approve the additive migration reconciliation and choose a disposable test DB;
   preserve the existing database and all manager/AIS/demo records.
4. Review the proposed shared scheduling contract before changing `types.ts`,
   then implement steps 1–4 as the first integration slice.

This audit ends here. Proposed routes, scheduling contracts and migration repairs
above are recommendations, not implemented or verified features.
