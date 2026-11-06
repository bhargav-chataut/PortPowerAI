# PortPower AI — Technical Implementation Specification

**Version:** 1.0 · **Status:** Proposed / team alignment · **Challenge:** USM Hatchathon, Blue Economy, Challenge 09: Ocean Power  
**Audience:** Frontend developer, backend developer, AI lead, research/pitch teammate, Codex coding agents.  
**Source of truth for project intent:** `PortPower_AI_Hatchathon.docx` (team concept report). This document makes explicit engineering decisions not fixed by the report; they are **proposals**, not assertions about an existing implementation.

## 1. Product in one sentence
A browser-based, motion-aware port energy planning simulator that helps operators compare a synthetic baseline against **feasible** charging and idling schedule nudges, with transparent estimated cost, emissions, and peak demand.

### Promise / non-promise
- **Does:** model equipment duty cycles, workloads, hourly electricity/fuel use, charger availability; calculate baseline and candidate scenarios; report assumptions; visualize what changed.
- **Does not:** operate industrial equipment, infer machine specifications from an image, claim real port measurements, offer validated savings or safety/engineering approval.
- **Why motion-aware:** charge/idle/active windows and required jobs constrain allowable energy optimization. A cheaper energy plan is invalid if required work is missed.

## 2. Scope and priorities

| Priority | Requirement | Acceptance check |
|---|---|---|
| P0 | Reproducible synthetic port dataset | Same versioned JSON input produces same output |
| P0 | Baseline simulation | kWh, fuel, peak kW, estimated cost and emissions calculated with units |
| P0 | Charging-stagger nudge | Schedules stay in charging windows, charger count, grid cap and energy/SOC bounds |
| P0 | Idle reduction nudge | Reduces idle fuel only in eligible idle slots; required active jobs remain intact |
| P0 | At least three working controls | e.g. tariff, charger power, electric unit count or permitted charge window, each recomputes metrics |
| P0 | Compare + report | Before/after metrics, constraint status, provenance and limitations shown |
| P1 | AI text/photo inspector | Suggestions stay unconfirmed until user validates details |
| P1 | Diesel→electric replacement | Estimated capex, energy/emissions, payback if assumptions supplied |
| Stretch | Voice, 3D, solar/battery optimization, real integrations | Only after P0 passes |

**Product guardrail:** The concept report's fictional showcase starts with four diesel forklifts and considers replacing two with electric. **Charging-staggering is only meaningful in a mixed/electric scenario**, not the all-diesel baseline. The app must distinguish these scenarios in labels and comparisons.

## 3. Architecture (chosen for hackathon delivery)

```text
[React / Vite / TypeScript / Tailwind UI]
          |         |
          |         +--> [Shared TypeScript domain engine, local/in-browser]
          |                  +--> baseline simulation
          |                  +--> feasible charging heuristic
          |                  +--> idle reduction rule
          |                  +--> scenarios / scoring / provenance
          |         
          +--> [Optional FastAPI backend] --> [Vision/text AI provider]
                     |                   (only classification/explanation)
                     +--> /health, /api/inspect (P1)

[Versioned synthetic fixtures JSON] --> [Domain engine] --> [Results JSON] --> [Charts / 2D twin / export]
```

**Reasoning:** A static Vercel deployment can run the entire numerical demo. API secrets never enter the browser. The inexperienced backend developer gets a contained service that does not block P0. The AI developer owns extraction/prompting and domain integration, **not** the accounting math.

### Stack (proposal)
- Frontend: React + Vite + TypeScript, Tailwind CSS, Recharts, Lucide icons; SVG/CSS top-down port view first, no Three.js dependency for P0.
- Calculation/optimizer: plain TypeScript, pure functions, Vitest. Rule-based search/greedy feasible heuristic, not ML.
- Optional service: Python FastAPI, Pydantic, pytest, CORS restricted to approved origins, provider credentials via environment.
- Persistence: static fixture JSON, `localStorage` for user-created scenarios (not secrets), JSON export. No database for MVP.
- Deployment: Vercel for frontend, optional server hosting for AI. Must work in offline/no-key demo mode.

## 4. Repository and ownership

```text
portpower-ai/
  README.md
  AGENTS.md
  docs/
    TECHNICAL_SPEC.md
    API_AND_DATA_CONTRACTS.md
    TASK_BOARD.md
  apps/
    web/
      src/
        app/                 # routing / layout / state wiring
        components/          # reusable visual components
        features/            # intake, dashboard, scheduler, report
        visuals/             # 2D port twin + timelines
        styles/
      public/
  packages/
    core/
      src/
        types.ts             # authoritative domain types
        validate.ts          # input validation and cross-field checks
        simulate.ts          # baseline / scenario physics and accounting
        optimize.ts          # deterministic feasible schedule search
        report.ts            # comparisons and provenance propagation
      tests/
      fixtures/
        gulfport-demo-v1.json
  services/
    ai-api/
      app/main.py
      app/schemas.py
      app/inspector.py
      tests/
  .env.example
```

**Code ownership:** Frontend person: `apps/web/**`; AI lead: `packages/core/**` and AI extraction design; backend person: `services/ai-api/**`. Shared contract files require a short team review before edits. Research teammate owns assumptions ledger, source citations, test input realism, demo script; no coding dependency.

## 5. User journey / demo happy path
1. Open **Demo Port**. Banner: “Synthetic example — not real port operational data.”
2. Show asset inventory (4 diesel forklifts in the original baseline) and a shift schedule; show input provenance.
3. Simulate baseline and display fuel cost, estimated emissions, grid peak and job completion.
4. Apply **Reduce Eligible Idle Time**. Engine preserves work requirements and shows savings only when diesel idle is actually modeled.
5. Create **Replace 2 with electric** scenario using explicit equipment and capex assumptions, then show added charging demand.
6. Apply **Stagger Charging** in that electrified scenario; compare against **unstaggered electric scenario**, not against diesel-only as though diesel charging existed.
7. Drag charge windows or change tariff / charger power / number of electric units; recompute and show infeasibility messages as needed.
8. Export assumption-rich before/after report with scenario lineage and caveats.

**Important comparison discipline:**
- Diesel baseline → mixed electric: fuel, power, emissions, capex and workload comparison.
- Mixed electric naive charging → mixed electric optimized charging: scheduling impact, peak and demand charges.
- Diesel idle baseline → diesel idle optimized: modeled idle fuel / related costs.
Never attribute electrification savings to charging optimization or vice versa.

## 6. Canonical modeling assumptions (implementation choices)
- P0 uses **hourly discrete slots** over a 24-hour representative day. A future iteration can use 15-minute slots.
- Every quantity has a unit; all financial inputs are **USD**. Energy is kWh, instantaneous/average slot demand kW, fuel gallons, emissions kgCO2e (operational scope indicated).
- `workUnitsRequired[t]` is the required modeled equipment work in each slot. For hackathon purposes one active forklift provides one work-unit per slot; no claim this is physical cargo throughput.
- Equipment status per slot is exactly one of `active | idle | charging | off`. Diesel never charges. Electric never consumes diesel.
- Active time and work demand must remain valid across scheduling changes; **idle reduction** converts only eligible diesel `idle` time to `off`, not active time.
- Electric charging energy per slot = `chargerKw * slotHours * chargeEfficiency` (battery energy gained). Grid draw = `chargerKw * slotHours`; cap to remaining battery capacity. No simultaneous `active` and `charging` for one unit.
- Electric active consumption is a user-provided kWh/hour estimate; idle electric consumption may be separately modeled or set to zero explicitly as an assumption.
- Battery SOC must stay within min/max bounds for all slots, including shift end minimum. Define initial SOC in inputs.
- Facility load (kW) = site base-load kW + sum electric charging kW (+ modeled other loads if present). Demand peak is the **maximum facility load across slots**. Do **not** confuse kW with kWh.
- Electricity energy charges = Σ(facility kWh × slot tariff USD/kWh); demand charges = peak kW × USD/kW for the modeled billing period, applied consistently. Avoid annualizing a single representative day of demand charges by multiplying by 365. When no billing interpretation exists, report **illustrative daily energy cost** and **modeled demand charge per billing period** separately.
- Diesel gallons = active hours × active gal/h + idle hours × idle gal/h; cost = gallons × USD/gal. Emissions = diesel gallons × kgCO2e/gal + grid kWh × kgCO2e/kWh. Declare operational boundary; no lifecycle claims.
- Equipment capex, charger capex and maintenance assumptions stay separate from operational cost; payback = incremental capex / annual net operating savings only when positive annual savings and a defensible annualization are provided.
- Default optimizer objective for P0: minimize scenario **energy + fuel + demand charges**, subject to constraints. Emissions are a secondary reported metric; weighted carbon cost may be enabled explicitly. Do not silently combine USD and kg using arbitrary unitless weights.
- Optimization is **deterministic**, with stable tie-breaking by asset ID and earliest permitted slot.

## 7. Optimization design

### 7.1 Charging nudge (P0)
Input: a verified electric scenario, slot base load/tariff, charger limits, charge availability, shift work requirements and SOC properties.

1. Validate the scenario. If an electric unit, charging window or battery data is missing, return a clear `INCOMPLETE_INPUT` message.
2. Build a required-active schedule from immutable workload allocations; P0 does **not** rearrange active shifts.
3. For each electric machine, find feasible charge slots (`off`/permitted `idle`, outside required active time, within available charger/port power limits).
4. Search candidates deterministically by lowest projected **incremental peak first**, then energy tariff cost, then slot index. Consider required energy before future active intervals, not just final SOC.
5. Update SOC sequentially; allocate charging only when energy fits battery bounds and allowed slots. If feasible energy cannot be supplied, mark scenario infeasible and explain the binding constraint.
6. Recompute all metrics from the candidate schedule; never hard-code “saved 20%”. Compare with a documented naive charging policy.

**Feasibility checks:** required work per slot; asset availability; charger concurrency; charge window; site power ceiling; per-machine SOC at every slot; charger compatibility; no overlapping states. If infeasible, do not present the candidate as a valid recommendation.

### 7.2 Idle nudge (P0)
- Eligible idle slots are explicitly tagged as interruptible; do not assume all idling is avoidable.
- Convert selected diesel idle slots to `off` while preserving immutable active/job allocations.
- Recompute fuel and emissions; show the exact number of altered idle hours and assumption about restart/operational practicality.
- Warn that estimated benefits exclude restart effects unless modeled.

### 7.3 Nudge ranking
Return candidate records with `feasible`, `constraintViolations`, `deltaMetrics`, `changes`, `assumptionsUsed`, `explanation`. Sort **feasible only** by modeled cost improvement and use emissions for tie-breaking; show infeasible candidates separately.

## 8. Contract-first data flow
All numerical functions operate on the canonical `PortScenario` and return a `SimulationResult`. AI results use a separate `InspectionDraft` and **cannot** be passed directly into simulation until validated/confirmed.

- `loadFixture()` → `validateScenario()` → `simulate()` → `buildIdleNudge()/buildChargeNudge()` → `simulate()` → `compareResults()`.
- Frontend state keeps an immutable baseline, a derived proposal, and a currently selected comparison; changing an input creates a new scenario version.
- `scenarioId`, `parentScenarioId`, and `datasetVersion` enable correct comparisons and reproducibility.
- See `API_AND_DATA_CONTRACTS.md` for exact TypeScript interfaces, example JSON, endpoints and error formats.

## 9. Frontend specification
**Layout:** left equipment / scenario controls, central SVG top-down port diagram and slot timeline, right recommendation cards; metric strip at top (cost, grid kW peak, diesel gallons, estimated kgCO2e, work met). Responsive stacked layout on narrow screens.

**Required components:** `ScenarioSelector`, `FleetInventory`, `ShiftTimeline`, `PortTwin2D`, `MetricStrip`, `ControlsPanel`, `NudgeCard`, `ComparisonPanel`, `AssumptionsDrawer`, `ExportReportButton`, `ConstraintAlert`. Keep all numbers from engine output.

**UI rules:** clearly distinguish baseline vs scenario; kW vs kWh labeled; dataset flagged synthetic; metric source/provenance visible; pending AI classification visibly unconfirmed; invalid scenario alerts actionable; controls recompute local engine without hitting backend. A 2D SVG twin with moving status indicators is sufficient; focus on polished legibility, not ornamental 3D.

## 10. Backend + AI integration
Backend **is optional for the P0 demo**. For P1, FastAPI accepts short text and/or a small image, calls the chosen AI provider using a server-side key, and returns an `InspectionDraft` (equipment category guess, issue summary, missing fields, confidence label if provider supports it). User must confirm specifications in the frontend form.

- No hallucinated equipment consumption, emissions, price, maintenance, charger compatibility, capex or port facts.
- AI must never execute optimizer code, mutate authoritative fixtures, or make financial conclusions by itself.
- Validate MIME type, upload size, request length, output schema and timeouts. No image persistence by default. Use sanitized error messages without exposing API keys.
- Frontend can always fall back to manual input. Demo must not depend on network/provider uptime.

## 11. Testing + acceptance

### Unit tests (core)
- Repeat input → bytewise-stable relevant outputs.
- Zero diesel/electric units yields no phantom consumption; charging a diesel is rejected.
- No charge during active slots; concurrent chargers never exceed capacity.
- Power cap always respected; SOC never negative or above capacity.
- Insufficient charge window returns infeasible, **not** fabricated savings.
- Idle nudge does not change active time or work completed.
- Lower peak can reduce demand charge under fixed tariff, with costs calculated from inputs.
- All reported savings equal baseline minus optimized metrics with matching scenario lineage.
- Emissions reflect both diesel and grid electricity, with factors disclosed.

### Integration tests
- Load bundled fixture → baseline → nudge → comparison → export.
- Change ≥3 independent controls; results visibly change or show a documented no-op, without runtime errors.
- Backend offline: core demo still functions.
- AI draft absent/unconfirmed: no numeric assumptions auto-inserted.

### Definition of done (P0)
A team member can clone, install, run locally, open demo scenario, compare idle + charging nudges in their appropriate scenarios, vary three controls, inspect source/assumption labels, and download a reproducible report. Infeasible changes clearly produce constraint warnings.

## 12. Working agreements (humans + Codex)
- Shared contract changes first: open a PR containing interface + fixture changes, get review by all three coders, then implement.
- Each agent gets one issue/branch and a strict file ownership boundary. Agents cannot rewrite other members' work without explicit approval.
- All calculations are pure functions with tests. No fake placeholder metrics in connected UI.
- PR minimum: what changed, test command/results, screenshots for visual changes, input/assumption changes, known limitations.
- Merge order: (1) contracts + fixtures → (2) core engine + API stub + UI shell in parallel → (3) integrated flows → (4) polish and P1.
- Before demo: pin fixture version, freeze inputs, smoke-test deployment and prepare no-key fallback.

## 13. Risks and decisions to resolve
1. **Billing period:** decide daily vs monthly demand charge handling; until then report cost categories separately.
2. **Work feasibility:** per-slot work model is illustrative; get research teammate approval of assumptions ledger.
3. **Charging policy:** specify a naive baseline schedule that is feasible; otherwise explain why no comparison exists.
4. **Annual payback:** do not calculate without annual operating days + demand billing assumptions.
5. **Real-world applicability:** review of actual constraints requires port/electrical professionals; prototype is an advisory planning simulator.

## 14. First meeting checklist
Agree on canonical fixture and interface; choose owners; choose dataset time resolution (recommended 1 hour), three controls, the two precise before/after comparisons, demo branching policy, merge/test commands, and which P1 features are optional.

---
**Provenance:** The product idea, P0/P1 hierarchy, fictional Gulf Coast setting, scenario categories, AI-vs-optimization separation, and non-validated disclaimer come from the uploaded concept report. All folder paths, implementation interfaces, heuristic tie-breaking, numeric modeling conventions and acceptance checks above are recommended engineering design choices for this team.