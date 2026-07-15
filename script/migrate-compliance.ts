import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DPO_DATABASE_URL || process.env.REGISTRY_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running compliance schema migration...");

    // Create baseline tables if they do not exist (since this database is separate)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        email text NOT NULL UNIQUE,
        password text NOT NULL,
        first_name text NOT NULL DEFAULT '',
        last_name text NOT NULL DEFAULT '',
        role text NOT NULL DEFAULT 'VIEWER',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        is_active boolean NOT NULL DEFAULT true,
        must_change_password boolean NOT NULL DEFAULT false,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS data_controllers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        controller_code varchar(255) NOT NULL UNIQUE,
        name text NOT NULL,
        contact_name text,
        contact_email text,
        organisation text,
        address text,
        metadata jsonb DEFAULT '{}',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS processing_records (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        record_code varchar(255) NOT NULL UNIQUE,
        controller_id varchar REFERENCES data_controllers(id) ON DELETE SET NULL,
        purpose text,
        lawful_basis text,
        data_categories text[],
        retention_policy jsonb,
        third_parties jsonb,
        processing_activities jsonb,
        status text NOT NULL DEFAULT 'ACTIVE',
        started_at timestamptz,
        stopped_at timestamptz,
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ baseline data_controllers and processing_records tables ensured");

    await client.query(`
      -- Add new columns to data_controllers if they don't exist
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='data_controllers' AND column_name='type') THEN
          ALTER TABLE data_controllers ADD COLUMN type text NOT NULL DEFAULT 'CONTROLLER';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='data_controllers' AND column_name='sector') THEN
          ALTER TABLE data_controllers ADD COLUMN sector text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='data_controllers' AND column_name='risk_level') THEN
          ALTER TABLE data_controllers ADD COLUMN risk_level text NOT NULL DEFAULT 'LOW';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='data_controllers' AND column_name='licence_status') THEN
          ALTER TABLE data_controllers ADD COLUMN licence_status text NOT NULL DEFAULT 'ACTIVE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='data_controllers' AND column_name='licence_expiry_date') THEN
          ALTER TABLE data_controllers ADD COLUMN licence_expiry_date timestamptz;
        END IF;
      END $$;
    `);
    console.log("✓ data_controllers columns added");

    await client.query(`
      -- Add new columns to processing_records if they don't exist
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='ropa_template') THEN
          ALTER TABLE processing_records ADD COLUMN ropa_template text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='completeness_score') THEN
          ALTER TABLE processing_records ADD COLUMN completeness_score real NOT NULL DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='lawful_basis_verified') THEN
          ALTER TABLE processing_records ADD COLUMN lawful_basis_verified boolean NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='lawful_basis_verification_notes') THEN
          ALTER TABLE processing_records ADD COLUMN lawful_basis_verification_notes text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='retention_expiry_date') THEN
          ALTER TABLE processing_records ADD COLUMN retention_expiry_date timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='excessive_data_detected') THEN
          ALTER TABLE processing_records ADD COLUMN excessive_data_detected boolean NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processing_records' AND column_name='excessive_data_notes') THEN
          ALTER TABLE processing_records ADD COLUMN excessive_data_notes text;
        END IF;
      END $$;
    `);
    console.log("✓ processing_records columns added");

    await client.query(`
      CREATE TABLE IF NOT EXISTS data_breaches (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        breach_code varchar NOT NULL UNIQUE,
        title text NOT NULL,
        description text NOT NULL,
        incident_date timestamptz NOT NULL,
        detected_date timestamptz NOT NULL,
        severity text NOT NULL DEFAULT 'LOW',
        status text NOT NULL DEFAULT 'REPORTED',
        impact_assessment text,
        root_cause text,
        remediation_actions text,
        evidence_file_urls text[] DEFAULT '{}',
        sla_deadline timestamptz,
        sla_status text NOT NULL DEFAULT 'ON_TRACK',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ data_breaches table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS dsr_requests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        request_code varchar NOT NULL UNIQUE,
        subject_name text NOT NULL,
        subject_email text NOT NULL,
        request_type text NOT NULL DEFAULT 'ACCESS',
        details text,
        status text NOT NULL DEFAULT 'RECEIVED',
        rejection_reason text,
        escalation_notes text,
        deadline timestamptz NOT NULL,
        response_sent_at timestamptz,
        complaints_count integer NOT NULL DEFAULT 0,
        target_controller_id varchar REFERENCES data_controllers(id),
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      ALTER TABLE dsr_requests
      ADD COLUMN IF NOT EXISTS target_controller_id varchar REFERENCES data_controllers(id);
    `);
    console.log("✓ dsr_requests table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS dsr_complaints (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        complaint_code varchar NOT NULL UNIQUE,
        request_id varchar REFERENCES dsr_requests(id),
        complainant_name text NOT NULL,
        complainant_email text NOT NULL,
        details text NOT NULL,
        status text NOT NULL DEFAULT 'OPEN',
        resolution_details text,
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ dsr_complaints table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_audits (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        audit_code varchar NOT NULL UNIQUE,
        title text NOT NULL,
        description text,
        target_controller_id varchar REFERENCES data_controllers(id),
        scheduled_date timestamptz NOT NULL,
        inspection_status text NOT NULL DEFAULT 'SCHEDULED',
        findings text,
        score real,
        enforcement_status text NOT NULL DEFAULT 'NONE',
        fine_amount real,
        corrective_actions text,
        evidence_repository_urls text[] DEFAULT '{}',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ compliance_audits table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS external_integrations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        system_name text NOT NULL,
        integration_type text NOT NULL,
        status text NOT NULL DEFAULT 'DISCONNECTED',
        last_sync_at timestamptz,
        sync_log text,
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ external_integrations table created");

    await seedDefaultDpoUser(client);

    console.log("\n✅ All compliance schema migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
async function seedDefaultDpoUser(client: any) {
  const username = process.env.DEFAULT_DPO_USERNAME || "dpo";
  const email = process.env.DEFAULT_DPO_EMAIL || "dpo@aiinstituteafrica.org";
  const password = process.env.DEFAULT_DPO_PASSWORD || "Dpo@12345!";
  const tenantId = process.env.DEFAULT_TENANT || "TENANT-001";

  const existing = await client.query(`SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1`, [username, email]);
  if (existing.rowCount > 0) {
    console.log(`✓ DPO user already exists: ${username}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await client.query(`
    INSERT INTO users (username, email, password, first_name, last_name, role, tenant_id, is_active, must_change_password, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, now(), now())
  `, [username, email, hashed, "Default", "DPO", "DATA_PROTECTION_OFFICER", tenantId]);

  console.log(`✓ Created default DPO user: ${username} / ${password}`);
}
migrate();
