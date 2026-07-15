import pg from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.REGULATOR_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running regulator-specific migrations...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS tee_attestations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        evidence_or_run_id text NOT NULL,
        scheme text NOT NULL,
        quote_id text NOT NULL,
        input_commitment text NOT NULL,
        output_commitment text NOT NULL,
        transcript_hash text NOT NULL,
        pcrs jsonb,
        mr_enclave_hash text,
        mr_signer_hash text,
        issued_at text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zkp_proofs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        evidence_or_run_id text NOT NULL,
        regulator_request_id text NOT NULL,
        scheme text NOT NULL,
        proof_id text NOT NULL,
        statements_commitment text NOT NULL,
        statement_commitments jsonb,
        all_conditions_satisfied boolean NOT NULL DEFAULT false,
        failed_conditions text[] NOT NULL DEFAULT '{}',
        generated_at text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_ledger_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        ledger_chain_id text NOT NULL,
        ledger_event_id text NOT NULL,
        event_type text NOT NULL,
        occurred_at text NOT NULL,
        payload_commitment text NOT NULL,
        dataset_code text,
        dataset_version text,
        statement_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS federated_audit_sessions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        request_id text NOT NULL UNIQUE,
        jurisdiction text NOT NULL,
        cross_border boolean NOT NULL DEFAULT false,
        required_compliance_conditions jsonb,
        scope jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        org_computed_at text,
        aggregates_commitment text,
        all_conditions_satisfied boolean NOT NULL DEFAULT false,
        failed_conditions text[] NOT NULL DEFAULT '{}'
      );
    `);

    await seedDefaultRegulatorUser(client);
    console.log("✓ regulator migrations applied");
  } catch (err) {
    console.error("Regulator migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedDefaultRegulatorUser(client: any) {
  const username = process.env.DEFAULT_REGULATOR_USERNAME || "regulator";
  const email = process.env.DEFAULT_REGULATOR_EMAIL || "regulator@aiinstituteafrica.org";
  const password = process.env.DEFAULT_REGULATOR_PASSWORD || "Regulator@12345!";
  const tenantId = process.env.DEFAULT_TENANT || "TENANT-001";

  const existing = await client.query(`SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1`, [username, email]);
  if (existing.rowCount > 0) {
    console.log(`✓ Regulator user already exists: ${username}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await client.query(`
    INSERT INTO users (username, email, password, first_name, last_name, role, tenant_id, is_active, must_change_password, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, now(), now())
  `, [username, email, hashed, "Default", "Regulator", "REGULATOR", tenantId]);

  console.log(`✓ Created default Regulator user: ${username} / ${password}`);
}

migrate();
