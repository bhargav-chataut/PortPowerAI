import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { createOperatingScenario, validateOperatingScenario, type OperatingScenario } from "../../../../packages/core/dist/index.js";

export interface ScenarioRepository {
  get(id: string): Promise<OperatingScenario | null>;
  save(scenario: OperatingScenario): Promise<OperatingScenario | null>;
}

/** Caller owns the transaction and scenario row lock. */
async function writeRows(client: PoolClient, s: OperatingScenario): Promise<void> {
  // Replace only this scenario's collections. FKs cascade dependent assignments.
  await client.query("DELETE FROM berths WHERE scenario_id = $1", [s.id]);
  await client.query("DELETE FROM equipment WHERE scenario_id = $1", [s.id]);
  for (const [i, b] of s.berths.entries()) {
    await client.query("INSERT INTO berths (scenario_id, id, name, sort_order) VALUES ($1, $2, $3, $4)", [s.id, b.id, b.name, i]);
  }
  for (const [i, v] of s.vessels.entries()) {
    await client.query(`INSERT INTO vessel_calls (scenario_id, id, name, berth_id, arrival_minute, departure_minute, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [s.id, v.id, v.name, v.berthId, v.arrival, v.departure, i]);
  }
  for (const [i, e] of s.equipment.entries()) {
    await client.query(`INSERT INTO equipment (scenario_id, id, name, kind, enabled, available_from_minute, available_until_minute, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [s.id, e.id, e.name, e.kind, e.enabled, e.availableFrom, e.availableUntil, i]);
  }
  for (const [i, t] of s.tasks.entries()) {
    await client.query(`INSERT INTO cargo_tasks (scenario_id, id, name, vessel_call_id, start_minute, duration_minutes, priority, required_kind, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [s.id, t.id, t.name, t.vesselId, t.start, t.duration, t.priority, t.requiredKind, i]);
    for (const [j, id] of t.equipmentIds.entries()) {
      await client.query(`INSERT INTO task_equipment_assignments (scenario_id, task_id, equipment_id, sort_order)
        VALUES ($1, $2, $3, $4)`, [s.id, t.id, id, j]);
    }
  }
  await client.query("UPDATE operating_scenarios SET relational_ready = TRUE WHERE id = $1", [s.id]);
}

export async function initializeOperations(): Promise<void> {
  const migrations = await Promise.all(["001_operating_scenarios.sql", "002_operations_tables.sql"].map(
    file => readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"),
  ));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(706731021)");
    for (const sql of migrations) await client.query(sql);
    const initial = createOperatingScenario();
    await client.query(
      "INSERT INTO operating_scenarios (id, revision, document) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING",
      [initial.id, initial.revision, JSON.stringify(initial)],
    );
    const pending = await client.query<{ document: OperatingScenario }>(
      "SELECT document FROM operating_scenarios WHERE NOT relational_ready FOR UPDATE",
    );
    for (const { document } of pending.rows) {
      if (validateOperatingScenario(document).length) throw new Error("Cannot migrate an invalid stored operating scenario.");
      await writeRows(client, document);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export const scenarioRepository: ScenarioRepository = {
  async get(id) {
    // One SQL snapshot keeps metadata, collections and assignments consistent.
    const result = await pool.query<{ document: OperatingScenario }>(`
      SELECT s.document || jsonb_build_object(
        'berths', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.sort_order)
          FROM berths b WHERE b.scenario_id = s.id), '[]'::jsonb),
        'vessels', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'berthId', v.berth_id,
          'arrival', v.arrival_minute, 'departure', v.departure_minute) ORDER BY v.sort_order)
          FROM vessel_calls v WHERE v.scenario_id = s.id), '[]'::jsonb),
        'equipment', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'kind', e.kind,
          'enabled', e.enabled, 'availableFrom', e.available_from_minute, 'availableUntil', e.available_until_minute) ORDER BY e.sort_order)
          FROM equipment e WHERE e.scenario_id = s.id), '[]'::jsonb),
        'tasks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'vesselId', t.vessel_call_id,
          'start', t.start_minute, 'duration', t.duration_minutes, 'priority', t.priority, 'requiredKind', t.required_kind,
          'equipmentIds', COALESCE((SELECT jsonb_agg(a.equipment_id ORDER BY a.sort_order)
            FROM task_equipment_assignments a WHERE a.scenario_id = t.scenario_id AND a.task_id = t.id), '[]'::jsonb)) ORDER BY t.sort_order)
          FROM cargo_tasks t WHERE t.scenario_id = s.id), '[]'::jsonb)
      ) AS document FROM operating_scenarios s WHERE s.id = $1`, [id]);
    return result.rows[0]?.document ?? null;
  },
  async save(scenario) {
    if (validateOperatingScenario(scenario).length) throw new Error("Invalid operating scenario.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ document: OperatingScenario }>(
        `UPDATE operating_scenarios
         SET document = jsonb_set($2::jsonb, '{revision}', to_jsonb(revision + 1)),
             revision = revision + 1, updated_at = NOW()
         WHERE id = $1 AND revision = $3 RETURNING document`,
        [scenario.id, JSON.stringify(scenario), scenario.revision],
      );
      const saved = result.rows[0]?.document;
      if (saved) await writeRows(client, saved);
      await client.query("COMMIT");
      return saved ?? null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  },
};
