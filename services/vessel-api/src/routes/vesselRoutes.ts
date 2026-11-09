import { Router } from "express";
import { getVessels } from "../ais/vesselStore.js";
import { classifyRegion } from "../ais/regions.js";

const router = Router();

router.get("/", (req, res) => {
  const region = req.query.region ?? "all";
  if (region !== "all" && region !== "gulfport" && region !== "miami") {
    res.status(400).json({ error: "region must be gulfport, miami or all" });
    return;
  }
  const vessels = getVessels().filter((vessel) =>
    region === "all" || classifyRegion(vessel.latitude, vessel.longitude) === region
  );
  res.json({ region, count: vessels.length, vessels });
});

export default router;
