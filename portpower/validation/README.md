# Frontend lint and integration assessment — November 9, 2026

Reviewed `main` at `fa94c69`, refreshed `feature/backend-nishan` at `c1809a3`,
`feature/optimizer-bhargav` at `340b7d2`, and merged research/AIS history.
Scope authorized by the project lead: targeted fixes in Binita's `portpower/`;
no backend, optimizer, contract, historical demo, dependency, or ESLint-rule changes.

## Implemented architecture versus plans

- **Primary frontend:** React 19 / Vite / TypeScript in `portpower/`, Leaflet Earth
  view, React Three Fiber/Drei Reference and 3D views. Port selectors, layer
  controls and synthetic KPI cards work. Sidebar tool buttons have no actions;
  Zustand simulation/selection state is not connected to the current dashboard.
- **Integrated backend:** Express in `services/vessel-api/`; optional server-only
  AISStream subscription, typed position validation, in-memory MMSI store,
  Gulfport/Miami filtering, `/health`, `/api/health`, `/api/vessels`. No PostgreSQL
  dependency or scenario/simulation/optimization routes on main.
- **Current data flow:** AISStream → Express memory → browser polling every 10 s.
  Vite proxies `/api` to port 3000. Static hosting requires a separately hosted API,
  a build-time `VITE_AIS_API_URL` pointing to the vessel endpoint, and matching
  backend `ALLOWED_ORIGINS`. Vite's development proxy is not a production backend.
- **Intended flow:** frontend → Express → independent Python optimizer;
  only Express accesses PostgreSQL. No Python service, solver, evaluator or Python
  tests exist in either main or the named optimizer branch. That branch currently
  contains the original frontend contribution, despite its name.
- `shared/contract.md` and JSON examples remain proposed v0.1. The result example
  explicitly is not a verified schedule. The historical `demo/index.html` contains
  independent browser calculations and is preserved unchanged.
- README/team ownership paths and “framework TBD” text are stale relative to the
  implemented React frontend. Research/pitch include citation placeholders and
  planned optimizer claims; they do not establish an implemented Python pipeline
  or verified operational measurements.

## Four errors and fixes

1. **EarthMap line 7, `react-refresh/only-export-components`:** a shared array was
   exported alongside a component. Move the unchanged array to `maps/ports.ts`
   and update both imports.
2. **EarthMap line 160, `react-hooks/set-state-in-effect`:** the effect synchronously
   reset vessels/status whenever selection changed. Reset port-specific state
   conditionally during render when the previous selection differs; React retries
   this component before rendering its children. Unsupported status is derived
   from selection. The effect only subscribes/polls and handles asynchronous
   responses. This also clears the old check timestamp, preserves layer controls,
   and retains cleanup that ignores responses from an obsolete region.
3. **PortScene line 14, `react-hooks/immutability`:** assigning `colorSpace` mutated
   the shared cached texture returned by `useTexture` during render.
4. **PortScene line 15, same rule:** assigning `anisotropy` mutated that same object.
   A declarative R3F-owned texture now shares only the loaded image and receives
   SRGB/anisotropy settings as props. R3F manages its disposal; `onUpdate` requests
   upload after changes. The cached loader texture remains untouched. Constructor
   defaults are explicit because the installed Three/R3F types require all nine
   constructor arguments. The reference image's aspect ratio is unchanged.

## Validation

Environment: Node `v22.23.1`, npm `10.9.8`. Commands are relative to repository root
unless a directory is specified. No frontend test script existed.

| Command / check | Result |
| --- | --- |
| `cd portpower && npm run lint` before changes | Reproduced exactly 4 errors |
| `cd portpower && npm ci --cache /tmp/portpower-npm-cache && npm run lint && npm run build` | Clean install; lint/build pass |
| `cd services/vessel-api && npm ci --cache /tmp/portpower-npm-cache && npm run build && npm test` | Clean install; build passes; 3 tests pass |
| `git diff --check` | Pass |
| `cd portpower && npm audit --json` | Exit 1: 10 moderate findings |
| `cd portpower && npm audit --omit=dev --json` | Exit 0: zero findings |
| `cd services/vessel-api && npm audit --json` | Exit 0: zero findings |
| Backend branch isolated snapshot: `npm ci --cache /tmp/portpower-npm-cache && npm run build && npm test` in `services/vessel-api` | Build passes; 7 pass, 1 skips |
| Backend branch `apps/web`: `node --experimental-strip-types --test tests/*.test.ts` after core build | 2 test files pass; alternate UI not integrated |

The skipped test requires `OPERATIONS_POSTGRES_TEST=1` and a dedicated PostgreSQL
setup. Real database migrations, persistence and restart behavior remain unverified.
No actual AIS credential or live observation was used in testing.

Additional temporary smoke harnesses (not dependencies of the project):

- `node /tmp/portpower-api-smoke.mjs`: passed missing-key startup, health aliases,
  empty response, synthetic Gulfport/Miami isolation, `region=all`, invalid-region
  rejection against a local HTTP server using the built main backend.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/portpower-browsers node /tmp/portpower-browser/smoke.mjs`:
  passed Chromium checks for markers, connecting status, immediate marker reset,
  retained Labels preference, unsupported ports, HTTP 503, malformed vessel lists,
  empty feed, obsolete-region response isolation, Reference/3D switching and
  reference remount. No uncaught page errors. Requests were mocked with explicitly
  synthetic observations. Browser tooling was installed only under `/tmp`.
- Screenshots: [Earth](earth.png), [Reference](reference.png), [3D model](model.png).
  The aerial texture rendered. External Earth tiles were not visible in this run;
  these screenshots do not validate third-party tile availability. The existing
  AIS status overlay is obscured by map/selector stacking; DOM state was verified,
  but a separate UI follow-up should make it visible.

Initial sandbox execution blocked tsx's IPC socket and npm network access; reruns
with the required execution permissions succeeded. During implementation the
first declarative texture version failed TypeScript constructor checks; the final
explicit-argument version passes. An accidental root-level npm invocation failed
because there is no root package.json; package-local commands above are authoritative.

## Audit and bundle warnings

All 10 moderate entries trace to `minimatch` globparts amplification denial of
service, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
through ESLint/config-array/typescript-eslint. These are development-tool dependency
findings, not ten independent browser vulnerabilities. Risk is excessive resource
use when affected tooling processes malicious glob patterns. Production-only audit
returns zero findings; this is not a comprehensive security guarantee.

npm's suggested fixes include changing the ESLint/typescript-eslint versions outside
current requested ranges. No force fix, lockfile mutation or dependency upgrade was
made. Resolve in a separate tooling PR with compatibility checks.

Vite successfully produces **1,363.27 kB minified JS / 377.15 kB gzip**. Its >500 kB
chunk message is a performance warning, not a build failure. Consider lazy-loading
the 3D view in a later measured performance change; do not suppress the threshold.

## API/UI limitations left unchanged

- Missing AIS credentials are safe: HTTP remains usable and lists are empty. The UI
  reports “AIS API connected” for a successful empty response; it cannot distinguish
  disabled credentials, no coverage, upstream disconnect, or no vessels.
- No upstream reconnect/heartbeat or stale eviction on main. A successful HTTP poll
  does not prove fresh AIS. Polls can overlap; old responses within the same region
  can overwrite newer ones. Fetch has no timeout or abort; region cleanup prevents
  obsolete-region updates but does not cancel the underlying request.
- Non-OK HTTP and invalid vessel-list shape become offline. An unrecognized JSON
  object without `vessels`/`data` is treated as an empty list. Invalid configured URL
  can throw before the try/catch. Null speed is coerced to zero in the popup.
- Last-known markers remain on a same-region request failure, without per-vessel
  stale indicators. Unsupported ports do not request AIS.
- Synthetic operational metrics remain distinct from AIS; Miami intentionally has
  no configured synthetic KPI dataset. The 3D scene remains Gulfport-inspired even
  when another port is selected, so clearer scene-context labeling is advisable.
- Pages workflow is nested under `portpower/.github/workflows`, so GitHub will not
  discover it as a root workflow. Its npm paths and hosting base need review before
  deployment. No root integrated startup/test workflow exists.

## Backend branch comparison and safest integration order

The refreshed `c1809a3` contains real additions beyond PR #3, not just documentation:

- `repositories/vesselRepository.ts`: transactional identity upsert, sampled
  position history (60 s per MMSI/region), history lookup; `/:mmsi/history` route.
- `aisClient.ts`: reconnect timer, duplicate connection guard, explicit disconnect,
  persistence calls; separate `utils/vesselRegion.ts` and region tests.
- `packages/core`: deterministic synthetic operations fixture, schema validation,
  berth/equipment/task conflict detection, workload and availability helpers.
- Operations migrations/repository: relational berths, calls, equipment, tasks,
  assignments; atomic writes and optimistic revision checks. GET/PUT
  `/api/operations/scenarios/:id` return validation/conflict/persistence information.
- `apps/web` supplies alternate vessel/history/freshness and operations views plus
  browser-draft fallback. Reuse selected adapters/ideas in `portpower/`, not the app.

**Priority 0 — agree contract and deliver a fixture-backed vertical slice.**
The branch requires `schemaVersion: operations-1.0`, ID `gulfport-demo-v1`, minute
indices, tasks and fixed equipment assignments. Shared v0.1 requires
`gulfport-demo-01`, step indices, jobs, batteries, chargers and tariffs. Neither
includes an agreed emissions calculation. Define an explicit reviewed adapter or
versioned contract; no silent renaming/unit conversion. Operations conflict checks
alone do not validate SOC, charger occupancy/power, site power, or energy savings.
Implement the Python service/evaluator, `/health` and `/optimize`, then Express
`/api/scenario`, `/api/simulate`, `/api/optimize` with validation, timeouts and fixture
fallback. Both schedules must use the same evaluator and reject infeasible savings.
Connect a single frontend adapter, loading/errors, playback and result comparison;
retain synthetic provenance and use calculated results, never placeholder savings.

**Priority 1 — selectively integrate AIS reliability and history.**
Port reviewed reconnect/freshness features while retaining main's typed normalizer,
CORS allowlist, `/api/health`, `.env.example`, and `region=all` compatibility. The
branch currently uses unrestricted CORS, lacks `/api/health`, and rejects explicit
`region=all`. Add migrations for the AIS `vessels`/`vessel_positions` tables including
`region` (only operations migrations are committed). Review history sampling under
concurrent writes: the NOT EXISTS check alone does not serialize two reports.
Add bounded persistence/backpressure and startup behavior that preserves the live
memory API when PostgreSQL is absent. Branch startup currently exits on database
failure before binding HTTP. Test DB-offline and restart cases before adoption.

**Priority 2 — bring operations persistence and editing into the primary UI.**
After contract agreement, selectively adapt core validation, revisions, repositories
and operations routes. Keep fictional calls separate from AIS MMSI observations;
never infer workloads from ETA/position. Preserve browser/fixture fallback and expose
conflicts explicitly. Run the PostgreSQL integration test on an isolated database
before claiming persistence works. Do not wholesale merge the branch: it descends
from superseded architecture and includes alternate frontend/docs/ownership changes.

**Priority 3 — deployment, presentation and performance.**
Fix deployment workflow location/configuration, provide integrated startup/CI,
update stale team docs with owners, repair source citations and scope pitch claims,
make feed status visible, review tooling advisories, then measure 3D lazy loading.
