import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

// Registry DB is deprecated in favor of portal-isolated DBs.
// Keep a fallback for backward compatibility, but prefer explicit portal DBs.
const connectionString = process.env.REGISTRY_DATABASE_URL || null;
if (!connectionString) {
  console.warn("REGISTRY_DATABASE_URL not set — registryDb will be unavailable. Use DPO_DATABASE_URL and REGULATOR_DATABASE_URL instead.");
}

export const registryDb = connectionString ? drizzle(new Pool({ connectionString }), { schema }) : null as any;
