import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.REGULATOR_DATABASE_URL || (process.env.NODE_ENV === "production" ? undefined : "postgresql://postgres:postgres@localhost:5446/regulator_db");
if (!process.env.REGULATOR_DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("REGULATOR_DATABASE_URL must be configured in production");
}

if (!process.env.REGULATOR_DATABASE_URL) {
  console.warn("REGULATOR_DATABASE_URL not set — falling back to localhost:5446/regulator_db");
}

const pool = new Pool({ connectionString });

export const regulatorDb = drizzle(pool, { schema });
