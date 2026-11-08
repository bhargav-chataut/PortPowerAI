import "dotenv/config";
import { app } from "./app.js";
import { connectAIS } from "./ais/aisClient.js";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`PortPower API running at http://localhost:${PORT}`);

  connectAIS();
});