
import express from "express";
import cors from "cors";

import { sessionMiddleware } from "./middleware/session.js";

import authRoutes from "./routes/authRoutes.js";
import vesselRoutes from "./routes/vesselRoutes.js";
import operationsRoutes from "./routes/operationsRoutes.js";
import equipmentRoutes from "./routes/equipmentRoutes.js";
import arrivalRoutes from "./routes/arrivalRoutes.js";
import berthRoutes from "./routes/berthRoutes.js";
import optimizationRoutes from "./routes/optimizationRoutes.js";

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL-backed sessions
app.use(sessionMiddleware);

// Authentication routes
app.use("/api/auth", authRoutes);

// Equipment management routes
app.use("/api/equipment", equipmentRoutes);

// Vessel arrival management routes
app.use("/api/arrivals", arrivalRoutes);
app.use("/api/berths", berthRoutes);
app.use("/api/optimization", optimizationRoutes);

// Existing vessel routes
app.use("/api/vessels", vesselRoutes);

// Existing port operations routes
app.use("/api/operations/scenarios", operationsRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "portpower-vessel-api",
  });
});
