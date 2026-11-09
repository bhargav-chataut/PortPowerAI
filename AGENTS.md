# AGENTS.md — Codex instructions for PortPower AI

Read `docs/TECHNICAL_SPEC.md`, `docs/API_AND_DATA_CONTRACTS.md` and `docs/TASK_BOARD.md` **before editing**. Product concept source is the supplied `PortPower_AI_Hatchathon.docx`; technical docs contain proposed implementation choices.

## Hard rules
1. Never invent real port data, estimated savings, specs, tariffs or citations. Synthetic values must be visibly labeled synthetic.
2. AI extraction is not numerical optimization; only deterministic, validated core functions calculate metrics.
3. Never present an infeasible proposal as a valid nudge. Preserve required work, charger limit, grid cap, battery SOC and charge windows.
4. Keep the P0 simulator runnable with no API key, backend, network or hosted ML model.
5. Treat `packages/core/src/types.ts` as contract authority. If change is necessary, propose it in the PR before editing files owned by other tracks.
6. Do not expose provider API keys in frontend, source control, logs or exported reports.
7. No industrial control, autonomous dispatch or promises of validated financial savings.
8. Tests are mandatory for formulas, schedulers, constraints and provenance.

## File ownership boundaries
- `frontend-agent`: `apps/web/**`; may import but not edit `packages/core/**`.
- `core-agent` (AI lead supervises): `packages/core/**`; owns numeric simulation and optimization, plus fixture validation.
- `backend-agent`: `services/ai-api/**`; no changes to engine or UI by default.
- `integration-agent` (explicitly assigned only): root build configs and shared integration files; coordinates contract migrations.
- `research-human`: assumptions ledger, public citations, claims, presentation and test-case validation.

## Branch / task protocol
1. Pick one ticket from `docs/TASK_BOARD.md` and state files to change.
2. Identify assumptions/uncertainties before coding; follow v1 contracts exactly.
3. Implement smallest working vertical slice, include tests.
4. Run relevant lint/typecheck/tests and note commands and outcomes. If tooling is missing, say so explicitly.
5. Submit concise PR notes: scope, changed files, results, screenshots if visual, any changed assumptions, open questions.
6. Do not merge or overwrite another agent's in-progress files without team review.

## Commands (target scripts; create when bootstrapping)
- Current React app (from `apps/web`): `npm run dev`, `npm run build`, `npm test`.
- Shared operations core is built automatically by frontend/backend prebuild, predev,
  and pretest hooks. Existing domain tests run in the vessel backend suite.
- FCFS core unit tests (from repository root): `npm test --prefix packages/core`.
  The pretest builds core using the backend's installed TypeScript compiler.
- Real PostgreSQL operations test (from `services/vessel-api`):
  `OPERATIONS_POSTGRES_TEST=1 npm test` (isolated schema, removed after testing).
- Apply operations migrations without starting AIS (from `services/vessel-api`):
  `npm run db:migrate`.
- Vessel backend (from `services/vessel-api`): `npm run build`, `npm test`, `npm run dev`.
- `npm install`
- `npm run dev --workspace apps/web`
- `npm run test --workspace packages/core`
- `npm run build --workspace apps/web`
- `python -m pytest services/ai-api/tests`

If actual workspace scripts differ, update `README.md` and this file rather than pretending the commands work.

## Definition of output quality
- No placeholder charts/percentages disguised as engine output.
- Strong empty/loading/error states and mobile layout.
- Clear units (`kW` versus `kWh`, gallons, USD, kgCO2e).
- Deterministic results and explicit case of 'no feasible charging schedule'.
- Ability to demonstrate P0 offline from versioned fixtures.

## Agent task prompt template
```text
You are the [frontend/core/backend] agent for PortPower AI.
Read AGENTS.md and all docs under docs/.
Ticket: [ID and description].
Allowed edit paths: [paths].
Do not modify other ownership paths.
Honor v1 shared interfaces; synthetic numbers are examples only.
Write implementation and automated tests; run available checks.
Return: files changed, exact commands/tests, screenshots (if UI), unresolved decisions, PR summary.
```
