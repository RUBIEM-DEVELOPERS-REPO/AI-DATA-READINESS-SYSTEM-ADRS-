import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5444/storage_db";
const connectionString = process.env.DATABASE_URL || defaultDatabaseUrl;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set — using localhost:5444/storage_db");
}

export const pool = new Pool({ connectionString });

export async function waitForDatabaseConnection(maxAttempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      return;
    } catch (error: any) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export const db = drizzle(pool, { schema });
