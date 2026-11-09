import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

export const pool = new Pool({
  ...(databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: true,
        },
      }
    : {
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME ?? "portpower_db",
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || undefined,
      }),

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function testDatabaseConnection(): Promise<void> {
  const result = await pool.query(
    "SELECT NOW() AS current_time"
  );

  console.log(
    "PostgreSQL connected:",
    result.rows[0].current_time
  );
}