import "dotenv/config";
import { initializeOperations } from "./scenarioRepository.js";
import { pool } from "../config/db.js";

try {
  await initializeOperations();
  console.log("Fictional operations tables are ready. Existing scenario edits are preserved.");
} catch {
  console.error("Operations migration failed. The transaction was rolled back. Check database access and stored scenario validity.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
