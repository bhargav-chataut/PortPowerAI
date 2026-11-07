# PortPower AI — rules for coding agents

**Primary team plan:** [TEAM_AGENTS.md](TEAM_AGENTS.md). **Contract draft:** [shared/contract.md](shared/contract.md). Do not follow the superseded TypeScript-monorepo/FastAPI-AI-adapter plans.

1. Read the team plan and shared JSON fixtures before coding. Treat these as a starter proposal; coordinate any contract changes with the lead.
2. Respect ownership: Nishan `backend/`; Binita `frontend/`; lead `optimizer/` + `shared/`; Warda `research/` + `pitch/`. Do not edit teammates' folders without agreement.
3. Use separate branches and reviewable PRs. Report exactly what was implemented, tested and left incomplete. Do not claim tests passed without running them.
4. Frontend framework is **not yet decided**. Do not force React/Vite or any other choice without Binita and the team's decision.
5. Keep port-specific facts in versioned configuration/data, not in optimizer or backend logic. First scenario ID: `gulfport-demo-01`.
6. Backend: Node.js + Express + PostgreSQL, fixture fallback; calls Python optimizer by HTTP. Python: independent service, no direct DB access. Frontend only calls Express API (or a fixture adapter before integration).
7. Verify every proposed schedule: vessel job coverage, work windows, battery SOC, number/power of chargers, and site power. Return `feasible=false` and warnings on invalid plans; never advertise an infeasible recommendation as savings.
8. Keep public Gulfport facts distinct from fictional machine assignments, electric fleets, chargers, energy values, savings and site layouts. Never infer real-world measurements from published inventory or vessel ETA.
9. No live port integrations, autonomous dispatch, industrial control, AI training, fully accurate 3D, accounts or unsupported ROI claims in P0.
10. No API keys in client code, fixtures or commits. Add startup scripts and tests inside your own folder when implementation begins.

**PR checklist:** ownership scope; contract compatibility; exact run/test commands and results; screenshots for UI work; provenance/limitations; unresolved blockers.

The existing `demo/index.html` is a standalone historical demo, not the new frontend source of truth. Preserve it as a fallback; do not modify it unless assigned.
