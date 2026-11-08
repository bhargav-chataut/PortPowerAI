
import { Router } from "express";
import { getVessels } from "../ais/vesselStore.js";

const router = Router();

router.get("/", (_req, res) => {
  const vessels = getVessels();

  res.status(200).json({
    count: vessels.length,
    vessels,
  });
});

export default router;
