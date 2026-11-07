# PortPower AI — Team + AI Agent Instructions

**Goal:** Deliver one Gulfport-inspired planning prototype with vessel activity, equipment work/charging, constrained optimization, and baseline-versus-optimized energy/cost estimates.

**Stack decision (Nov 6, 2026):** Nishan uses **Node.js + Express + PostgreSQL**. The project lead builds an **independent Python optimizer** with an HTTP endpoint (OR-Tools optional). **Binita's frontend framework is TBD**. Warda owns evidence and pitch.

## Product model
Build **one reusable port-energy optimization platform**, configured separately per terminal. Site-specific maps, equipment, schedules, tariffs, chargers and rules belong in configuration. The team would set up and validate a customer installation with operator permission; the operator reviews recommendations. No autonomous machinery control.

**Hackathon:** One `gulfport-demo-01` example. Public sourced Gulfport facts may inform context; equipment operations, charging and savings are synthetic unless verified. **Port of Gulfport is not a stated customer or partner.**

## Ownership

| Teammate | Branch | Folder | Deliverable |
|---|---|---|---|
| Nishan Thapa | `feature/backend-nishan` | `backend/` | Node/Express REST endpoints, PostgreSQL, baseline simulator and Python HTTP adapter; fixture fallback |
| Binita | `feature/frontend-binita` | `frontend/` | 2D/isometric terminal, vessel and equipment, time playback, KPI/power charts and before/after toggle |
| Project lead | `feature/optimizer` | `optimizer/`, `shared/` | Standalone Python optimization service, schema/fixtures, feasibility tests and integration |
| Warda | `docs/research-warda` | `research/`, `pitch/` | Gulfport source ledger, assumptions, customer/competitor research and demo script |

**Architecture:** `frontend → backend (Express) → optimizer (Python HTTP)`. Only backend accesses PostgreSQL. All code should start with shared fixture data and be independently runnable. Never block frontend demo on DB availability.

## P0 (must ship)
- One 24-step day and one vessel arrival/departure work window.
- Synthetic jobs, electric equipment, batteries and chargers with explicit limits.
- Baseline schedule and valid optimization preserving required work and battery minimum.
- Playback / 2D digital twin, chart, feasible/infeasible status and calculated before/after metrics.
- Source/assumptions labels and a reliable static fallback.

**Not P0:** real-time Gulfport control, account management, trained ML, photo intake, live AIS/weather, full 3D, complex berth optimization, verified facility ROI.

## Research reference leads (verify prior to use)
- [Ports America — Gulfport equipment](https://www.portsamerica.com/our-locations/gulfport-ms)
- [Port of Gulfport — vessel schedule](https://shipmspa.com/doing-business/tariff/vessel-schedule/)
- [Port of Gulfport — facilities](https://shipmspa.com/doing-business/business/facilities-properties/)
- [Marine Cadastre historical AIS](https://marinecadastre.gov/ais/)
- [NOAA tides API](https://tidesandcurrents.noaa.gov/web_services_info.html)
- [GCOOS](https://data.gcoos.org/)
- [OpenStreetMap](https://www.openstreetmap.org/) (observe attribution/license)

The researcher must log each checked URL, retrieval date, fact, confidence, and explicit SYNTHETIC assumptions in `research/gulfport_sources.md`. Public vessel arrival data do not prove equipment work demand.

## Integration contract (proposed; freeze with team)
Use `shared/contract.md`, `shared/scenario.example.json`, `shared/result.example.json`. Keep fields/units stable after agreement. Backend:
`GET /api/health`, `GET /api/scenario`, `POST /api/simulate`, `POST /api/optimize`.
Python: `GET /health`, `POST /optimize`.
`POST /api/optimize` forwards the scenario to Python using `OPTIMIZER_URL`; Python never accesses PostgreSQL. A result includes a time-stepped schedule, peak kW, energy kWh, estimated cost, unmet job steps, feasible flag and warnings. Both baseline and proposal must be scored with **the same evaluator**.

## Copy to each agent
- **Nishan:** "Own `backend/` only. Build Express + PostgreSQL with validation, migrations, health/scenario/simulate/optimize endpoints, and a fixture-only fallback when DB is unavailable. Use the shared contract; call the independent Python `POST /optimize` using `OPTIMIZER_URL`. Add a blank `.env.example` and endpoint tests. Start with mock responses; integrate for the first vertical slice. Don't edit other owners' folders."
- **Binita:** "Own `frontend/` only. Confirm framework with team before scaffolding. Build a polished 2D/isometric Gulfport-inspired (not geospatially exact) port scene with vessel, fleet status, charge area, hour playback, before/after toggle, KPI cards and chart. Use a single adapter with shared mock JSON and later Express API. Never hardcode invented savings as live calculated results."
- **Lead:** "Own `optimizer/` and `shared/`. Build a testable `optimize_scenario` in an independent Python HTTP service (FastAPI preferred, Flask acceptable). Enforce job coverage, SOC, charge windows, charger count and site power; return explicit infeasibility. Prefer feasible deterministic heuristic over an untested solver. Finalize JSON contract with everyone, test it, and coordinate integration. No direct PostgreSQL."
- **Warda:** "Own `research/` and `pitch/`. Verify public port layout/equipment/vessel facts with date-stamped URLs, source distinctions and confidence. Write assumptions ledger, buyer/competitor notes, concise pitch outline and 60-second demo script. Never call simulated values observed port measurements."

## Checkpoints
- **Nov 6:** Agree fixture and schema; each service can start independently; public source ledger starts.
- **Nov 7:** One vertical slice, frontend → Express → Python, with consistent results.
- **Nov 8:** Working playback, constraints, charts, smoke tests and pitch.
- **Nov 9:** Freeze, rehearse and present; only critical fixes.

**Acceptance:** Load `gulfport-demo-01`, show vessel work and baseline schedule, run feasible charging optimization over HTTP, replay and compare peak kW/kWh/estimated cost with documented assumptions. Demonstrate infeasible constraints safely.

**Team protocol:** One branch per owner, no silent cross-folder edits, review schema changes, PR notes with test commands/results, and short daily blocked/next check-ins. Prioritize a working integrated demo.
