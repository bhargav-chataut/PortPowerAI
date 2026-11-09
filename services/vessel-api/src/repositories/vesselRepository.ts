
import { pool } from "../config/db.js";
import type { Vessel } from "../ais/vesselStore.js";

const HISTORY_INTERVAL_SECONDS = 60;

/**
 * Store vessel identity and sampled position history.
 */
export async function saveVesselToDatabase(
  vessel: Vessel,
  region: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insert the vessel or update its name.
    // Never overwrite a known name with "Unknown Vessel".
    await client.query(
      `
      INSERT INTO vessels (mmsi, name)
      VALUES ($1, $2)
      ON CONFLICT (mmsi)
      DO UPDATE SET
        name = CASE
          WHEN EXCLUDED.name = 'Unknown Vessel'
          THEN vessels.name
          ELSE EXCLUDED.name
        END,
        updated_at = NOW()
      `,
      [vessel.mmsi, vessel.name]
    );

    // Insert a historical position only if there is no
    // recent record for this vessel in the same region.
    await client.query(
      `
      INSERT INTO vessel_positions (
        mmsi,
        latitude,
        longitude,
        speed_knots,
        received_at,
        region
      )
      SELECT
        $1::BIGINT,
        $2::DOUBLE PRECISION,
        $3::DOUBLE PRECISION,
        $4::DOUBLE PRECISION,
        $5::TIMESTAMPTZ,
        $6::VARCHAR(50)
      WHERE NOT EXISTS (
        SELECT 1
        FROM vessel_positions
        WHERE mmsi = $1::BIGINT
          AND region = $6::VARCHAR(50)
          AND received_at >
            $5::TIMESTAMPTZ
            - ($7::INTEGER * INTERVAL '1 second')
      )
      `,
      [
        vessel.mmsi,
        vessel.latitude,
        vessel.longitude,
        vessel.speedKnots,
        vessel.lastUpdated,
        region,
        HISTORY_INTERVAL_SECONDS,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Represents a historical vessel position returned
 * from PostgreSQL.
 */
export interface VesselPositionRecord {
  id: string;
  mmsi: string;
  latitude: number;
  longitude: number;
  speed_knots: number | null;
  received_at: Date;
  region: string;
}

/**
 * Retrieve historical positions for a vessel.
 */
export async function getVesselPositionHistory(
  mmsi: number,
  limit = 100
): Promise<VesselPositionRecord[]> {
  const result = await pool.query<VesselPositionRecord>(
    `
    SELECT
      id,
      mmsi,
      latitude,
      longitude,
      speed_knots,
      received_at,
      region
    FROM vessel_positions
    WHERE mmsi = $1
    ORDER BY received_at DESC, id DESC
    LIMIT $2
    `,
    [mmsi, limit]
  );

  return result.rows;
}
