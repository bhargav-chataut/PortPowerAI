
import { Router } from "express";
import argon2 from "argon2";
import { pool } from "../config/db.js";

const router = Router();

interface ManagerRecord {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  port_code: "gulfport" | "miami";
}

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 255 ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        error: "Valid email and password are required",
      });
      return;
    }

    const result = await pool.query<ManagerRecord>(
      `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.password_hash,
        p.code AS port_code
      FROM users u
      JOIN port_manager_assignments a
        ON a.user_id = u.id
      JOIN ports p
        ON p.id = a.port_id
      WHERE LOWER(u.email) = $1
        AND u.role = 'port_manager'
        AND u.is_active = TRUE
        AND p.code IN ('gulfport', 'miami')
      `,
      [email.trim().toLowerCase()]
    );

    const manager = result.rows[0];

    const validPassword = manager
      ? await argon2.verify(
          manager.password_hash,
          password
        )
      : false;

    if (!manager || !validPassword) {
      res.status(401).json({
        error: "Invalid email or password",
      });
      return;
    }

    // Generate a fresh session ID after authentication.
    req.session.regenerate((error) => {
      if (error) {
        res.status(500).json({
          error: "Unable to create session",
        });
        return;
      }

      req.session.managerId = manager.id;

      req.session.save((saveError) => {
        if (saveError) {
          res.status(500).json({
            error: "Unable to save session",
          });
          return;
        }

        res.json({
          message: "Login successful",
          manager: {
            id: manager.id,
            name: manager.full_name,
            email: manager.email,
            port: manager.port_code,
          },
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Unable to process login",
    });
  }
});

// CURRENT AUTHENTICATED MANAGER
router.get("/me", async (req, res) => {
  const managerId = req.session.managerId;

  if (!managerId) {
    res.status(401).json({
      error: "Not authenticated",
    });
    return;
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.full_name,
        p.code AS port
      FROM users u
      JOIN port_manager_assignments a
        ON a.user_id = u.id
      JOIN ports p
        ON p.id = a.port_id
      WHERE u.id = $1
        AND u.role = 'port_manager'
        AND u.is_active = TRUE
      `,
      [managerId]
    );

    const manager = result.rows[0];

    if (!manager) {
      res.status(401).json({
        error: "Manager account unavailable",
      });
      return;
    }

    res.json({
      manager: {
        id: String(manager.id),
        name: manager.full_name,
        email: manager.email,
        port: manager.port,
      },
    });
  } catch (error) {
    console.error("Current manager error:", error);
    res.status(500).json({
      error: "Unable to retrieve manager",
    });
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({
        error: "Unable to log out",
      });
      return;
    }

    res.clearCookie("portpower.sid", {
      path: "/",
    });

    res.json({
      message: "Logged out successfully",
    });
  });
});

export default router;
