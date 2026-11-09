import express from "express";
import cors from "cors";
import vesselRoutes from "./routes/vesselRoutes.js";

export const app = express();
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : false }));
app.use(express.json());
app.get(["/health", "/api/health"], (_req, res) =>
  res.json({ status: "ok", service: "portpower-vessel-api" })
);
app.use("/api/vessels", vesselRoutes);
