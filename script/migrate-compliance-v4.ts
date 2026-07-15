import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DPO_DATABASE_URL || process.env.REGISTRY_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running compliance schema migration (v4)...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS external_integration_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id varchar NOT NULL REFERENCES external_integrations(id) ON DELETE CASCADE,
        event_type text NOT NULL DEFAULT 'SYNC',
        severity text NOT NULL DEFAULT 'INFO',
        message text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ external_integration_events table created");

    await client.query(`
      ALTER TABLE external_integrations
      ADD COLUMN IF NOT EXISTS display_name text,
      ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT 'API',
      ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'UNKNOWN',
      ADD COLUMN IF NOT EXISTS last_error text,
      ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS next_sync_at timestamptz,
      ADD COLUMN IF NOT EXISTS created_by varchar,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    `);
    console.log("✓ external_integrations table updated with new connector fields");

    await client.query(`
      UPDATE external_integrations
      SET display_name = COALESCE(display_name, system_name),
          connector_type = COALESCE(connector_type, 'API'),
          enabled = COALESCE(enabled, true),
          health_status = COALESCE(health_status, 'UNKNOWN'),
          config = COALESCE(config, '{}'),
          metadata = COALESCE(metadata, '{}'),
          updated_at = COALESCE(updated_at, now())
      WHERE TRUE;
    `);
    console.log("✓ external_integrations existing rows migrated");

    console.log("\n✅ All compliance v4 migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
