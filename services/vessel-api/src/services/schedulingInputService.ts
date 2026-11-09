import type { Pool } from "pg";
import { pool } from "../config/db.js";
import { buildSchedulingInputs, validateSchedulingInputConfiguration,
  type SchedulingInputConfiguration, type SchedulingInputs } from "../../../../packages/core/dist/index.js";

export class SchedulingInputAccessError extends Error {}

/** Read a consistent, read-only snapshot; no AIS query or implicit demo seeding. */
export async function loadSchedulingInputs(
  managerId: string,
  db: Pick<Pool, "connect"> = pool,
  configuration: SchedulingInputConfiguration = {},
): Promise<SchedulingInputs> {
  validateSchedulingInputConfiguration(configuration);
  const client = await db.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const assigned = await client.query(`
      SELECT p.id::text AS id, p.code FROM port_manager_assignments a
      JOIN users u ON u.id = a.user_id JOIN ports p ON p.id = a.port_id
      WHERE a.user_id = $1 AND u.is_active = TRUE AND u.role = 'port_manager'
        AND p.code IN ('gulfport', 'miami')`, [managerId]);
    if (assigned.rows.length !== 1) throw new SchedulingInputAccessError("Active manager with one assigned port required");
    const port = assigned.rows[0];
    const berths = await client.query(`
      SELECT id::text, port_id::text, berth_number, name, status, max_length_m, max_draft_m
      FROM manager_berths WHERE port_id = $1 ORDER BY berth_number, id`, [port.id]);
    const equipment = await client.query(`
      SELECT id::text, port_id::text, equipment_code, equipment_type, capacity_tonnes,
        energy_type, status, assigned_berth_id::text
      FROM manager_equipment WHERE port_id = $1 ORDER BY equipment_code, id`, [port.id]);
    const arrivals = await client.query(`
      SELECT id::text, port_id::text, mmsi, vessel_name, planned_eta, cargo_type,
        workload_quantity, workload_unit, estimated_service_hours, preferred_berth_id::text, status
      FROM manager_vessel_arrivals WHERE port_id = $1
        AND status NOT IN ('cancelled', 'completed') ORDER BY planned_eta, id`, [port.id]);
    const inputs = buildSchedulingInputs({ port, berths: berths.rows, equipment: equipment.rows, arrivals: arrivals.rows }, configuration);
    await client.query("COMMIT");
    return inputs;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
