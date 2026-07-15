import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DPO_DATABASE_URL || process.env.REGISTRY_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running compliance schema migration (v2)...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS dpo_appointments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES data_controllers(id),
        name text NOT NULL,
        email text NOT NULL,
        appointed_at timestamptz NOT NULL DEFAULT now(),
        notified_to_authority_at timestamptz,
        status text NOT NULL DEFAULT 'PENDING',
        is_zimbabwe_established boolean NOT NULL DEFAULT true,
        local_rep_name text,
        local_rep_email text,
        tenant_id text NOT NULL DEFAULT 'TENANT-001'
      );
    `);
    console.log("✓ dpo_appointments table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS consent_records (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES data_controllers(id),
        data_subject_name text NOT NULL,
        data_subject_email text NOT NULL,
        sensitivity_tier text NOT NULL,
        method text NOT NULL,
        legal_basis_code text NOT NULL,
        justification text,
        evidence_uri text,
        given_at timestamptz NOT NULL DEFAULT now(),
        withdrawn_at timestamptz,
        tenant_id text NOT NULL DEFAULT 'TENANT-001'
      );
    `);
    console.log("✓ consent_records table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_identifiers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES data_controllers(id),
        data_subject_name text NOT NULL,
        data_subject_email text NOT NULL,
        identifier_value text NOT NULL UNIQUE,
        health_professional_custodian text NOT NULL,
        authority_approval_id text,
        linked_ids text[] DEFAULT '{}',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ patient_identifiers table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_records (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES data_controllers(id),
        destination_country text NOT NULL,
        adequacy_status text NOT NULL,
        derogation_code text,
        justification text,
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ transfer_records table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS whistleblower_reports (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES data_controllers(id),
        is_anonymous boolean NOT NULL DEFAULT true,
        reporter_name text,
        reporter_email text,
        implicated_person text NOT NULL,
        details text NOT NULL,
        disclosure_status text NOT NULL DEFAULT 'PENDING',
        withheld_reason text,
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        filed_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ whistleblower_reports table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS enforcement_cases (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        respondent_name text NOT NULL,
        breached_sections text[] NOT NULL,
        penalty_band text NOT NULL,
        fine_amount real,
        imprisonment_term text,
        seizure_order boolean NOT NULL DEFAULT false,
        deletion_order boolean NOT NULL DEFAULT false,
        destruction_confirmed_at timestamptz,
        status text NOT NULL DEFAULT 'OPEN',
        tenant_id text NOT NULL DEFAULT 'TENANT-001',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ enforcement_cases table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS appeal_cases (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        enforcement_case_id varchar NOT NULL REFERENCES enforcement_cases(id),
        filed_at timestamptz NOT NULL DEFAULT now(),
        court_reference text NOT NULL,
        outcome text,
        status text NOT NULL DEFAULT 'PENDING',
        tenant_id text NOT NULL DEFAULT 'TENANT-001'
      );
    `);
    console.log("✓ appeal_cases table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS adequacy_countries (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        country_name text NOT NULL UNIQUE,
        is_adequate boolean NOT NULL DEFAULT true,
        legal_basis text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("✓ adequacy_countries table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS authority_approvals (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_type text NOT NULL,
        subject_id text NOT NULL,
        decision text NOT NULL DEFAULT 'PENDING',
        conditions text,
        decided_by text,
        decided_at timestamptz,
        tenant_id text NOT NULL DEFAULT 'TENANT-001'
      );
    `);
    console.log("✓ authority_approvals table created");

    // Seed default adequacy list if empty
    const { rows } = await client.query("SELECT COUNT(*) FROM adequacy_countries");
    if (parseInt(rows[0].count) === 0) {
      await client.query(`
        INSERT INTO adequacy_countries (country_name, is_adequate, legal_basis) VALUES
        ('South Africa', true, 'Adequate data protection act equivalent (POPIA)'),
        ('Mauritius', true, 'Adequate data protection law'),
        ('Kenya', true, 'Adequate protection act and independent regulator'),
        ('United Kingdom', true, 'Adequate GDPR equivalent status'),
        ('Germany', true, 'Adequate EU GDPR regime');
      `);
      console.log("✓ Seeded default adequacy list");
    }

    console.log("\n✅ All compliance v2 migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
