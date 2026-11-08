# PortPower AI — Pitch Deck Outline

## Slide 1: Title & Vision
* **Title:** PortPower AI: Intelligent Energy & Operations Scheduling for Modern Ports
* **Core Vision:** A reusable optimization platform that bridges vessel cargo operations and electric equipment charging without exceeding site power limits.

## Slide 2: The Problem
* **The Electrification Crunch:** Ports are transitioning to electric fleets (forklifts, hustlers, cranes) to meet sustainability goals.
* **The Peak Demand Trap:** Simultaneous fast charging during high-demand vessel unloading windows leads to severe utility peak-demand charges and grid strain.
* **The Operational Bottleneck:** Traditional terminal management software schedules cargo but ignores electrical constraints, forcing operators to choose between slow operations and massive electricity bills.

## Slide 3: Port of Gulfport Prototype Context
* **Real Public Foundations:** Utilizing published Port of Gulfport terminal inventory (4 ship-to-shore cranes, 15 container handlers, 59 yard hustlers, 60 forklifts) and public vessel arrival windows.
* **Synthetic Operational Modeling:** Battery capacities, charging station power limits ($20\text{ kW}$), and energy tariffs are modeled as synthetic assumptions to demonstrate optimization rules safely[cite: 1].

## Slide 4: Platform Architecture & Digital Twin
* **Reusable Engine:** One core optimization and digital twin platform configurable per port via clean JSON scenarios (maps, equipment counts, tariffs)[cite: 1].
* **Clean Separation:** Backend API manages persistence and communicates with an independent Python scheduler; frontend handles 2D playback and metrics visualization[cite: 1].

## Slide 5: Live Demo — Baseline vs. Optimized
* **Baseline Chaos:** Uncoordinated charging overlaps with vessel cargo work, triggering peak power overloads and potential job delays.
* **Optimized Schedule:** The scheduler staggers equipment charging across off-peak windows, strictly respects minimum battery safety thresholds, and guarantees $100\%$ job coverage.

## Slide 6: Impact & Methodology
* **Calculated Metrics:** Transparently tracks peak power reduction ($\text{kW}$), total energy consumption ($\text{kWh}$), and estimated cost savings ($\text{USD}$).
* **Feasibility Guarantee:** Any schedule missing required cargo steps is flagged as infeasible—ensuring zero operational compromise for energy savings[cite: 1].

## Slide 7: Business Model & Roadmap
* **Target Buyer:** Terminal Operators (e.g., Ports America) who directly bear equipment operating and electricity demand costs[cite: 1].
* **SaaS Model:** Per-terminal platform licensing, custom workflow configuration, and ongoing software support.
