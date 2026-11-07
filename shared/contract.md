# Shared integration contract — starter v0.1

**Status: proposed, NOT yet approved or implemented.** Finalize fields with all three coders at integration checkpoint, then freeze/version them. Examples under `shared/` are test fixtures, not verified port measurements.

## Architecture
Frontend consumes Express; Express consumes Python optimizer HTTP service; Express exclusively owns PostgreSQL. The optimizer must remain deterministic, callable without database access, and usable with JSON fixtures.

## Scenario
`scenarioId` stable string; `timeStepMinutes` integer (60 for the MVP); `timezone` IANA ID; `vessels[]` with `id,arrivalStep,departureStep` (end exclusive); `equipment[]` with ID, type, powertrain, energy and battery fields where applicable; `jobs[]` with vesselId, requiredEquipmentType/Units, start/end (end exclusive); `chargers` with count and sitePowerLimitKW; `energy` with energy and demand tariffs. `provenance` records assumptions; no hidden unit conversion.

## Output
`scenarioId`; `schedule[]` entries `{equipmentId,timeStep,action}` with action `work|charge|idle`; `hourlyPowerKW[]`; `peakPowerKW`; `energyKWh`; `estimatedCostUSD` (must specify period/what's included before a production claim); `unmetJobSteps`; `feasible`; `warnings[]`. If baseline and optimized results are compared, compute both with **identical accounting rules** and expose both assumptions.

## HTTP
- Express `GET /api/health` — health.
- Express `GET /api/scenario` — active fixture/DB scenario.
- Express `POST /api/simulate` — evaluate scenario + supplied schedule (never skip feasibility checks).
- Express `POST /api/optimize` — delegate optimization to Python and return result.
- Python `GET /health` — service health.
- Python `POST /optimize` — scenario JSON in; optimization result JSON out.

## Validation checklist
1. Step indices and vessel/job windows valid; every required job covered before its deadline.
2. Each equipment unit performs at most one action per step.
3. Battery starts within bounds, never below minimum and never above capacity; work depletes and charging replenishes energy within limits.
4. Charger occupancy at most `chargers.count`; charge power and site capacity obeyed each step.
5. Proposed result flags `feasible=false` and reasons if any constraint fails. It must not show positive savings for infeasible proposals.
6. Site-power baseline meaning must be agreed: for now `sitePowerLimitKW` bounds the fixture's modeled charging power; adding facility base loads will require schema update.
7. Tariff period / demand-charge treatment must be documented before combining cost buckets. Don't annualize single-day estimates without billing assumptions.
8. All geographic/context source facts have URLs; equipment operation and energy examples are labeled synthetic.

The example result is a **schema illustration**, not an optimizer-produced or verified schedule. Do not treat it as benchmark output.
