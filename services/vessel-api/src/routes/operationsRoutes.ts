import { Router } from "express";
import { detectOperationsConflicts, validateOperatingScenario, type OperatingScenario } from "../../../../packages/core/dist/index.js";
import { scenarioRepository, type ScenarioRepository } from "../operations/scenarioRepository.js";

export function createOperationsRouter(repository: ScenarioRepository = scenarioRepository) {
  const router = Router();
  router.get("/:id", async (req, res) => {
    try {
      const scenario = await repository.get(String(req.params.id));
      if (!scenario) { res.status(404).json({ error: "Operating scenario not found" }); return; }
      res.json({ scenario, conflicts: detectOperationsConflicts(scenario), persistence: "postgres" });
    } catch {
      res.status(503).json({ error: "Operating scenario storage is unavailable. Your edits have not been saved." });
    }
  });
  router.put("/:id", async (req, res) => {
    const issues = validateOperatingScenario(req.body);
    if (issues.length) { res.status(400).json({ error: "Invalid operating scenario", issues }); return; }
    const input = req.body as OperatingScenario;
    if (input.id !== req.params.id) { res.status(400).json({ error: "Scenario ID must match the URL" }); return; }
    try {
      if (!await repository.get(input.id)) { res.status(404).json({ error: "Operating scenario not found" }); return; }
      const scenario = await repository.save(input);
      if (!scenario) { res.status(409).json({ error: "Another planner saved a newer version. Reload the saved scenario before editing again." }); return; }
      res.json({ scenario, conflicts: detectOperationsConflicts(scenario), persistence: "postgres" });
    } catch {
      res.status(503).json({ error: "Operating scenario storage is unavailable. Your edits have not been saved." });
    }
  });
  return router;
}

export default createOperationsRouter();
