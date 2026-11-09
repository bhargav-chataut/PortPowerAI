# PortPower AI — Development Progress

**Updated:** November 8, 2026  
**Active development:** Live vessel intelligence and database persistence

## Completed

### OPS-02 — separate operations tables

- Added scenario-scoped `berths`, `vessel_calls`, `equipment`, `cargo_tasks`,
  and `task_equipment_assignments`, with foreign keys and synthetic-data checks.
- Backend reconstructs the existing API response from relational rows and saves
  all related changes in one revision-checked transaction.
- Startup/`npm run db:migrate` backfills saved JSON scenarios once, preserving
  edits and revisions. Original snapshots and AIS tables remain intact.
- PostgreSQL tests cover migration, reinitialization, assignments, empty
  collections, constraints, concurrent updates, and rollback after a partial save.

### OPS-01 — fictional operations planning

- Shared operations types, synthetic fixture, structural validation and deterministic conflict checks.
- `/operations` planner: berth states, vessel calls, cargo tasks, equipment workload,
  editable assignments/availability, and a timeline. All operations are labeled fictional.
- GET/PUT scenario API with PostgreSQL JSONB documents and atomic revision checks.
- Additive startup migration and seed that preserves existing edits and AIS tables.
- Explicit browser-local offline demo; no automatic sync to the database.
- Backend API and real PostgreSQL temporary-table tests, plus frontend persistence/client tests.

Limitations: one fictional day; no physical berth dimensions, cargo capacity, workforce,
tides, or automatic optimization. A conflict-free result covers only modeled assignments.
Browser visual/interactions have not been automatically verified in this session.

- [x] Set up the existing GitHub repository
- [x] Create `feature/backend` development branch
- [x] Initialize Express + TypeScript backend
- [x] Configure TypeScript and environment variables
- [x] Implement `/health`
- [x] Connect to AISStream via WebSocket
- [x] Receive live AIS position reports
- [x] Normalize and validate vessel positions
- [x] Implement in-memory vessel storage
- [x] Implement `GET /api/vessels`
- [x] Create React + TypeScript application
- [x] Connect React to Express
- [x] Display vessel records in a table
- [x] Display vessel markers on Leaflet
- [x] Add vessel search and selection
- [x] Create PostgreSQL database `portpower_db`
- [x] Create `vessels` table
- [x] Create `vessel_positions` table
- [x] Connect Express to PostgreSQL
- [x] Confirm vessel and position records in database

## Current Status

The live vessel monitoring pipeline is functional.

The frontend displays vessel information received by the backend, and PostgreSQL contains recorded vessel positions.

Latest confirmed database check:

- 17 vessel identities
- 40 historical position records

These figures are a development snapshot, not a live count.

## Next Tasks — Data Reliability

- [ ] Verify persistence after backend restart
- [ ] Implement position-history sampling
- [ ] Separate AIS report time from server receipt time
- [ ] Add stale-position detection
- [ ] Handle AIS disconnections and reconnections
- [ ] Add tests for AIS parsing and database writes
- [ ] Test AIS coverage around Gulfport

## Planned — Port Operations

- [ ] Design `berths` schema
- [ ] Design `cargo_jobs` schema
- [ ] Design `equipment` schema
- [ ] Implement cargo scheduling APIs
- [ ] Implement equipment availability APIs
- [ ] Display simulated terminal workloads

## Planned — Optimization Integration

- [ ] Agree on optimizer input/output schema
- [ ] Connect backend to optimization service
- [ ] Detect cargo and equipment conflicts
- [ ] Generate feasible recovery plans
- [ ] Compare completion times and energy costs
- [ ] Explain constraints and infeasible cases

## Planned — Hackathon Demonstration

- [ ] Create a reproducible fictional terminal scenario
- [ ] Simulate a vessel arrival delay
- [ ] Demonstrate recovery-plan generation
- [ ] Show operational and energy tradeoffs
- [ ] Provide offline fallback
- [ ] Test complete demonstration

## Working Agreements

- Do not commit API keys or `.env` files.
- Use feature branches and pull requests.
- Review shared API or optimization contract changes with teammates.
- Keep existing demonstrations operational.
- Separate observed AIS data from simulated terminal data.
- Update this file after meaningful changes.

## Development Log

### November 8, 2026

- Verified AISStream reception and coordinate extraction.
- Confirmed React vessel display and interactive map.
- Connected PostgreSQL and implemented database writes.
- Confirmed 17 vessels and 40 position records from SQL queries.
- Began documenting architecture for team collaboration.
