import "dotenv/config";
import { app } from "./app.js";
import { connectAIS } from "./ais/aisClient.js";

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`PortPower vessel API running at http://localhost:${port}`);
  connectAIS();
});
