import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const defaultDbUrl = "postgresql://postgres:postgres@localhost:5432/storage_db";
const connectionString = process.env.DATABASE_URL || defaultDbUrl;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not explicitly set in environment — using fallback connection string");
}

export const pool = new Pool({ connectionString });

export async function waitForDatabaseConnection(maxAttempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      } catch (extErr: any) {
        console.warn("pgvector extension not installed in PostgreSQL — vector searches will fallback to standard queries:", extErr.message);
      }
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
