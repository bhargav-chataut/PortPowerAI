import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../config/db.js";

const STATUSES = ["available", "occupied", "maintenance", "closed"] as const;
const FIELDS = ["status", "max_length_m", "max_draft_m"] as const;
type BerthPatch = { status?: typeof STATUSES[number]; max_length_m?: number | null; max_draft_m?: number | null };

export function validateBerthPatch(body: unknown): body is BerthPatch {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  const values = body as Record<string, unknown>;
  const keys = Object.keys(values);
  if (!keys.length || keys.some(key => !FIELDS.includes(key as typeof FIELDS[number]))) return false;
  if ("status" in values && !STATUSES.some(status => status === values.status)) return false;
  for (const field of ["max_length_m", "max_draft_m"] as const) {
    if (!(field in values) || values[field] === null) continue;
    const value = values[field];
    const maximum = field === "max_length_m" ? 99999999.99 : 999999.99;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum || Math.round(value * 100) / 100 !== value) return false;
  }
  return true;
}

export function createBerthRouter(db: Pick<Pool, "query"> = pool) {
  const router = Router();

  // Resolve the active manager and assigned port on every request.
  router.use(async (req, res, next) => {
    const managerId = req.session?.managerId;
    if (!managerId) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const result = await db.query<{ port_id: string }>(`
        SELECT a.port_id FROM port_manager_assignments a
        JOIN users u ON u.id = a.user_id
        JOIN ports p ON p.id = a.port_id
        WHERE a.user_id = $1 AND u.is_active = TRUE AND u.role = 'port_manager'
          AND p.code IN ('gulfport', 'miami')`, [managerId]);
      const assignment = result.rows[0];
      if (!assignment) { res.status(403).json({ error: "Active manager with an assigned port required" }); return; }
      res.locals.berthPortId = assignment.port_id;
      next();
    } catch { res.status(500).json({ error: "Unable to verify berth access" }); }
  });

  router.get("/", async (_req, res) => {
    try {
      const result = await db.query(`
        SELECT id, berth_number, name, status, max_length_m, max_draft_m
        FROM manager_berths WHERE port_id = $1 ORDER BY berth_number ASC`, [res.locals.berthPortId]);
      res.json({ berths: result.rows });
    } catch { res.status(500).json({ error: "Unable to load berths" }); }
  });

  router.patch("/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
      res.status(400).json({ error: "Invalid berth ID" }); return;
    }
    if (!validateBerthPatch(req.body)) {
      res.status(400).json({ error: "Provide status (available, occupied, maintenance or closed) and/or positive capacities in metres with at most two decimals; use null for unknown capacity. Other fields are not allowed." }); return;
    }
    try {
      // Field-presence checks preserve omitted values while allowing explicit NULL.
      const result = await db.query(`
        UPDATE manager_berths SET
          status = CASE WHEN $3::jsonb ? 'status' THEN $3::jsonb->>'status' ELSE status END,
          max_length_m = CASE WHEN $3::jsonb ? 'max_length_m' THEN ($3::jsonb->>'max_length_m')::numeric ELSE max_length_m END,
          max_draft_m = CASE WHEN $3::jsonb ? 'max_draft_m' THEN ($3::jsonb->>'max_draft_m')::numeric ELSE max_draft_m END
        WHERE id = $1 AND port_id = $2
        RETURNING id, berth_number, name, status, max_length_m, max_draft_m`,
        [id, res.locals.berthPortId, JSON.stringify(req.body)]);
      if (!result.rows.length) { res.status(404).json({ error: "Berth not found for your port" }); return; }
      res.json({ berth: result.rows[0] });
    } catch { res.status(500).json({ error: "Unable to update berth. Changes were not saved." }); }
  });
  return router;
}

export default createBerthRouter();
