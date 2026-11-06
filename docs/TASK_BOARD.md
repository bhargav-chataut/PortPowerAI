# PortPower AI — Parallel Build Task Board

## Owners
- **Frontend (experienced):** app shell, controls, timeline, charting, SVG twin, local engine integration.
- **Backend (less experienced):** optional AI FastAPI adapter, schema validation, health endpoint, manual-mode graceful fallback; may help with smoke testing while P0 runs.
- **AI / core lead (you):** canonical fixture/types, numerical formulas, optimization heuristic, tests; AI intake prompts/schema at P1.
- **Research + presentation:** assumptions/provenance spreadsheet, source review, demo narrative, challenge alignment, skeptical-user Q&A. No code dependency.

## Phase 0 — freeze contracts (all 3 coders, FIRST)
| ID | Owner | Task | Done when | Depends on |
|---|---|---|---|---|
| C-01 | AI/core | Approve v1 TypeScript domain interfaces, fixture structure, units and scenario lineage | Three coders approve + fixture committed | none |
| C-02 | Research | Assumptions ledger: each value, unit, origin, uncertainty, applicable billing period | Fixture numeric assumptions reviewed and labeled | C-01 draft |
| C-03 | Frontend | Vite/TS monorepo bootstrap, workspace imports, shared commands | Empty UI builds + core import works | C-01 |

## Phase 1 — independent workstreams
| ID | Owner | Task | Done when | Depends on |
|---|---|---|---|---|
| CORE-01 | AI/core | Scenario validator + 24-slot fixture | Rejects malformed data, no silent defaults | C-01 |
| CORE-02 | AI/core | Baseline simulator | Tests show work, kWh, fuel, peak, cost buckets, emissions | CORE-01 |
| CORE-03 | AI/core | Idle reducer | Converts eligible idle only, active work unchanged, tested | CORE-02 |
| CORE-04 | AI/core | Charging stagger heuristic | All constraints preserved, infeasible returns reason, tested | CORE-02 |
| FE-01 | Frontend | Dashboard shell + synthetic banner + metric cards | Responsive, sample typed fixture displayed | C-03 |
| FE-02 | Frontend | Timeline & SVG top-down 2D twin | Asset status and hour highlighted from scenario state | FE-01 |
| FE-03 | Frontend | Scenario controls + compare cards + invalid-state UX | Recomputed results, no hard-coded metrics | FE-01, CORE-02 |
| BE-01 | Backend | FastAPI `/health` + Pydantic draft schemas | Tests pass, CORS/env configured | C-01 |
| BE-02 | Backend | `/api/inspect/text` mock adapter | Validated draft response, timeouts/fallback tested | BE-01 |
| RE-01 | Research | Port/equipment assumptions with uncertainty notes | No real-port claims based on synthetic values | C-02 |
| RE-02 | Research | Pitch story + judge objections | Explains motion-control relevance, baseline/counterfactual | RE-01 |

## Phase 2 — integrate in priority order
| ID | Owner | Task | Done when | Depends on |
|---|---|---|---|---|
| INT-01 | Frontend + core | Wire simulation and both nudges into UI | Demo path end-to-end with correct scenario comparisons | CORE-03, CORE-04, FE-03 |
| INT-02 | Frontend | Edit at least 3 inputs + report export | Metrics recompute, results reproducible | INT-01 |
| INT-03 | All | Full demo smoke test / freeze | P0 acceptance list in spec all passes | INT-02 |

## Phase 3 — P1 ONLY after stable P0
| ID | Owner | Task | Done when | Depends on |
|---|---|---|---|---|
| AI-01 | AI lead + backend | Real provider text/photo inspection, with validation | User must confirm before input to simulator | BE-02, INT-03 |
| AI-02 | AI/core | Partial electrification scenario and optional payback | Compares against four-diesel scenario using explicit capex | INT-03 |
| FE-04 | Frontend | AI confirmation panel / image upload | Never silently adds guessed numeric specs | AI-01 |

## Merge discipline
C-01 is a **blocking ticket**. Until contracts are stable, frontend can build with typed fake *objects*, not fabricated financial *results*; backend can implement independent health/schema endpoints; core can build fixtures/tests. Avoid merging `FE-03` against guessed interface shapes.

## Daily 10-minute sync format
1. Yesterday's completed ticket + PR.
2. Today's ticket and allowed paths.
3. Contract blockers / assumption questions.
4. Integration smoke-test status.

## Team-wide demo acceptance
- Four-diesel example exists; electric/mixed scenario explicitly separate.
- Both requested nudges are demonstrated in scenarios where they apply.
- Infeasible charging visibly fails safely.
- Three controls cause recalculation or an explained no-op.
- Report exports explicit assumptions, units, version and synthetic disclaimer.
- UI works when optional AI backend is off.