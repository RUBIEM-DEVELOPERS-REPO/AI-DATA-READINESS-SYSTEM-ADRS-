import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.DPO_DATABASE_URL || "postgresql://postgres:postgres@localhost:5445/dpo_db";
if (!process.env.DPO_DATABASE_URL) {
  console.warn("DPO_DATABASE_URL not set — falling back to localhost:5445/dpo_db");
}

const pool = new Pool({ connectionString });

export const dpoDb = drizzle(pool, { schema });
