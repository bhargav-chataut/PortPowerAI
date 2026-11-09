
import "dotenv/config";

import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { pool } from "../config/db.js";

const PgSession = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "SESSION_SECRET must contain at least 32 characters"
  );
}

export const sessionMiddleware = session({
  name: "portpower.sid",

  secret: sessionSecret,

  resave: false,
  saveUninitialized: false,

  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
});
