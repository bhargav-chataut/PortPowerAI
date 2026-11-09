
import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

const EQUIPMENT_TYPES = [
  "forklift",
  "reach_stacker",
  "mobile_crane",
  "gantry_crane",
  "terminal_tractor",
] as const;

const EQUIPMENT_STATUSES = [
  "available",
  "in_use",
  "maintenance",
  "out_of_service",
] as const;

const ENERGY_TYPES = [
  "diesel",
  "electric",
  "hybrid",
] as const;

// Get the assigned port from the authenticated session.
// Never accept a manager-supplied port_id.
async function getManagerPortId(managerId: string) {
  const result = await pool.query(
    `
    SELECT port_id
    FROM port_manager_assignments
    WHERE user_id = $1
    LIMIT 1
    `,
    [managerId]
  );

  return result.rows[0]?.port_id ?? null;
}

// GET /api/equipment
router.get("/", async (req, res) => {
  try {
    if (!req.session.managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(
      req.session.managerId
    );

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        equipment_code,
        equipment_type,
        capacity_tonnes,
        energy_type,
        status,
        assigned_berth_id,
        created_at,
        updated_at
      FROM manager_equipment
      WHERE port_id = $1
      ORDER BY equipment_code
      `,
      [portId]
    );

    return res.json({
      equipment: result.rows,
    });
  } catch (error) {
    console.error("Equipment GET error:", error);

    return res.status(500).json({
      error: "Failed to load equipment",
    });
  }
});

// POST /api/equipment
router.post("/", async (req, res) => {
  try {
    if (!req.session.managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(
      req.session.managerId
    );

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const {
      equipment_code,
      equipment_type,
      capacity_tonnes,
      energy_type,
    } = req.body ?? {};

    if (
      typeof equipment_code !== "string" ||
      !equipment_code.trim() ||
      equipment_code.trim().length > 40 ||
      !EQUIPMENT_TYPES.some(
        (type) => type === equipment_type
      ) ||
      !ENERGY_TYPES.some(
        (type) => type === energy_type
      )
    ) {
      return res.status(400).json({
        error: "Invalid equipment information",
      });
    }

    const capacity =
      capacity_tonnes === null ||
      capacity_tonnes === undefined ||
      capacity_tonnes === ""
        ? null
        : Number(capacity_tonnes);

    if (
      capacity !== null &&
      (!Number.isFinite(capacity) || capacity <= 0)
    ) {
      return res.status(400).json({
        error: "Capacity must be a positive number",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO manager_equipment (
        port_id,
        equipment_code,
        equipment_type,
        capacity_tonnes,
        energy_type
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        portId,
        equipment_code.trim(),
        equipment_type,
        capacity,
        energy_type,
      ]
    );

    return res.status(201).json({
      equipment: result.rows[0],
    });
  } catch (error: unknown) {
    const dbError = error as {
      code?: string;
      constraint?: string;
    };

    if (
      dbError.code === "23505" &&
      dbError.constraint ===
        "manager_equipment_port_id_equipment_code_key"
    ) {
      return res.status(409).json({
        error: "Equipment code already exists for this port",
      });
    }

    console.error("Equipment POST error:", error);

    return res.status(500).json({
      error: "Failed to create equipment",
    });
  }
});

// PATCH /api/equipment/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    if (!req.session.managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(
      req.session.managerId
    );

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const equipmentId = req.params.id;
    const { status } = req.body ?? {};

    if (
      !/^[1-9]\d*$/.test(String(equipmentId)) ||
      !EQUIPMENT_STATUSES.some(
        (value) => value === status
      )
    ) {
      return res.status(400).json({
        error: "Invalid equipment ID or status",
      });
    }

    const result = await pool.query(
      `
      UPDATE manager_equipment
      SET status = $1,
          updated_at = NOW()
      WHERE id = $2
        AND port_id = $3
      RETURNING *
      `,
      [status, equipmentId, portId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Equipment not found",
      });
    }

    return res.json({
      equipment: result.rows[0],
    });
  } catch (error) {
    console.error("Equipment PATCH error:", error);

    return res.status(500).json({
      error: "Failed to update equipment",
    });
  }
});

export default router;
