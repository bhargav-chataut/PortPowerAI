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

## AIS integration preview (Binita + Nishan)

The existing `portpower/` React dashboard remains the primary UI. The optional vessel service in `services/vessel-api/` is based on Nishan's committed branch, with corrected typed-position decoding and region filtering.

Local development (two terminals):

```sh
cd services/vessel-api
npm ci
cp .env.example .env
# Put your own AISSTREAM_API_KEY in .env, never in git.
npm run dev
```

```sh
cd portpower
npm ci
npm run dev
```

Open Vite's local URL and choose **Gulfport** or **Miami** at the top of the map. Vite proxies `/api` to `http://127.0.0.1:3000`. Use `GET /api/vessels?region=gulfport` or `?region=miami` to inspect live observations. With no API key, the backend still starts and returns an empty list; the original 3D demo remains usable. A deployed static page needs a separately hosted backend and `VITE_AIS_API_URL` configured at build time.

**Limitations:** live AIS coverage is not guaranteed; timestamps reflect backend receipt time, not verified transmission time. An AIS position inside a monitoring rectangle does not establish a berth assignment or cargo job. Operational KPI cards in Binita's frontend are illustrative synthetic examples, not live Gulfport measurements. This first PR does **not** include Nishan's newer, locally developed PostgreSQL/history code; those changes must be committed/reviewed separately. No optimizer integration or industrial control is implied.
