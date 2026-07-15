// ─── v3 Compliance Service Functions ─────────────────────────────────────────
// These use raw SQL via db.execute() since v3 tables are created by migrate-compliance-v3.ts
// and may not have Drizzle table objects yet.
import { dpoDb as db } from "../dpoDb";
import { sql } from "drizzle-orm";
import { resolvePublicDsrTargetControllerId, resolvePublicDsrTenantId } from "./public-dsr-tenant";


// ─── Privacy Notices (ss.15-16) ──────────────────────────────────────────────
export async function listPrivacyNotices(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM privacy_notices WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createPrivacyNotice(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO privacy_notices (tenant_id, org_id, title, controller_identity, purposes,
      data_categories, legal_bases, third_party_disclosures, data_subject_rights,
      retention_summary, contact_dpo, disproportionate_effort, disproportionate_reason, status)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.title}, ${data.controllerIdentity},
      ${JSON.stringify(data.purposes || [])}, ${JSON.stringify(data.dataCategories || [])},
      ${JSON.stringify(data.legalBases || [])}, ${data.thirdPartyDisclosures || null},
      ${data.dataSubjectRights || null}, ${data.retentionSummary || null},
      ${data.contactDpo || null}, ${!!data.disproportionateEffort},
      ${data.disproportionateReason || null}, 'draft')
    RETURNING *`);
  return result.rows[0];
}
export async function publishPrivacyNotice(id: string) {
  const result = await db.execute(sql`
    UPDATE privacy_notices SET status = 'published', published_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Processing Notifications (ss.20-22) ─────────────────────────────────────
export async function listProcessingNotifications(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM processing_notifications WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createProcessingNotification(data: any, tenantId: string) {
  // Risk score: sensitivity(0-40) + volume(0-30) + cross-border(0-30)
  // Thresholds are driven by regulation_configs (s.32) — no hardcoding
  const configRows = await db.execute(sql`
    SELECT config_key, config_value FROM regulation_configs
    WHERE config_key IN ('high_risk_score_threshold', 'medium_risk_score_threshold')`);
  const configMap: Record<string, number> = {};
  for (const row of configRows.rows as any[]) {
    configMap[row.config_key] = Number(row.config_value);
  }
  const HIGH_THRESHOLD = configMap['high_risk_score_threshold'] ?? 70;
  const MEDIUM_THRESHOLD = configMap['medium_risk_score_threshold'] ?? 40;

  const sensitivityScore = data.dataCategories?.some((c: string) =>
    c.toLowerCase().includes("health") || c.toLowerCase().includes("genetic") || c.toLowerCase().includes("biometric")) ? 40
    : data.dataCategories?.some((c: string) =>
      c.toLowerCase().includes("sensitive") || c.toLowerCase().includes("political") || c.toLowerCase().includes("racial")) ? 25 : 10;
  const volumeScore = data.dataSubjectCategories?.length > 3 ? 30 : data.dataSubjectCategories?.length > 1 ? 15 : 5;
  const crossBorderScore = data.crossBorderPlans ? 30 : 0;
  const riskScore = sensitivityScore + volumeScore + crossBorderScore;
  const riskLevel = riskScore >= HIGH_THRESHOLD ? 'HIGH' : riskScore >= MEDIUM_THRESHOLD ? 'MEDIUM' : 'LOW';

  const result = await db.execute(sql`
    INSERT INTO processing_notifications (tenant_id, org_id, name, legal_basis, purposes,
      data_categories, sensitive_data_description, data_subject_categories, third_party_safeguards,
      data_subject_info_method, related_processing, retention_period, security_self_assessment,
      processor_details, cross_border_plans, risk_score, risk_level, status)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.name}, ${data.legalBasis},
      ${JSON.stringify(data.purposes || [])}, ${JSON.stringify(data.dataCategories || [])},
      ${data.sensitiveDataDescription || null}, ${JSON.stringify(data.dataSubjectCategories || [])},
      ${data.thirdPartySafeguards || null}, ${data.dataSubjectInfoMethod || null},
      ${data.relatedProcessing || null}, ${data.retentionPeriod}, ${data.securitySelfAssessment || null},
      ${data.processorDetails || null}, ${data.crossBorderPlans || null},
      ${riskScore}, ${riskLevel}, 'draft')
    RETURNING *`);
  const notification = result.rows[0];

  // Auto-create authorisation request for high-risk
  if (riskLevel === 'HIGH') {
    await db.execute(sql`
      INSERT INTO authorisation_requests (tenant_id, org_id, notification_id, processing_name, status)
      VALUES (${tenantId}, ${data.orgId || null}, ${(notification as any).id}, ${data.name}, 'draft')`);
  }
  return { ...(notification as any), riskLevel, riskScore, authRequestCreated: riskLevel === 'HIGH' };
}
export async function submitProcessingNotification(id: string) {
  const result = await db.execute(sql`
    UPDATE processing_notifications SET status = 'submitted', submitted_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Authorisation Requests (s.22) ───────────────────────────────────────────
export async function listAuthorisationRequests(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM authorisation_requests WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createAuthorisationRequest(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO authorisation_requests (tenant_id, org_id, notification_id, processing_name,
      risk_assessment_json, status)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.notificationId || null}, ${data.processingName},
      ${JSON.stringify(data.riskAssessment || {})}, 'submitted')
    RETURNING *`);
  return result.rows[0];
}
export async function decideAuthorisationRequest(id: string, data: any, decidedBy: string) {
  const result = await db.execute(sql`
    UPDATE authorisation_requests SET decision = ${data.decision},
      conditions = ${data.conditions || null}, decided_by = ${decidedBy}, decided_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── ADM Systems (s.25) ──────────────────────────────────────────────────────
export async function listAdmSystems(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM adm_systems WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createAdmSystem(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO adm_systems (tenant_id, org_id, system_name, description, legal_basis,
      data_categories, output_type, human_review_available, opt_out_mechanism)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.systemName}, ${data.description || null},
      ${data.legalBasis}, ${JSON.stringify(data.dataCategories || [])}, ${data.outputType || null},
      ${data.humanReviewAvailable !== false}, ${data.optOutMechanism || null})
    RETURNING *`);
  return result.rows[0];
}
export async function updateAdmSystem(id: string, data: any) {
  const result = await db.execute(sql`
    UPDATE adm_systems SET status = ${data.status}, updated_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Security Controls (s.18) ────────────────────────────────────────────────
export async function listSecurityControls(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM security_controls WHERE tenant_id = ${tenantId} ORDER BY category, control_ref`);
  return result.rows;
}
export async function createSecurityControl(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO security_controls (tenant_id, org_id, control_ref, control_name, category,
      description, implementation_status, evidence_uri, next_review_at)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.controlRef}, ${data.controlName},
      ${data.category}, ${data.description || null}, ${data.implementationStatus || 'PLANNED'},
      ${data.evidenceUri || null}, ${data.nextReviewAt ? new Date(data.nextReviewAt) : null})
    RETURNING *`);
  return result.rows[0];
}
export async function updateSecurityControl(id: string, data: any) {
  const result = await db.execute(sql`
    UPDATE security_controls SET implementation_status = ${data.implementationStatus},
      evidence_uri = ${data.evidenceUri || null}, last_reviewed_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Data Processing Agreements (s.18(5)) ────────────────────────────────────
export async function listDpas(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM data_processing_agreements WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createDpa(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO data_processing_agreements (tenant_id, controller_org_id, processor_name,
      processor_contact, dpa_type, document_uri, signed_at, expires_at, status, notes)
    VALUES (${tenantId}, ${data.orgId || null}, ${data.processorName}, ${data.processorContact || null},
      ${data.dpaType || 'STANDARD'}, ${data.documentUri || null},
      ${data.signedAt ? new Date(data.signedAt) : null},
      ${data.expiresAt ? new Date(data.expiresAt) : null},
      ${data.status || 'DRAFT'}, ${data.notes || null})
    RETURNING *`);
  return result.rows[0];
}
export async function updateDpa(id: string, data: any) {
  const result = await db.execute(sql`
    UPDATE data_processing_agreements SET status = ${data.status},
      document_uri = COALESCE(${data.documentUri || null}, document_uri),
      signed_at = COALESCE(${data.signedAt ? new Date(data.signedAt) : null}, signed_at),
      updated_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Representation Records (ss.26-27) ───────────────────────────────────────
export async function listRepresentationRecords(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM representation_records WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createRepresentationRecord(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO representation_records (tenant_id, representation_type, data_subject_name,
      data_subject_dob, representative_name, representative_email, representative_type,
      relationship, notes)
    VALUES (${tenantId}, ${data.representationType}, ${data.dataSubjectName},
      ${data.dataSubjectDob ? new Date(data.dataSubjectDob) : null},
      ${data.representativeName}, ${data.representativeEmail || null},
      ${data.representativeType}, ${data.relationship || null}, ${data.notes || null})
    RETURNING *`);
  return result.rows[0];
}
export async function verifyRepresentationRecord(id: string, verifiedBy: string) {
  const result = await db.execute(sql`
    UPDATE representation_records SET verification_status = 'VERIFIED', verified_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Investigation Cases (s.6(1)(f)-(h)) ─────────────────────────────────────
export async function listInvestigationCases(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM investigation_cases WHERE tenant_id = ${tenantId} ORDER BY opened_at DESC`);
  return result.rows;
}
export async function createInvestigationCase(data: any, tenantId: string) {
  const caseNum = `INV-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.execute(sql`
    INSERT INTO investigation_cases (tenant_id, case_number, source, subject_org_name,
      complainant_name, complainant_email, description, assigned_officer, priority,
      linked_breach_id, linked_whistleblower_id)
    VALUES (${tenantId}, ${caseNum}, ${data.source || 'COMPLAINT'}, ${data.subjectOrgName || null},
      ${data.complainantName || null}, ${data.complainantEmail || null}, ${data.description},
      ${data.assignedOfficer || null}, ${data.priority || 'MEDIUM'},
      ${data.linkedBreachId || null}, ${data.linkedWhistleblowerId || null})
    RETURNING *`);
  return result.rows[0];
}
export async function updateInvestigationCase(id: string, data: any) {
  const result = await db.execute(sql`
    UPDATE investigation_cases SET status = COALESCE(${data.status || null}, status),
      assigned_officer = COALESCE(${data.assignedOfficer || null}, assigned_officer),
      findings = COALESCE(${data.findings || null}, findings),
      closed_at = CASE WHEN ${data.status || ''} = 'CLOSED' THEN NOW() ELSE closed_at END
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Public Register (s.23) ──────────────────────────────────────────────────
export async function listPublicRegisterEntries() {
  const result = await db.execute(sql`
    SELECT * FROM public_register_entries WHERE is_active = TRUE ORDER BY published_at DESC`);
  return result.rows;
}
export async function publishToPublicRegister(data: any, publishedBy: string) {
  const result = await db.execute(sql`
    INSERT INTO public_register_entries (notification_id, org_name, processing_name,
      purposes, data_categories, legal_basis, retention_period, published_by)
    VALUES (${data.notificationId || null}, ${data.orgName}, ${data.processingName},
      ${JSON.stringify(data.purposes || [])}, ${JSON.stringify(data.dataCategories || [])},
      ${data.legalBasis || null}, ${data.retentionPeriod || null}, ${publishedBy})
    RETURNING *`);
  return result.rows[0];
}
export async function removeFromPublicRegister(id: string) {
  const result = await db.execute(sql`
    UPDATE public_register_entries SET is_active = FALSE WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Codes of Conduct (s.30) ─────────────────────────────────────────────────
export async function listCodesOfConduct(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM codes_of_conduct WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function listPublishedCodesOfConduct() {
  const result = await db.execute(sql`
    SELECT * FROM codes_of_conduct WHERE status = 'APPROVED' ORDER BY published_at DESC`);
  return result.rows;
}
export async function createCodeOfConduct(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO codes_of_conduct (tenant_id, submitting_org_name, title, description, document_uri)
    VALUES (${tenantId}, ${data.submittingOrgName}, ${data.title}, ${data.description || null},
      ${data.documentUri || null})
    RETURNING *`);
  return result.rows[0];
}
export async function decideCodeOfConduct(id: string, data: any, decidedBy: string) {
  const isApproved = data.decision === 'APPROVED';
  const result = await db.execute(sql`
    UPDATE codes_of_conduct SET status = ${data.decision},
      decided_by = ${decidedBy}, decided_at = NOW(),
      rejection_reason = ${data.rejectionReason || null},
      consultation_notes = COALESCE(${data.consultationNotes || null}, consultation_notes),
      published_at = ${isApproved ? new Date() : null},
      updated_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── Regulation Config (s.32) ────────────────────────────────────────────────
export async function listRegulationConfigs() {
  const result = await db.execute(sql`
    SELECT * FROM regulation_configs ORDER BY config_key`);
  return result.rows;
}
export async function upsertRegulationConfig(data: any, setBy: string) {
  const result = await db.execute(sql`
    INSERT INTO regulation_configs (config_key, config_value, description, s32_reference, set_by)
    VALUES (${data.configKey}, ${JSON.stringify(data.configValue)}, ${data.description || null},
      ${data.s32Reference || null}, ${setBy})
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      description = COALESCE(EXCLUDED.description, regulation_configs.description),
      s32_reference = COALESCE(EXCLUDED.s32_reference, regulation_configs.s32_reference),
      set_by = EXCLUDED.set_by, updated_at = NOW()
    RETURNING *`);
  return result.rows[0];
}

export async function listDpoConfig() {
  const result = await db.execute(sql`
    SELECT * FROM regulation_configs
    WHERE config_key LIKE 'dpo_%'
    ORDER BY config_key`);
  return result.rows;
}

export async function setDpoConfig(configs: any[], setBy: string) {
  const updates = [];
  for (const cfg of configs) {
    const row = await upsertRegulationConfig({
      configKey: cfg.configKey,
      configValue: cfg.configValue,
      description: cfg.description || "DPO portal configuration",
      s32Reference: cfg.s32Reference || null,
    }, setBy);
    updates.push(row);
  }
  return updates;
}

// ─── Policy Notes & Cross-Border Liaison (s.6(1)(i)-(j)) ─────────────────────
export async function listPolicyNotes(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM policy_notes WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`);
  return result.rows;
}
export async function createPolicyNote(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO policy_notes (tenant_id, note_type, title, content, author, tags, is_published)
    VALUES (${tenantId}, ${data.noteType || 'POLICY'}, ${data.title}, ${data.content},
      ${data.author || null}, ${JSON.stringify(data.tags || [])}, ${!!data.isPublished})
    RETURNING *`);
  return result.rows[0];
}
export async function listCrossBorderLiaisons(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM cross_border_liaisons WHERE tenant_id = ${tenantId} ORDER BY date_of_contact DESC`);
  return result.rows;
}
export async function createCrossBorderLiaison(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO cross_border_liaisons (tenant_id, partner_authority, country, liaison_type,
      subject, description, outcome, mou_reference, date_of_contact, next_action)
    VALUES (${tenantId}, ${data.partnerAuthority}, ${data.country}, ${data.liaisonType || 'MEETING'},
      ${data.subject}, ${data.description || null}, ${data.outcome || null},
      ${data.mouReference || null}, ${data.dateOfContact ? new Date(data.dateOfContact) : new Date()},
      ${data.nextAction || null})
    RETURNING *`);
  return result.rows[0];
}

// ─── GAP 1: Processor Instruction Log (s.17) ─────────────────────────────────
export async function listProcessorInstructions(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM processor_instructions WHERE tenant_id = ${tenantId}
    ORDER BY issued_at DESC`);
  return result.rows;
}
export async function createProcessorInstruction(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO processor_instructions (
      tenant_id, controller_id, processor_name, processor_contact,
      instruction_title, instruction_details, lawful_basis, data_categories,
      processing_permitted, status, issued_at)
    VALUES (
      ${tenantId}, ${data.controllerId || null}, ${data.processorName}, ${data.processorContact || null},
      ${data.instructionTitle}, ${data.instructionDetails},
      ${data.lawfulBasis || null}, ${JSON.stringify(data.dataCategories || [])},
      ${JSON.stringify(data.processingPermitted || [])}, 'ACTIVE', NOW())
    RETURNING *`);
  return result.rows[0];
}
export async function revokeProcessorInstruction(id: string) {
  const result = await db.execute(sql`
    UPDATE processor_instructions SET status = 'REVOKED', revoked_at = NOW()
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}
export async function acknowledgeProcessorInstruction(id: string, acknowledgedBy: string) {
  const result = await db.execute(sql`
    UPDATE processor_instructions
    SET acknowledged_at = NOW(), acknowledged_by = ${acknowledgedBy}, status = 'ACKNOWLEDGED'
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── GAP 2: Retention Overdue & Compliance Checklist (ss.7, 13) ──────────────
export async function listOverdueRetentionActivities(tenantId: string) {
  const result = await db.execute(sql`
    SELECT id, record_code, purpose, retention_expiry_date,
      CURRENT_DATE - retention_expiry_date::date AS days_overdue
    FROM processing_records
    WHERE tenant_id = ${tenantId}
      AND retention_expiry_date IS NOT NULL
      AND retention_expiry_date::date < CURRENT_DATE
    ORDER BY retention_expiry_date ASC`);
  return result.rows;
}
export async function listComplianceChecklist(tenantId: string) {
  // Returns per-processing-activity compliance status across all 14 obligations
  const result = await db.execute(sql`
    SELECT pr.id, pr.record_code, pr.purpose, pr.lawful_basis_code, pr.status,
      pr.retention_expiry_date,
      COUNT(DISTINCT cr.id) AS consent_count,
      COUNT(DISTINCT dp.id) AS dpa_count,
      COUNT(DISTINCT sc.id) AS security_control_count,
      MAX(pn.submitted_at) AS last_notification_at
    FROM processing_records pr
    LEFT JOIN consent_records cr ON cr.org_id = pr.controller_id
    LEFT JOIN dpas dp ON dp.controller_id = pr.controller_id AND dp.status = 'ACTIVE'
    LEFT JOIN security_controls sc ON sc.tenant_id = pr.tenant_id AND sc.status = 'IMPLEMENTED'
    LEFT JOIN processing_notifications pn ON pn.tenant_id = pr.tenant_id
    WHERE pr.tenant_id = ${tenantId}
    GROUP BY pr.id, pr.record_code, pr.purpose, pr.lawful_basis_code,
             pr.status, pr.retention_expiry_date
    ORDER BY pr.created_at DESC`);
  return result.rows;
}
export async function markRetentionReviewed(id: string, newExpiryDate: string) {
  const result = await db.execute(sql`
    UPDATE processing_records
    SET retention_expiry_date = ${newExpiryDate}::date,
        lawful_basis_verification_notes = 'Retention reviewed on ' || NOW()::date
    WHERE id = ${id} RETURNING *`);
  return result.rows[0];
}

// ─── GAP 3: Purpose Register & Compatibility Checker (ss.8-9) ────────────────
export async function listPurposes(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM purpose_register WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC`);
  return result.rows;
}
export async function createPurpose(data: any, tenantId: string) {
  const result = await db.execute(sql`
    INSERT INTO purpose_register (
      tenant_id, processing_activity_id, purpose_name, purpose_description,
      legal_basis, is_primary, is_compatible_with_original)
    VALUES (
      ${tenantId}, ${data.processingActivityId || null},
      ${data.purposeName}, ${data.purposeDescription || null},
      ${data.legalBasis}, ${!!data.isPrimary}, ${data.isCompatibleWithOriginal !== false})
    RETURNING *`);
  return result.rows[0];
}
export async function checkPurposeCompatibility(originalPurposeId: string, newPurposeDescription: string) {
  // Checks the 5-factor compatibility test per s.9(1)
  const original = await db.execute(sql`
    SELECT * FROM purpose_register WHERE id = ${originalPurposeId}`);
  const orig = original.rows[0] as any;
  if (!orig) throw { status: 404, message: 'Original purpose not found' };
  // Heuristic factors scored 0-20 each
  const factors = {
    linkage: newPurposeDescription.toLowerCase().includes(orig.purpose_name?.toLowerCase()) ? 20 : 5,
    context: orig.legal_basis === 'PUBLIC_TASK' || orig.legal_basis === 'LEGAL_OBLIGATION' ? 20 : 10,
    nature: orig.legal_basis === 'CONSENT' ? 15 : 10,
    consequences: 10, // default mid-score, auditor to confirm
    safeguards: 10,   // default mid-score
  };
  const compatibilityScore = Object.values(factors).reduce((a, b) => a + b, 0);
  const isCompatible = compatibilityScore >= 60;
  return { originalPurpose: orig, newPurposeDescription, factors, compatibilityScore, isCompatible,
    guidance: isCompatible
      ? 'Secondary purpose appears compatible under s.9(1). Document and retain this assessment.'
      : 'Secondary purpose MAY be incompatible. Seek fresh consent or legal basis before proceeding.' };
}

// ─── GAP 4: Whistleblower Implicated-Person Notice Workflow (s.31) ────────────
export async function sendImplicatedPersonNotice(reportId: string, notifiedBy: string) {
  const result = await db.execute(sql`
    UPDATE whistleblower_reports
    SET implicated_person_notified_at = NOW(),
        implicated_person_notified_by = ${notifiedBy},
        disclosure_status = 'DISCLOSED'
    WHERE id = ${reportId} RETURNING *`);
  return result.rows[0];
}
export async function withholdImplicatedPersonNotice(reportId: string, reason: string, reviewByDate: string, withheldBy: string) {
  const result = await db.execute(sql`
    UPDATE whistleblower_reports
    SET disclosure_status = 'WITHHELD_EXCEPTION',
        withheld_reason = ${reason},
        withheld_review_date = ${reviewByDate}::date,
        withheld_by = ${withheldBy}
    WHERE id = ${reportId} RETURNING *`);
  return result.rows[0];
}
export async function listWhistleblowerReportsExtended(tenantId: string) {
  // Joins org info and returns full withholding/notice state
  const result = await db.execute(sql`
    SELECT wr.*, o.name AS org_name
    FROM whistleblower_reports wr
    LEFT JOIN data_controllers o ON o.id = wr.org_id
    WHERE wr.tenant_id = ${tenantId}
    ORDER BY wr.filed_at DESC`);
  return result.rows;
}

// ─── GAP 5: Public DSRR — create without auth (identity token approach) ───────
export async function createPublicDsrRequest(data: any) {
  // No tenantId — routes to the controller named by org_id or name match
  // DSR SLA deadline is driven by regulation_configs (s.32 / s.14) — not hardcoded
  const slaRows = await db.execute(sql`
    SELECT config_value FROM regulation_configs WHERE config_key = 'dsrr_sla_days' LIMIT 1`);
  const slaDays = slaRows.rows.length > 0 ? Number((slaRows.rows[0] as any).config_value) : 30;

  const tenantId = resolvePublicDsrTenantId(data);
  if (!tenantId) {
    throw Object.assign(new Error("Missing tenantId for public DSR request"), { status: 400 });
  }

  const targetControllerId = resolvePublicDsrTargetControllerId(data);

  const result = await db.execute(sql`
    INSERT INTO dsr_requests (
      subject_name, subject_email, request_type, details,
      identity_verification_method, is_minor, filed_via_public_portal,
      tenant_id, target_controller_id, status, deadline)
    VALUES (
      ${data.subjectName}, ${data.subjectEmail}, ${data.requestType},
      ${data.details || null}, ${data.identityVerificationMethod || 'EMAIL_CONFIRM'},
      ${!!data.isMinor}, true,
      ${tenantId}, ${targetControllerId}, 'RECEIVED',
      NOW() + (${slaDays} || ' days')::interval)
    RETURNING *`);
  return result.rows[0];
}

// ─── GAP 6: Exemption Eligibility Calculator (s.20(4)) ────────────────────────
export async function listExemptionDecisions(tenantId: string) {
  const result = await db.execute(sql`
    SELECT * FROM exemption_decisions WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC`);
  return result.rows;
}
export async function createExemptionDecision(data: any, tenantId: string, decidedBy: string) {
  // Checks the two statutory criteria: (a) DPO appointed + notified, (b) low risk
  const dpoCheck = await db.execute(sql`
    SELECT id FROM dpo_appointments
    WHERE org_id = ${data.orgId} AND status = 'NOTIFIED' LIMIT 1`);
  const hasDpo = dpoCheck.rows.length > 0;
  const isLowRisk = (data.riskScore || 0) < 40;
  const eligible = hasDpo && isLowRisk;

  const result = await db.execute(sql`
    INSERT INTO exemption_decisions (
      tenant_id, org_id, processing_activity_id,
      has_notified_dpo, risk_score, is_eligible,
      authority_decision, conditions, decided_by)
    VALUES (
      ${tenantId}, ${data.orgId}, ${data.processingActivityId || null},
      ${hasDpo}, ${data.riskScore || 0}, ${eligible},
      ${eligible ? 'EXEMPT' : 'NOT_EXEMPT'}, ${data.conditions || null}, ${decidedBy})
    RETURNING *`);
  return { ...result.rows[0], hasDpo, isLowRisk, eligible };
}

