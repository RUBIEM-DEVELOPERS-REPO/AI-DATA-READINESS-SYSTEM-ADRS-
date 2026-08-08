import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const defaultDbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/regulator_db";
const connectionString = process.env.REGULATOR_DATABASE_URL || defaultDbUrl;

const pool = new Pool({ connectionString });

export const regulatorDb = drizzle(pool, { schema });
