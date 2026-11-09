import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../config/db.js";
import { SchedulingInputValidationError, validateSchedulingInputConfiguration,
  type SchedulingInputConfiguration } from "../../../../packages/core/dist/index.js";
import { loadSchedulingInputs, SchedulingInputAccessError } from "../services/schedulingInputService.js";

export function createOptimizationRouter(db: Pick<Pool, "connect"> = pool, configuration: SchedulingInputConfiguration = {}) {
  // Configuration is trusted server setup, never request-supplied assumptions.
  validateSchedulingInputConfiguration(configuration);
  const router = Router();
  router.get("/inputs", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!req.session?.managerId) {
      res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in as a port manager to inspect scheduling inputs." } }); return;
    }
    if (Object.keys(req.query).length) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "This endpoint accepts no query parameters. The port is determined by your session." } }); return;
    }
    try {
      res.json(await loadSchedulingInputs(req.session.managerId, db, configuration));
    } catch (error) {
      if (error instanceof SchedulingInputAccessError) {
        res.status(403).json({ error: { code: "PORT_ACCESS_DENIED", message: "An active manager account with one assigned Gulfport or Miami port is required." } });
      } else if (error instanceof SchedulingInputValidationError) {
        res.status(422).json({ error: { code: "INVALID_PLANNING_RECORDS", message: "Correct the listed planning records before scheduling." }, issues: error.issues });
      } else {
        res.status(503).json({ error: { code: "PLANNING_STORAGE_UNAVAILABLE", message: "Unable to load planning inputs. Try again when database access is restored." } });
      }
    }
  });
  return router;
}

export default createOptimizationRouter();
