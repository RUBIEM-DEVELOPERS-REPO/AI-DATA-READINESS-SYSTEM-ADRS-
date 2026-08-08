import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const defaultDbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/dpo_db";
const connectionString = process.env.DPO_DATABASE_URL || defaultDbUrl;

const pool = new Pool({ connectionString });

export const dpoDb = drizzle(pool, { schema });
