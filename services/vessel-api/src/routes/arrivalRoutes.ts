
import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

const CARGO_UNITS = {
  containers: "container_moves",
  general: "tonnes",
  bulk: "tonnes",
  roro: "vehicle_moves",
} as const;

type CargoType = keyof typeof CARGO_UNITS;

function isCargoType(value: unknown): value is CargoType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      CARGO_UNITS,
      value
    )
  );
}

// The server determines the port from the login session.
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

// GET /api/arrivals
router.get("/", async (req, res) => {
  try {
    const managerId = req.session.managerId;

    if (!managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(managerId);

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.mmsi,
        a.vessel_name,
        a.planned_eta,
        a.cargo_type,
        a.workload_quantity,
        a.workload_unit,
        a.estimated_service_hours,
        a.preferred_berth_id,
        b.name AS preferred_berth_name,
        a.status,
        a.notes,
        a.created_at
      FROM manager_vessel_arrivals AS a
      LEFT JOIN manager_berths AS b
        ON b.id = a.preferred_berth_id
       AND b.port_id = a.port_id
      WHERE a.port_id = $1
      ORDER BY a.planned_eta ASC
      `,
      [portId]
    );

    return res.json({
      arrivals: result.rows,
    });
  } catch (error) {
    console.error("GET arrivals error:", error);

    return res.status(500).json({
      error: "Failed to load vessel arrivals",
    });
  }
});

// GET /api/arrivals/berths
router.get("/berths", async (req, res) => {
  try {
    const managerId = req.session.managerId;

    if (!managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(managerId);

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        berth_number,
        name,
        status,
        max_length_m,
        max_draft_m
      FROM manager_berths
      WHERE port_id = $1
      ORDER BY berth_number ASC
      `,
      [portId]
    );

    return res.json({
      berths: result.rows,
    });
  } catch (error) {
    console.error("GET berths error:", error);

    return res.status(500).json({
      error: "Failed to load berths",
    });
  }
});

// POST /api/arrivals
router.post("/", async (req, res) => {
  try {
    const managerId = req.session.managerId;

    if (!managerId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const portId = await getManagerPortId(managerId);

    if (!portId) {
      return res.status(403).json({
        error: "No assigned port",
      });
    }

    const {
      mmsi,
      vessel_name,
      planned_eta,
      cargo_type,
      workload_quantity,
      estimated_service_hours,
      preferred_berth_id,
      notes,
    } = req.body ?? {};

    // Validate MMSI.
    const normalizedMmsi =
      typeof mmsi === "string" ? mmsi.trim() : "";

    if (!/^\d{9}$/.test(normalizedMmsi)) {
      return res.status(400).json({
        error: "MMSI must contain exactly 9 digits",
      });
    }

    // Require ETA with a timezone offset or Z.
    // This prevents ambiguous local-time storage.
    if (
      typeof planned_eta !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        planned_eta
      ) ||
      !Number.isFinite(Date.parse(planned_eta))
    ) {
      return res.status(400).json({
        error:
          "Planned ETA must be a valid ISO timestamp with timezone",
      });
    }

    if (!isCargoType(cargo_type)) {
      return res.status(400).json({
        error: "Invalid cargo type",
      });
    }

    const workload = Number(workload_quantity);

    if (
      workload_quantity === null ||
      workload_quantity === undefined ||
      workload_quantity === "" ||
      !Number.isFinite(workload) ||
      workload <= 0
    ) {
      return res.status(400).json({
        error: "Workload must be greater than zero",
      });
    }

    const serviceHours =
      estimated_service_hours === null ||
      estimated_service_hours === undefined ||
      estimated_service_hours === ""
        ? null
        : Number(estimated_service_hours);

    if (
      serviceHours !== null &&
      (!Number.isFinite(serviceHours) ||
        serviceHours <= 0)
    ) {
      return res.status(400).json({
        error: "Service hours must be positive",
      });
    }

    if (
      vessel_name != null &&
      (typeof vessel_name !== "string" ||
        vessel_name.length > 150)
    ) {
      return res.status(400).json({
        error: "Invalid vessel name",
      });
    }

    if (
      notes != null &&
      (typeof notes !== "string" ||
        notes.length > 2000)
    ) {
      return res.status(400).json({
        error: "Invalid notes",
      });
    }

    const berthId =
      preferred_berth_id === null ||
      preferred_berth_id === undefined ||
      preferred_berth_id === ""
        ? null
        : String(preferred_berth_id);

    if (
      berthId !== null &&
      !/^[1-9]\d*$/.test(berthId)
    ) {
      return res.status(400).json({
        error: "Invalid preferred berth",
      });
    }

    // Validate that the berth belongs to this port.
    if (berthId !== null) {
      const berthResult = await pool.query(
        `
        SELECT id
        FROM manager_berths
        WHERE id = $1 AND port_id = $2
        `,
        [berthId, portId]
      );

      if (berthResult.rowCount === 0) {
        return res.status(400).json({
          error: "Berth does not belong to your port",
        });
      }
    }

    const result = await pool.query(
      `
      INSERT INTO manager_vessel_arrivals (
        port_id,
        mmsi,
        vessel_name,
        planned_eta,
        cargo_type,
        workload_quantity,
        workload_unit,
        estimated_service_hours,
        preferred_berth_id,
        notes
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      )
      RETURNING *
      `,
      [
        portId,
        normalizedMmsi,
        typeof vessel_name === "string"
          ? vessel_name.trim() || null
          : null,
        planned_eta,
        cargo_type,
        workload,
        CARGO_UNITS[cargo_type],
        serviceHours,
        berthId,
        typeof notes === "string"
          ? notes.trim() || null
          : null,
      ]
    );

    return res.status(201).json({
      arrival: result.rows[0],
    });
  } catch (error) {
    console.error("POST arrivals error:", error);

    return res.status(500).json({
      error: "Failed to register vessel arrival",
    });
  }
});

export default router;
