
import "dotenv/config";

import { app } from "./app.js";
import { connectAIS } from "./ais/aisClient.js";
import { testDatabaseConnection } from "./config/db.js";
import { initializeOperations } from "./operations/scenarioRepository.js";

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    await testDatabaseConnection();
    await initializeOperations();

    app.listen(PORT, () => {
      console.log(
        `PortPower API running at http://localhost:${PORT}`
      );

      connectAIS();
    });
  } catch (error) {
    console.error("Failed to start PortPower API:", error);
    process.exit(1);
  }
}

startServer();
