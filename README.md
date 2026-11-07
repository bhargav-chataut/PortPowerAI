# PortPower AI

USM Hatchathon — Blue Economy / Ocean Power. A **configurable, advisory port-energy planning platform** demonstrated using a **Port of Gulfport-inspired** scenario.

**Current status:** Team integration in progress. The standalone older proof of concept lives at [demo/index.html](demo/index.html) and opens locally in a browser. **It is NOT the connected Node/Python architecture or a verified Gulfport digital twin.**

## MVP for November 9
One day, one vessel work window, a small **synthetic** equipment fleet, charger constraints, baseline vs feasible optimized schedule, a 2D terminal visualization, and before/after estimated energy, peak power, and operating costs. Results must show assumptions and infeasibility rather than fabricated benefits.

## Team and architecture
- **Nishan:** `backend/` — Node.js + Express + PostgreSQL, REST adapter and simulator.
- **Binita:** `frontend/` — visual port, playback, controls, before/after comparison. **Framework TBD by team.**
- **Project lead:** `optimizer/` and `shared/` — standalone Python optimizer HTTP service, integration and contracts.
- **Warda:** `research/` and `pitch/` — verified public Gulfport references, assumption ledger, customer research and demo pitch.

**Integration:** frontend → Express backend → Python optimizer. The backend alone owns PostgreSQL. Each component must work first from versioned JSON fixtures. Backend should remain usable with fixture mode if Postgres is down.

## Start here
1. Read [TEAM_AGENTS.md](TEAM_AGENTS.md) and [AGENTS.md](AGENTS.md).
2. Review [shared/contract.md](shared/contract.md), [shared/scenario.example.json](shared/scenario.example.json), and [shared/result.example.json](shared/result.example.json). These are **starter integration fixtures; finalize the contract together before implementing**.
3. Work in your own folder and feature branch. Open PRs with commands and tests; don't overwrite another person's work.
4. Once backend/frontend/optimizer code is committed, document real run/test commands here. **No integrated build command exists yet.**

## Expected endpoints
Express: `GET /api/health`, `GET /api/scenario`, `POST /api/simulate`, `POST /api/optimize`.
Python: `GET /health`, `POST /optimize`. Configured through `OPTIMIZER_URL`. See shared contract for the response shape.

## Data integrity
Use sourced public references only for public geographic, infrastructure and inventory facts. A published equipment count does **not** establish powertrain, hourly availability, energy use or charging infrastructure. Vessel times and job assignments are not equivalent. Synthetic equipment/work/energy/savings values must be clearly marked. No Gulfport partnership, live telemetry, machinery control or guaranteed savings are claimed.

## Demo fallback
Open `demo/index.html` directly to show an **older, fully synthetic offline prototype** if integrated services are unavailable. Its math and data schema are separate from the new shared contract; do not describe it as the Python-optimizer integration.
