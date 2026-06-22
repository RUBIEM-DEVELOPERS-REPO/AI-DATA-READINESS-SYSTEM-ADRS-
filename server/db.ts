import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure the vector extension is available in the database (Layer 4 - AI Features)
pool.query('CREATE EXTENSION IF NOT EXISTS vector').catch(err => {
  console.warn('[DB] Could not ensure vector extension:', err.message);
});

export const db = drizzle(pool, { schema });
