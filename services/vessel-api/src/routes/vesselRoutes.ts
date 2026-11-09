
import { Router } from "express";
import { getVessels } from "../ais/vesselStore.js";
import { getVesselPositionHistory } from "../repositories/vesselRepository.js";

const router = Router();

// Latest vessel positions from memory
router.get("/", (req, res) => {
  const region = req.query.region;
  if (
    Object.keys(req.query).some((key) => key.startsWith("region[")) ||
    (region !== undefined && region !== "gulfport" && region !== "miami")
  ) {
    res.status(400).json({ error: "Region must be gulfport or miami" });
    return;
  }

  const vessels = getVessels(region);

  res.json({
    count: vessels.length,
    vessels,
  });
});

// Historical vessel positions from PostgreSQL
router.get("/:mmsi/history", async (req, res) => {
  try {
    const rawMmsi = req.params.mmsi;
    const mmsiText =
      typeof rawMmsi === "string" ? rawMmsi : "";

    if (!/^\d{9}$/.test(mmsiText)) {
      res.status(400).json({
        error: "MMSI must be a 9-digit number",
      });
      return;
    }

    const mmsi = Number(mmsiText);

    const rawLimit = req.query.limit;
    const limitText =
      typeof rawLimit === "string" ? rawLimit : "100";

    if (!/^\d+$/.test(limitText)) {
      res.status(400).json({
        error: "Limit must be a positive integer",
      });
      return;
    }

    const limit = Number(limitText);

    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      res.status(400).json({
        error: "Limit must be between 1 and 500",
      });
      return;
    }

    const positions = await getVesselPositionHistory(
      mmsi,
      limit
    );

    res.json({
      mmsi,
      count: positions.length,
      positions,
    });
  } catch (error) {
    console.error("Vessel history error:", error);

    res.status(500).json({
      error: "Unable to retrieve vessel history",
    });
  }
});

export default router;
