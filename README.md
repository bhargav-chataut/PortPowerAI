# PortPowerAI — Offline Demo MVP

## Run it
Open `index.html` in any modern browser. No npm, server, API key or account needed. Fonts fall back to system fonts when offline.

## Tomorrow's demo (90 seconds)
1. Explain the fictional port: four forklifts, diesel energy use, considering 2 electric replacements.
2. Point to the scenario controls. Change electric units from 2 to 3 and back.
3. Compare naive simultaneous charging (amber) against coordinated charging (mint) on the chart.
4. Reduce site capacity to 150 kW to show the feasibility guardrail.
5. Restore 180 kW, change idle reduction, and export the assumptions/report.

## What is real / what is not
- **Real software**: fully functional calculations, deterministic heuristic optimizer, input controls, visual comparisons, JSON export, feasibility alerts.
- **Synthetic**: facility hourly base load, fleet duty cycle, consumption rates, emissions factor, costs, and motion visualization.
- **Not implemented**: AI vision, real port data import, production persistence, hardware control, CAPEX/payback, genuine telematics, real-time physics synchronization.
- **Do not claim** displayed savings are achievable at a particular port. This is a concept validation simulation.

## Current simplifying assumptions
- Four forklifts, 8 active hours + 2 idle hours/day per machine, 300 days/year.
- Diesel active: 2.2 L/hour; diesel idle: 1.1 L/hour.
- Electric work: 9 kWh/hour and 90% charging efficiency.
- An 8-hour overnight 22:00–06:00 charging window.
- One dedicated charger per electric forklift (same selected kW per charger).
- All electric forklifts must receive full daily grid energy before 06:00.
- Site load is a synthetic 24-hour profile.
- Daily site peak is assumed representative of every billing month for illustrative demand charges. Total annual cost includes diesel, *incremental electric forklift* energy and a monthly demand charge on total site peak; common facility kWh charges are excluded in all scenarios.
- Diesel CO2 factor 2.68 kg/L is illustrative; grid factor adjustable.
- Idle reduction only affects diesel idle fuel, not workload.
- No upfront electric equipment or charger capital investment, battery degradation, labor expenses, charger installation, or maintenance modeled.

## Technical notes
Pure HTML/CSS/JavaScript in a single file to make a meeting demo robust. Scheduling is greedy plus local swaps; not an exact solver or globally optimal guarantee. For a production prototype separate the calculation engine and test it on edge cases, then implement constraint-aware optimization with formal validation.