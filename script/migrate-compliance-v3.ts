/**
 * Migration v3 — Remaining CDPA compliance tables
 * Phases: Privacy Notices, Notifications, Authorisation Requests,
 *         ADM Register, Security Controls, DPAs, Representation,
 *         Investigations, Public Register, Codes of Conduct,
 *         Regulation Config, Policy Notes, Cross-Border Liaison
 */
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DPO_DATABASE_URL || process.env.REGISTRY_DATABASE_URL || process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log("Running compliance schema migration (v3)...");

    // 1. Privacy Notices (ss.15-16)
    await client.query(`
      CREATE TABLE IF NOT EXISTS privacy_notices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id UUID,
        processing_activity_id UUID,
        title TEXT NOT NULL,
        controller_identity TEXT NOT NULL,
        purposes TEXT[] NOT NULL DEFAULT '{}',
        data_categories TEXT[] NOT NULL DEFAULT '{}',
        legal_bases TEXT[] NOT NULL DEFAULT '{}',
        third_party_disclosures TEXT,
        data_subject_rights TEXT,
        retention_summary TEXT,
        contact_dpo TEXT,
        disproportionate_effort BOOLEAN DEFAULT FALSE,
        disproportionate_reason TEXT,
        version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'draft',
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ privacy_notices table created");

    // 2. Processing Notifications — 14-point checklist (ss.20-22)
    await client.query(`
      CREATE TABLE IF NOT EXISTS processing_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id UUID,
        name TEXT NOT NULL,
        legal_basis TEXT NOT NULL,
        purposes TEXT[] NOT NULL DEFAULT '{}',
        data_categories TEXT[] NOT NULL DEFAULT '{}',
        sensitive_data_description TEXT,
        data_subject_categories TEXT[] NOT NULL DEFAULT '{}',
        third_party_safeguards TEXT,
        data_subject_info_method TEXT,
        related_processing TEXT,
        retention_period TEXT NOT NULL,
        security_self_assessment TEXT,
        processor_details TEXT,
        cross_border_plans TEXT,
        risk_score NUMERIC DEFAULT 0,
        risk_level TEXT DEFAULT 'LOW',
        status TEXT DEFAULT 'draft',
        submitted_at TIMESTAMPTZ,
        ack_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ processing_notifications table created");

    // 3. Authorisation Requests (s.22)
    await client.query(`
      CREATE TABLE IF NOT EXISTS authorisation_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id UUID,
        notification_id UUID,
        processing_name TEXT NOT NULL,
        risk_assessment_json JSONB DEFAULT '{}',
        submitted_at TIMESTAMPTZ,
        decision TEXT DEFAULT 'PENDING',
        conditions TEXT,
        decided_by TEXT,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ authorisation_requests table created");

    // 4. Automated Decision-Making Register (s.25)
    await client.query(`
      CREATE TABLE IF NOT EXISTS adm_systems (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id UUID,
        system_name TEXT NOT NULL,
        description TEXT,
        legal_basis TEXT NOT NULL,
        data_categories TEXT[] DEFAULT '{}',
        output_type TEXT,
        human_review_available BOOLEAN DEFAULT TRUE,
        opt_out_mechanism TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ adm_systems table created");

    // 5. Security Controls Register (s.18)
    await client.query(`
      CREATE TABLE IF NOT EXISTS security_controls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id UUID,
        control_ref TEXT NOT NULL,
        control_name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        implementation_status TEXT DEFAULT 'PLANNED',
        evidence_uri TEXT,
        last_reviewed_at TIMESTAMPTZ,
        next_review_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ security_controls table created");

    // 6. Data Processing Agreements (s.18(5))
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_processing_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        controller_org_id UUID,
        processor_name TEXT NOT NULL,
        processor_contact TEXT,
        dpa_type TEXT DEFAULT 'STANDARD',
        document_uri TEXT,
        signed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        renewal_reminder_sent_at TIMESTAMPTZ,
        status TEXT DEFAULT 'DRAFT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ data_processing_agreements table created");

    // 7. Representation Records (ss.26-27)
    await client.query(`
      CREATE TABLE IF NOT EXISTS representation_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        representation_type TEXT NOT NULL,
        data_subject_name TEXT NOT NULL,
        data_subject_dob DATE,
        representative_name TEXT NOT NULL,
        representative_email TEXT,
        representative_type TEXT NOT NULL,
        relationship TEXT,
        proof_document_uri TEXT,
        verification_status TEXT DEFAULT 'PENDING',
        verified_at TIMESTAMPTZ,
        linked_dsr_id UUID,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ representation_records table created");

    // 8. Investigation & Complaints Cases (s.6(1)(f)-(h))
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        case_number TEXT UNIQUE,
        source TEXT NOT NULL,
        subject_org_name TEXT,
        complainant_name TEXT,
        complainant_email TEXT,
        description TEXT NOT NULL,
        assigned_officer TEXT,
        status TEXT DEFAULT 'OPEN',
        priority TEXT DEFAULT 'MEDIUM',
        findings TEXT,
        linked_breach_id UUID,
        linked_whistleblower_id UUID,
        linked_enforcement_id UUID,
        opened_at TIMESTAMPTZ DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ investigation_cases table created");

    // 9. Public Register Entries (s.23)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public_register_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID,
        org_name TEXT NOT NULL,
        processing_name TEXT NOT NULL,
        purposes TEXT[] DEFAULT '{}',
        data_categories TEXT[] DEFAULT '{}',
        legal_basis TEXT,
        retention_period TEXT,
        published_at TIMESTAMPTZ DEFAULT NOW(),
        published_by TEXT,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("✓ public_register_entries table created");

    // 10. Codes of Conduct (s.30)
    await client.query(`
      CREATE TABLE IF NOT EXISTS codes_of_conduct (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        submitting_org_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        document_uri TEXT,
        status TEXT DEFAULT 'SUBMITTED',
        consultation_required BOOLEAN DEFAULT FALSE,
        consultation_notes TEXT,
        decided_by TEXT,
        decided_at TIMESTAMPTZ,
        rejection_reason TEXT,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ codes_of_conduct table created");

    // 11. Regulation Config (s.32)
    await client.query(`
      CREATE TABLE IF NOT EXISTS regulation_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key TEXT UNIQUE NOT NULL,
        config_value JSONB NOT NULL,
        description TEXT,
        s32_reference TEXT,
        effective_from TIMESTAMPTZ DEFAULT NOW(),
        set_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ regulation_configs table created");

    // 12. Policy Notes & Cross-Border Liaison (s.6(1)(i)-(j))
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        note_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT,
        tags TEXT[] DEFAULT '{}',
        is_published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ policy_notes table created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS cross_border_liaisons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        partner_authority TEXT NOT NULL,
        country TEXT NOT NULL,
        liaison_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        description TEXT,
        outcome TEXT,
        mou_reference TEXT,
        date_of_contact TIMESTAMPTZ,
        next_action TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ cross_border_liaisons table created");

    // 13. Processor Instruction Log (s.17 GAP)
    await client.query(`
      CREATE TABLE IF NOT EXISTS processor_instructions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        controller_id VARCHAR,
        processor_name TEXT NOT NULL,
        processor_contact TEXT,
        instruction_title TEXT NOT NULL,
        instruction_details TEXT NOT NULL,
        lawful_basis TEXT,
        data_categories JSONB DEFAULT '[]'::jsonb,
        processing_permitted JSONB DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        issued_at TIMESTAMPTZ DEFAULT NOW(),
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by TEXT,
        revoked_at TIMESTAMPTZ
      );
    `);
    console.log("✓ processor_instructions table created");

    // 14. Purpose Register & Compatibility Checker (ss.8-9 GAP)
    await client.query(`
      CREATE TABLE IF NOT EXISTS purpose_register (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        processing_activity_id UUID,
        purpose_name TEXT NOT NULL,
        purpose_description TEXT,
        legal_basis TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT TRUE,
        is_compatible_with_original BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ purpose_register table created");

    // 15. Exemption Decisions (s.20(4) GAP)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exemption_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        org_id VARCHAR,
        processing_activity_id UUID,
        has_notified_dpo BOOLEAN NOT NULL DEFAULT FALSE,
        risk_score NUMERIC NOT NULL DEFAULT 0,
        is_eligible BOOLEAN NOT NULL DEFAULT FALSE,
        authority_decision TEXT NOT NULL DEFAULT 'PENDING',
        conditions TEXT,
        decided_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✓ exemption_decisions table created");

    // Seed default Regulation Configs
    await client.query(`
      INSERT INTO regulation_configs (config_key, config_value, description, s32_reference, set_by)
      VALUES
        ('dsrr_sla_days', '30', 'Default SLA days for responding to Data Subject Rights Requests (configurable)', 's.14 — Act does not specify; 30 days is operational default', 'SYSTEM'),
        ('breach_notification_hours', '24', 'Hours from detection to Authority notification (s.19)', 's.19', 'SYSTEM'),
        ('high_risk_score_threshold', '70', 'Risk score above which processing requires Authorisation Request (s.22)', 's.22', 'SYSTEM'),
        ('adequacy_auto_flag_volume', '10000', 'Transfer volume (data subjects) above which auto-flag for Authority review', 's.28-29', 'SYSTEM'),
        ('dpa_renewal_reminder_days', '30', 'Days before DPA expiry to send renewal reminder (s.18(5))', 's.18(5)', 'SYSTEM')
      ON CONFLICT (config_key) DO NOTHING;
    `);
    console.log("✓ Seeded default regulation configs");

    console.log("\n✅ All compliance v3 migrations applied successfully!");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
