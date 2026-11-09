
import "dotenv/config";
import argon2 from "argon2";

import { pool } from "../config/db.js";

interface ManagerSeed {
  email: string;
  password: string;
  fullName: string;
  portCode: "gulfport" | "miami";
}

async function seedManagers() {
  const gulfportEmail = process.env.GULFPORT_MANAGER_EMAIL;
  const gulfportPassword =
    process.env.GULFPORT_MANAGER_PASSWORD;

  const miamiEmail = process.env.MIAMI_MANAGER_EMAIL;
  const miamiPassword =
    process.env.MIAMI_MANAGER_PASSWORD;

  if (
    !gulfportEmail ||
    !gulfportPassword ||
    !miamiEmail ||
    !miamiPassword
  ) {
    throw new Error(
      "Missing manager credentials in .env"
    );
  }

  if (
    gulfportEmail.trim().toLowerCase() ===
    miamiEmail.trim().toLowerCase()
  ) {
    throw new Error(
      "Manager accounts must use different emails"
    );
  }

  const managers: ManagerSeed[] = [
    {
      email: gulfportEmail.trim().toLowerCase(),
      password: gulfportPassword,
      fullName: "Gulfport Demo Manager",
      portCode: "gulfport",
    },
    {
      email: miamiEmail.trim().toLowerCase(),
      password: miamiPassword,
      fullName: "Miami Demo Manager",
      portCode: "miami",
    },
  ];

  const hashes = await Promise.all(
    managers.map((manager) =>
      argon2.hash(manager.password, {
        type: argon2.argon2id,
      })
    )
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [index, manager] of managers.entries()) {
      // Find the existing port.
      const portResult = await client.query(
        "SELECT id FROM ports WHERE code = $1",
        [manager.portCode]
      );

      if (portResult.rowCount !== 1) {
        throw new Error(
          `Port ${manager.portCode} was not found`
        );
      }

      const portId = portResult.rows[0].id;

      // Insert account or update our demo credentials.
      const userResult = await client.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          full_name,
          role,
          is_active
        )
        VALUES ($1, $2, $3, 'port_manager', TRUE)
        ON CONFLICT (email)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = 'port_manager',
          is_active = TRUE
        RETURNING id
        `,
        [
          manager.email,
          hashes[index],
          manager.fullName,
        ]
      );

      const userId = userResult.rows[0].id;

      // Assign this manager to exactly one port.
      await client.query(
        `
        INSERT INTO port_manager_assignments (
          user_id,
          port_id
        )
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET port_id = EXCLUDED.port_id
        `,
        [userId, portId]
      );

      console.log(
        `Configured ${manager.fullName} for ${manager.portCode}`
      );
    }

    await client.query("COMMIT");

    console.log("Manager accounts configured successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seedManagers()
  .catch((error) => {
    console.error("Manager seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
