
import express from "express";
import cors from "cors";
import vesselRoutes from "./routes/vesselRoutes.js";
export const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/vessels", vesselRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "portpower-vessel-api",
  });
});
