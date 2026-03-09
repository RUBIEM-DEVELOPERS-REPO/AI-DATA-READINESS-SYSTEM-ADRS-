import type { Express } from "express";
import { storage } from "./storage";
import {
  insertBatchSchema, insertEvidenceSchema, insertExtractionRunSchema,
  insertValidationTaskSchema, insertCdmEntitySchema, insertDatasetSchema
} from "@shared/schema";
import { createHash, randomUUID } from "crypto";
import { normalizeExtractedFields, dedupAttributes, runQualityGates, computeTrustScore, type DedupResult } from "./services/normalization";
import { buildArtifactContents, buildArtifactUris, checkPublishTrustThreshold, generateMlCsv, generateBundleZip } from "./services/publishing";
import { inferParties, inferDocument } from "./services/party-inference";
import { ADRS_CONFIG } from "./config";

function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${prefix}-${year}-${rand}`;
}

function generateHash(input: string): string {
  return "sha256:" + createHash("sha256").update(input + Date.now()).digest("hex");
}

function stripText<T extends { rawText?: string | null }>(run: T): T {
  const { rawText, ...rest } = run as any;
  return rest as T;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function seedData() {
  const existing = await storage.getEvidenceFiles();
  if (existing.length > 0) return;

  const batch1 = await storage.createBatch({ batchCode: "BATCH-2026-0001", sourceLocation: "Ministry of Finance Archive — Warehouse A", status: "COMPLETED", expectedDocuments: 120, scannedDocuments: 118, createdBy: "operator_001", notes: "Q4 2025 financial documents digitization run" });
  const batch2 = await storage.createBatch({ batchCode: "BATCH-2026-0002", sourceLocation: "Department of Lands — Records Room B", status: "IN_PROGRESS", expectedDocuments: 85, scannedDocuments: 62, createdBy: "operator_002", notes: "Land registry documents 2015–2023" });

  const seedEvidence = [
    { evidenceCode: "EVID-001", batchId: batch1.id, fileName: "invoice_ministry_2025_q4_001.pdf", fileFormat: "pdf", fileSizeBytes: 2457600, fileHash: generateHash("inv001"), sourceType: "SCAN" as const, sourceReference: `${batch1.batchCode}/FOLDER-001`, status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/inv001/original.pdf", pageCount: 4, uploadedBy: "operator_001", tags: ["finance", "invoice", "2025"] },
    { evidenceCode: "EVID-002", batchId: batch1.id, fileName: "procurement_contract_2025_003.pdf", fileFormat: "pdf", fileSizeBytes: 5120000, fileHash: generateHash("con003"), sourceType: "SCAN" as const, sourceReference: `${batch1.batchCode}/FOLDER-002`, status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/con003/original.pdf", pageCount: 12, uploadedBy: "operator_001", tags: ["procurement", "contract"] },
    { evidenceCode: "EVID-003", batchId: batch2.id, fileName: "land_title_deed_KE-2019-04821.tiff", fileFormat: "tiff", fileSizeBytes: 8388608, fileHash: generateHash("deed04821"), sourceType: "SCAN" as const, sourceReference: `${batch2.batchCode}/FOLDER-001`, status: "PROCESSING" as const, storedUri: "s3://evidence/tenant-001/2026/03/deed04821/original.tiff", pageCount: 2, uploadedBy: "operator_002", tags: ["land", "deed", "property"] },
    { evidenceCode: "EVID-004", fileName: "annual_report_2024_ai_institute.docx", fileFormat: "docx", fileSizeBytes: 3670016, fileHash: generateHash("report2024"), sourceType: "SHAREPOINT" as const, sourceReference: "https://sharepoint/AI-Institute/Reports/2024", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/report2024/original.docx", pageCount: 28, uploadedBy: "system_connector", tags: ["report", "annual", "ai-institute"] },
    { evidenceCode: "EVID-005", fileName: "vendor_invoice_abc_holdings_march.pdf", fileFormat: "pdf", fileSizeBytes: 1024000, fileHash: generateHash("vendor005"), sourceType: "EMAIL" as const, sourceReference: "inbox@ministry.go.ke → accounts@internal.go.ke", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/03/vendor005/original.pdf", pageCount: 2, uploadedBy: "email_connector", tags: ["vendor", "invoice", "abc-holdings"] },
    { evidenceCode: "EVID-006", fileName: "stakeholder_interview_2025_q4_dr_osei.mp3", fileFormat: "mp3", fileSizeBytes: 54525952, fileHash: generateHash("interview006"), sourceType: "RECORDING" as const, sourceReference: "Field Interview — Ministry of Finance, Nov 2025", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/01/interview006/original.mp3", pageCount: 1, uploadedBy: "field_recorder_001", tags: ["interview", "stakeholder", "audio", "ministry"], mediaType: "AUDIO" as const, durationSeconds: 2748 },
    { evidenceCode: "EVID-007", fileName: "board_meeting_2026_q1_ai_institute.mp4", fileFormat: "mp4", fileSizeBytes: 1879048192, fileHash: generateHash("meeting007"), sourceType: "RECORDING" as const, sourceReference: "AI Institute Africa — Board Meeting Q1 2026, 14 Jan 2026", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/01/meeting007/original.mp4", pageCount: 1, uploadedBy: "system_recorder", tags: ["meeting", "board", "video", "ai-institute"], mediaType: "VIDEO" as const, durationSeconds: 5412 },
  ];
  const createdEvidence: any[] = [];
  for (const ev of seedEvidence) createdEvidence.push(await storage.createEvidenceFile(ev));

  const rawExtractions = [
    {
      evidenceId: createdEvidence[0].id, docType: "INVOICE" as const, docTypeConfidence: 0.94, ocrConfidence: 0.91, extractionConfidence: 0.88, consistencyScore: 0.87, docQualityScore: 0.90,
      extractedFields: { invoice_number: "INV-2025-00341", amount: "KES 4,250,000", supplier_name: "TechVault Solutions Ltd", date: "2025-12-15", payment_terms: "Net 30" },
      extractedEntities: [{ entity: "Organization", value: "TechVault Solutions Ltd", confidence: 0.94, evidence_pointer: "PAGE-001:bbox(10,20,200,40)" }, { entity: "Amount", value: "KES 4,250,000", confidence: 0.91, evidence_pointer: "PAGE-001:bbox(300,120,450,140)" }, { entity: "Date", value: "2025-12-15", confidence: 0.98, evidence_pointer: "PAGE-001:bbox(200,60,350,80)" }],
      extractedTables: [{ table_id: "TABLE-001", rows: [["Item", "Qty", "Unit Price", "Total"], ["Enterprise Licenses", "50", "KES 85,000", "KES 4,250,000"]], confidence: 0.89 }],
      rawText: "INVOICE\nInvoice No: INV-2025-00341\nDate: December 15, 2025\n\nBill To:\nMinistry of Finance\nNairobi, Kenya\n\nFrom:\nTechVault Solutions Ltd\nMombasa Road, Nairobi\n\nItems:\nEnterprise Licenses (50) @ KES 85,000 = KES 4,250,000\n\nTotal Due: KES 4,250,000\nPayment Terms: Net 30",
      processingTimeMs: 2340,
    },
    {
      evidenceId: createdEvidence[1].id, docType: "CONTRACT" as const, docTypeConfidence: 0.97, ocrConfidence: 0.89, extractionConfidence: 0.85, consistencyScore: 0.82, docQualityScore: 0.86,
      extractedFields: { contract_number: "PROC-2025-0087", parties: "Ministry of Finance & BuildRight Construction", value: "KES 12,800,000", start_date: "2026-01-01", end_date: "2026-12-31" },
      extractedEntities: [{ entity: "Organization", value: "Ministry of Finance", confidence: 0.97 }, { entity: "Organization", value: "BuildRight Construction Ltd", confidence: 0.93 }, { entity: "Amount", value: "KES 12,800,000", confidence: 0.88 }],
      extractedTables: [],
      rawText: "PROCUREMENT CONTRACT\nRef: PROC-2025-0087\n\nThis agreement entered between Ministry of Finance (hereinafter 'Client') and BuildRight Construction Ltd (hereinafter 'Contractor').\n\nContract Value: KES 12,800,000\nCommencement: 1 January 2026\nCompletion: 31 December 2026",
      processingTimeMs: 4120,
    },
    {
      evidenceId: createdEvidence[3].id, docType: "REPORT" as const, docTypeConfidence: 0.92, ocrConfidence: 0.95, extractionConfidence: 0.91, consistencyScore: 0.93, docQualityScore: 0.94,
      extractedFields: { report_title: "Annual Report 2024", organization: "The AI Institute Africa", year: "2024", pages: "28" },
      extractedEntities: [{ entity: "Organization", value: "The AI Institute Africa", confidence: 0.99 }, { entity: "Date", value: "2024", confidence: 0.98 }],
      extractedTables: [{ table_id: "TABLE-001", rows: [["Metric", "2024", "2023"], ["Datasets Published", "47", "29"], ["Partners", "18", "12"]], confidence: 0.92 }],
      rawText: "THE AI INSTITUTE AFRICA\nANNUAL REPORT 2024\n\nExecutive Summary:\nThe AI Institute Africa continues to lead data readiness initiatives across the continent.\n\nKey Metrics:\n- Datasets Published: 47 (up from 29 in 2023)\n- Partner Organizations: 18 (up from 12)\n- Countries Reached: 8\n\nOur mission is to transform raw evidence into AI-ready datasets that enable decision-making across African governments and institutions.",
      processingTimeMs: 6890,
    },
    {
      evidenceId: createdEvidence[4].id, docType: "INVOICE" as const, docTypeConfidence: 0.96, ocrConfidence: 0.82, extractionConfidence: 0.78, consistencyScore: 0.75, docQualityScore: 0.83,
      extractedFields: { invoice_number: "ABC-2026-0312", vendor: "ABC Holdings Ltd", amount: "KES 780,000", date: "2026-03-01" },
      extractedEntities: [{ entity: "Organization", value: "ABC Holdings Ltd", confidence: 0.89 }, { entity: "Amount", value: "KES 780,000", confidence: 0.82 }],
      extractedTables: [],
      rawText: "ABC HOLDINGS LTD\nInvoice #: ABC-2026-0312\nDate: 01/03/2026\n\nOffice Supplies & Equipment\nTotal: KES 780,000",
      processingTimeMs: 1980,
    },
    {
      evidenceId: createdEvidence[5].id, docType: "INTERVIEW" as const, docTypeConfidence: 0.91, ocrConfidence: 0.93, extractionConfidence: 0.88, consistencyScore: 0.90, docQualityScore: 0.87,
      extractedFields: {
        language: "English",
        speaker_count: 2,
        interview_date: "2025-11-14",
        interviewer: "Dr. Sarah Kimani",
        interviewee: "Dr. Amara Osei",
        organization: "Ministry of Finance",
        duration_minutes: 45,
        topic: "AI Data Readiness Strategy 2026",
        transcript_segments: [
          { start: 0, end: 12, speaker: "Dr. Sarah Kimani", text: "Good morning Dr. Osei. Thank you for joining us today to discuss the Ministry's data readiness strategy.", confidence: 0.96 },
          { start: 13, end: 42, speaker: "Dr. Amara Osei", text: "Thank you Sarah. It's a pleasure. The Ministry has made significant strides in digitizing our financial records over the past two years.", confidence: 0.94 },
          { start: 43, end: 78, speaker: "Dr. Sarah Kimani", text: "Can you walk us through the key milestones and what impact they have had on transparency?", confidence: 0.97 },
          { start: 79, end: 145, speaker: "Dr. Amara Osei", text: "Certainly. By Q4 2025 we had digitized over 118,000 documents. The AI Institute Africa has been instrumental in converting these into structured datasets, which has drastically reduced procurement fraud risk.", confidence: 0.92 },
          { start: 146, end: 192, speaker: "Dr. Sarah Kimani", text: "That's remarkable. What are the plans for audio and video evidence going forward?", confidence: 0.95 },
          { start: 193, end: 261, speaker: "Dr. Amara Osei", text: "We intend to record all budget hearings and procurement committee meetings and feed those into the ADRS pipeline. This will create a fully auditable evidence chain.", confidence: 0.91 },
        ],
      },
      extractedEntities: [
        { entity: "Speaker", value: "Dr. Sarah Kimani — Interviewer, AI Institute Africa", confidence: 0.96, evidence_pointer: "00:00–01:30" },
        { entity: "Speaker", value: "Dr. Amara Osei — Director General, Ministry of Finance", confidence: 0.94, evidence_pointer: "00:13–45:00" },
        { entity: "Organization", value: "Ministry of Finance", confidence: 0.97, evidence_pointer: "00:13" },
        { entity: "Organization", value: "The AI Institute Africa", confidence: 0.95, evidence_pointer: "01:25" },
        { entity: "Date", value: "2025-11-14", confidence: 0.98, evidence_pointer: "00:00" },
      ],
      extractedTables: [],
      rawText: "[00:00] Dr. Sarah Kimani: Good morning Dr. Osei. Thank you for joining us today to discuss the Ministry's data readiness strategy.\n[00:13] Dr. Amara Osei: Thank you Sarah. The Ministry has made significant strides in digitizing our financial records.\n[00:43] Dr. Sarah Kimani: Can you walk us through the key milestones?\n[01:19] Dr. Amara Osei: By Q4 2025 we had digitized over 118,000 documents. The AI Institute Africa has been instrumental.\n[02:26] Dr. Sarah Kimani: What are the plans for audio and video evidence going forward?\n[03:13] Dr. Amara Osei: We intend to record all budget hearings and feed those into the ADRS pipeline.",
      processingTimeMs: 18430,
    },
    {
      evidenceId: createdEvidence[6].id, docType: "MEETING_RECORDING" as const, docTypeConfidence: 0.95, ocrConfidence: 0.89, extractionConfidence: 0.84, consistencyScore: 0.86, docQualityScore: 0.88,
      extractedFields: {
        language: "English",
        speaker_count: 4,
        meeting_date: "2026-01-14",
        meeting_title: "AI Institute Africa — Board Meeting Q1 2026",
        chairperson: "Prof. Ngozi Adeyemi",
        organization: "The AI Institute Africa",
        duration_minutes: 90,
        agenda_items: "Phase 3 Roadmap, Budget Approval, Partnership Updates",
        transcript_segments: [
          { start: 0, end: 38, speaker: "Prof. Ngozi Adeyemi", text: "I call this board meeting to order. We have three key agenda items today: Phase 3 roadmap approval, the Q1 2026 budget, and partnership updates from the East Africa chapter.", confidence: 0.92 },
          { start: 39, end: 95, speaker: "Dr. Wills Mwangi", text: "Thank you Chair. The Phase 3 roadmap focuses on extending the ADRS pipeline to support audio and video evidence, which will be a game-changer for field interviews and parliamentary hearings.", confidence: 0.91 },
          { start: 96, end: 154, speaker: "Ms. Amina Hassan", text: "I want to flag a budget concern. The infrastructure for real-time A/V transcription will require approximately KES 8.2 million in cloud compute budget.", confidence: 0.94 },
          { start: 155, end: 218, speaker: "Prof. Ngozi Adeyemi", text: "Duly noted. We will table a supplementary budget request. Dr. Kofi, can you share the partner update?", confidence: 0.89 },
          { start: 219, end: 290, speaker: "Dr. Kofi Asante", text: "Certainly. We have signed MOUs with three new government ministries in Ghana and Rwanda. They're particularly excited about the audio evidence pipeline for public participation records.", confidence: 0.93 },
          { start: 291, end: 345, speaker: "Prof. Ngozi Adeyemi", text: "Excellent. The board approves the Phase 3 roadmap subject to the budget amendment. Meeting adjourned.", confidence: 0.95 },
        ],
      },
      extractedEntities: [
        { entity: "Speaker", value: "Prof. Ngozi Adeyemi — Board Chairperson, AI Institute Africa", confidence: 0.92, evidence_pointer: "00:00–05:45" },
        { entity: "Speaker", value: "Dr. Wills Mwangi — Programme Lead, AI Institute Africa", confidence: 0.91, evidence_pointer: "00:39–02:34" },
        { entity: "Speaker", value: "Ms. Amina Hassan — CFO, AI Institute Africa", confidence: 0.94, evidence_pointer: "01:36–02:34" },
        { entity: "Speaker", value: "Dr. Kofi Asante — Partnerships Director", confidence: 0.93, evidence_pointer: "03:39–04:50" },
        { entity: "Organization", value: "The AI Institute Africa", confidence: 0.98, evidence_pointer: "00:00" },
        { entity: "Amount", value: "KES 8,200,000", confidence: 0.91, evidence_pointer: "01:36" },
        { entity: "Date", value: "2026-01-14", confidence: 0.99, evidence_pointer: "00:00" },
      ],
      extractedTables: [],
      rawText: "[00:00] Prof. Ngozi Adeyemi: I call this board meeting to order. Agenda: Phase 3 roadmap, Q1 2026 budget, partnership updates.\n[00:39] Dr. Wills Mwangi: The Phase 3 roadmap focuses on audio and video evidence support for the ADRS pipeline.\n[01:36] Ms. Amina Hassan: A/V transcription infrastructure will require approximately KES 8.2 million.\n[02:35] Prof. Ngozi Adeyemi: We will table a supplementary budget request. Dr. Kofi, partner update please.\n[03:39] Dr. Kofi Asante: MOUs signed with three new ministries in Ghana and Rwanda.\n[04:51] Prof. Ngozi Adeyemi: Board approves Phase 3 roadmap subject to budget amendment. Adjourned.",
      processingTimeMs: 42180,
    },
  ];

  const createdExtractions: any[] = [];
  for (const ext of rawExtractions) {
    const rawAttrs   = normalizeExtractedFields(ext.extractedFields, ext.extractedEntities);
    const { deduped: dedupedAttrs, conflictKeys } = dedupAttributes(rawAttrs);
    const qgResult   = runQualityGates(ext.docType, dedupedAttrs, ext.ocrConfidence);
    const trustScore = computeTrustScore(ext.ocrConfidence, ext.extractionConfidence, qgResult.completenessScore, ext.consistencyScore, ext.docQualityScore);

    // Store extraction run (without rawText in the main record)
    const run = await storage.createExtractionRun({
      evidenceId: ext.evidenceId, docType: ext.docType, docTypeConfidence: ext.docTypeConfidence,
      ocrConfidence: ext.ocrConfidence, extractionConfidence: ext.extractionConfidence,
      completenessScore: qgResult.completenessScore, consistencyScore: ext.consistencyScore, docQualityScore: ext.docQualityScore,
      trustScore, trustScoreBreakdown: { ocr: ext.ocrConfidence, extraction: ext.extractionConfidence, completeness: qgResult.completenessScore, consistency: ext.consistencyScore, doc_quality: ext.docQualityScore },
      extractedFields: ext.extractedFields, extractedEntities: ext.extractedEntities, extractedTables: ext.extractedTables,
      extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
      rawText: ext.rawText, processingTimeMs: ext.processingTimeMs,
    });

    // Store text in deduplicated extraction_texts table + link FK
    const etxt = await storage.createExtractionText({ evidenceId: ext.evidenceId, extractionRunId: run.id, text: ext.rawText ?? "", charCount: (ext.rawText ?? "").length });
    await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
    createdExtractions.push(run);

    // Field-level audit events
    for (const attr of dedupedAttrs) {
      const action = attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD";
      await storage.createAuditLog({ action, resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", value_normalized: attr.value_normalized, confidence: attr.confidence_score }, tenantId: "TENANT-001" });
    }

    // Auto-create ValidationTask for conflicts
    if (ADRS_CONFIG.features.auto_validation_task_on_conflict && conflictKeys.length > 0) {
      await storage.createValidationTask({
        taskCode: generateCode("VAL"),
        extractionRunId: run.id, evidenceId: ext.evidenceId,
        status: "PENDING_VALIDATION",
        fieldsToValidate: conflictKeys.map(k => k.split(":").slice(1).join(":")),
        trustScore, approvalStage: 1, maxApprovalStages: 1,
        approvalPolicyRule: "CONFLICT",
        approvalPolicyReason: `${conflictKeys.length} field(s) have conflicting extracted values: ${conflictKeys.join(", ")}. Manual deduplication required.`,
        weakFields: conflictKeys,
      });
    }

    // Auto-create ValidationTask for low trust
    if (ADRS_CONFIG.features.auto_validation_task_on_low_trust && trustScore < ADRS_CONFIG.thresholds.auto_validation_task) {
      await storage.createValidationTask({
        taskCode: generateCode("VAL"),
        extractionRunId: run.id, evidenceId: ext.evidenceId,
        status: "PENDING_VALIDATION",
        fieldsToValidate: dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key),
        trustScore, approvalStage: 1, maxApprovalStages: 1,
        approvalPolicyRule: "LOW_TRUST",
        approvalPolicyReason: `Trust score ${(trustScore * 100).toFixed(0)}% is below auto-validation threshold of ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}%. Full field review required.`,
      });
    }
  }

  // Seed CDM entities with identifiers + relationships
  const cdmData = [
    { entityCode: "PERSON-001", entityType: "PERSON" as const, displayName: "Dr. Amara Osei", canonicalFields: { name: "Dr. Amara Osei", national_id: "KE4521987", role: "Director General", phone: "+254701234567", address: "Treasury Building, Nairobi" }, identifiers: [{ id_type_label: "Phone", id_value: "+254701234567", is_verified: false }, { id_type_label: "National ID", id_value: "KE4521987", is_verified: true }], relationships: [{ target_entity_id: "ORG-001", relationship_type: "TRANSACTED_WITH", confidence: 0.94 }], sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.94 },
    { entityCode: "ORG-001", entityType: "ORGANIZATION" as const, displayName: "TechVault Solutions Ltd", canonicalFields: { org_name: "TechVault Solutions Ltd", registration_number: "CPR/2018/041234", sector: "Technology", address: "Mombasa Road, Nairobi" }, identifiers: [{ id_type_label: "Registration", id_value: "CPR/2018/041234", is_verified: true }], relationships: [{ target_entity_id: "TRX-001", relationship_type: "ISSUED", confidence: 0.94 }], sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.94 },
    { entityCode: "ORG-002", entityType: "ORGANIZATION" as const, displayName: "BuildRight Construction Ltd", canonicalFields: { org_name: "BuildRight Construction Ltd", registration_number: "CPR/2019/078901", sector: "Construction" }, identifiers: [{ id_type_label: "Registration", id_value: "CPR/2019/078901", is_verified: false }], relationships: [], sourceEvidenceIds: [createdEvidence[1].id], isGoldenRecord: false, confidenceScore: 0.88 },
    { entityCode: "ORG-003", entityType: "ORGANIZATION" as const, displayName: "The AI Institute Africa", canonicalFields: { org_name: "The AI Institute Africa", registration_number: "NGO/2020/041", sector: "Research & Development", website: "aiinstituteafrica.org" }, identifiers: [{ id_type_label: "Registration", id_value: "NGO/2020/041", is_verified: true }], relationships: [], sourceEvidenceIds: [createdEvidence[3].id], isGoldenRecord: true, confidenceScore: 0.99 },
    { entityCode: "TRX-001", entityType: "TRANSACTION" as const, displayName: "INV-2025-00341 — TechVault", canonicalFields: { transaction_id: "TRX-2025-00341", type: "INVOICE", amount: "KES 4,250,000", amount_numeric: 4250000, currency: "KES", date: "2025-12-15" }, identifiers: [], relationships: [{ target_entity_id: "ORG-001", relationship_type: "INVOLVES", confidence: 0.94 }], sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.91 },
    { entityCode: "DOC-001", entityType: "DOCUMENT" as const, displayName: "Annual Report 2024 — AI Institute Africa", canonicalFields: { title: "Annual Report 2024", doc_type: "ANNUAL_REPORT", issuer: "The AI Institute Africa", year: "2024", pages: "28" }, identifiers: [], relationships: [{ target_entity_id: "ORG-003", relationship_type: "ISSUED_BY", confidence: 0.99 }], sourceEvidenceIds: [createdEvidence[3].id], isGoldenRecord: true, confidenceScore: 0.97 },
  ];
  const createdEntities: any[] = [];
  for (const e of cdmData) createdEntities.push(await storage.createCdmEntity(e));

  // Published dataset
  const ds1Partial = {
    datasetCode: "DS-2026-001", name: "Ministry Finance Records — Q4 2025",
    description: "Validated financial documents from Ministry of Finance Q4 2025 digitization.", version: "2.1.0", status: "PUBLISHED" as const, recordCount: 847,
    entityTypes: ["TRANSACTION", "ORGANIZATION", "PERSON"], formats: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"],
    qualityScore: 0.91, lineageInfo: { source_batches: ["BATCH-2026-0001"], pipeline_version: "1.0" }, publishedBy: "Wills", publishedAt: new Date("2026-03-01"),
  };
  const evidenceMap = new Map(createdEvidence.map((e: any) => [e.id, e]));
  const artifacts   = buildArtifactContents(ds1Partial, createdEntities, createdExtractions, evidenceMap);
  const artifactUris = buildArtifactUris("DS-2026-001", "2.1.0");
  await storage.createPublishedDataset({ ...ds1Partial, datasetCard: artifacts.dataset_card, artifactUris, artifactContents: artifacts, qualityGates: { passed: true, checks: [{ rule: "TRUST_SCORE", passed: true, detail: "Avg trust 91%" }, { rule: "APPROVAL_RATE", passed: true, detail: "75% approved" }] }, tenantId: "TENANT-001" });

  // Draft dataset (low trust for blocking demo)
  await storage.createPublishedDataset({
    datasetCode: "DS-2026-003", name: "Land Title Deeds — Preliminary Extract",
    description: "DRAFT: Low-quality scan from Lands archive. Trust score below publishing threshold — demonstrates publish blocking.",
    version: "0.1.0", status: "DRAFT" as const, recordCount: 12,
    entityTypes: ["DOCUMENT", "PERSON"], formats: ["KG_ENTITIES", "RAG_CHUNKS"],
    qualityScore: 0.54, lineageInfo: { source_batches: ["BATCH-2026-0002"], pipeline_version: "1.0" }, tenantId: "TENANT-001",
  });

  await storage.createPublishedDataset({ datasetCode: "DS-2026-002", name: "AI Institute Knowledge Graph 2024", description: "Entity relationships extracted from AI Institute Africa annual reports.", version: "1.0.0", status: "DRAFT" as const, recordCount: 312, entityTypes: ["ORGANIZATION", "PERSON", "DOCUMENT"], formats: ["KG_ENTITIES", "KG_EDGES", "RAG_CHUNKS"], qualityScore: 0.87, lineageInfo: { source_evidence: ["EVID-004"], pipeline_version: "1.0" }, tenantId: "TENANT-001" });

  for (const entry of [
    { action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch1.id, userId: "operator_001", details: { batch_code: "BATCH-2026-0001" } },
    { action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: createdEvidence[0].id, userId: "operator_001", details: { file: "invoice_ministry_2025_q4_001.pdf" } },
    { action: "TEXT_DEDUPLICATED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { chars: createdExtractions[0].rawText?.length ?? 0 } },
    { action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: "PERSON-001", userId: "system", details: { entity_type: "PERSON", source_run: createdExtractions[0].id } },
    { action: "NORMALIZATION_COMPLETED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { attrs_pending: 1, attrs_normalized: 8 } },
    { action: "QUALITY_GATE_PASSED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { checks_passed: 4 } },
    { action: "VALIDATION_APPROVED", resourceType: "VALIDATION", resourceId: "VAL-2026-001", userId: "validator_007", details: { policy_rule: "MANUAL_REVIEW" } },
    { action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: "DS-2026-001", userId: "system", details: { artifacts: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "RAG_CHUNKS"] } },
    { action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: "DS-2026-001", userId: "Wills", details: { name: "Ministry Finance Records Q4 2025", version: "2.1.0", records: 847 } },
    { action: "PUBLISH_BLOCKED", resourceType: "DATASET", resourceId: "DS-2026-003", userId: "system", details: { reason: "Trust score 54% below threshold 60%", dataset: "DS-2026-003" } },
  ]) { await storage.createAuditLog({ ...entry, tenantId: "TENANT-001" }); }
}

async function seedAVData() {
  const existing = await storage.getEvidenceFiles();
  if (existing.some(e => e.evidenceCode === "EVID-006")) return;

  const ev6 = await storage.createEvidenceFile({ evidenceCode: "EVID-006", fileName: "stakeholder_interview_2025_q4_dr_osei.mp3", fileFormat: "mp3", fileSizeBytes: 54525952, fileHash: generateHash("interview006"), sourceType: "RECORDING" as const, sourceReference: "Field Interview — Ministry of Finance, Nov 2025", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/01/interview006/original.mp3", pageCount: 1, uploadedBy: "field_recorder_001", tags: ["interview", "stakeholder", "audio", "ministry"], mediaType: "AUDIO" as const, durationSeconds: 2748 });
  const ev7 = await storage.createEvidenceFile({ evidenceCode: "EVID-007", fileName: "board_meeting_2026_q1_ai_institute.mp4", fileFormat: "mp4", fileSizeBytes: 1879048192, fileHash: generateHash("meeting007"), sourceType: "RECORDING" as const, sourceReference: "AI Institute Africa — Board Meeting Q1 2026, 14 Jan 2026", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/01/meeting007/original.mp4", pageCount: 1, uploadedBy: "system_recorder", tags: ["meeting", "board", "video", "ai-institute"], mediaType: "VIDEO" as const, durationSeconds: 5412 });

  const avExtractions = [
    {
      evidenceId: ev6.id, docType: "INTERVIEW" as const, docTypeConfidence: 0.91, ocrConfidence: 0.93, extractionConfidence: 0.88, consistencyScore: 0.90, docQualityScore: 0.87,
      extractedFields: { language: "English", speaker_count: 2, interview_date: "2025-11-14", interviewer: "Dr. Sarah Kimani", interviewee: "Dr. Amara Osei", organization: "Ministry of Finance", duration_minutes: 45, topic: "AI Data Readiness Strategy 2026", transcript_segments: [{ start: 0, end: 12, speaker: "Dr. Sarah Kimani", text: "Good morning Dr. Osei. Thank you for joining us today to discuss the Ministry's data readiness strategy.", confidence: 0.96 }, { start: 13, end: 42, speaker: "Dr. Amara Osei", text: "Thank you Sarah. The Ministry has made significant strides in digitizing our financial records over the past two years.", confidence: 0.94 }, { start: 43, end: 78, speaker: "Dr. Sarah Kimani", text: "Can you walk us through the key milestones and what impact they have had on transparency?", confidence: 0.97 }, { start: 79, end: 145, speaker: "Dr. Amara Osei", text: "Certainly. By Q4 2025 we had digitized over 118,000 documents. The AI Institute Africa has been instrumental, drastically reducing procurement fraud risk.", confidence: 0.92 }, { start: 146, end: 192, speaker: "Dr. Sarah Kimani", text: "That's remarkable. What are the plans for audio and video evidence going forward?", confidence: 0.95 }, { start: 193, end: 261, speaker: "Dr. Amara Osei", text: "We intend to record all budget hearings and procurement committee meetings and feed those into the ADRS pipeline. This will create a fully auditable evidence chain.", confidence: 0.91 }] },
      extractedEntities: [{ entity: "Speaker", value: "Dr. Sarah Kimani — Interviewer, AI Institute Africa", confidence: 0.96, evidence_pointer: "00:00–01:30" }, { entity: "Speaker", value: "Dr. Amara Osei — Director General, Ministry of Finance", confidence: 0.94, evidence_pointer: "00:13–45:00" }, { entity: "Organization", value: "Ministry of Finance", confidence: 0.97, evidence_pointer: "00:13" }, { entity: "Organization", value: "The AI Institute Africa", confidence: 0.95, evidence_pointer: "01:25" }, { entity: "Date", value: "2025-11-14", confidence: 0.98, evidence_pointer: "00:00" }],
      extractedTables: [],
      rawText: "[00:00] Dr. Sarah Kimani: Good morning Dr. Osei. Thank you for joining us to discuss the Ministry's data readiness strategy.\n[00:13] Dr. Amara Osei: The Ministry has made significant strides in digitizing our financial records.\n[00:43] Dr. Sarah Kimani: Can you walk us through the key milestones?\n[01:19] Dr. Amara Osei: By Q4 2025 we had digitized over 118,000 documents. The AI Institute Africa has been instrumental.\n[02:26] Dr. Sarah Kimani: What are the plans for audio and video evidence going forward?\n[03:13] Dr. Amara Osei: We intend to record all budget hearings and feed those into the ADRS pipeline.",
      processingTimeMs: 18430,
    },
    {
      evidenceId: ev7.id, docType: "MEETING_RECORDING" as const, docTypeConfidence: 0.95, ocrConfidence: 0.89, extractionConfidence: 0.84, consistencyScore: 0.86, docQualityScore: 0.88,
      extractedFields: { language: "English", speaker_count: 4, meeting_date: "2026-01-14", meeting_title: "AI Institute Africa — Board Meeting Q1 2026", chairperson: "Prof. Ngozi Adeyemi", organization: "The AI Institute Africa", duration_minutes: 90, agenda_items: "Phase 3 Roadmap, Budget Approval, Partnership Updates", transcript_segments: [{ start: 0, end: 38, speaker: "Prof. Ngozi Adeyemi", text: "I call this board meeting to order. Agenda: Phase 3 roadmap, Q1 2026 budget, partnership updates.", confidence: 0.92 }, { start: 39, end: 95, speaker: "Dr. Wills Mwangi", text: "The Phase 3 roadmap focuses on extending ADRS to support audio and video evidence — a game-changer for field interviews and parliamentary hearings.", confidence: 0.91 }, { start: 96, end: 154, speaker: "Ms. Amina Hassan", text: "A/V transcription infrastructure will require approximately KES 8.2 million in cloud compute budget.", confidence: 0.94 }, { start: 155, end: 218, speaker: "Prof. Ngozi Adeyemi", text: "Duly noted. We will table a supplementary budget request. Dr. Kofi, partner update?", confidence: 0.89 }, { start: 219, end: 290, speaker: "Dr. Kofi Asante", text: "MOUs signed with three new government ministries in Ghana and Rwanda. They're excited about the audio evidence pipeline for public participation records.", confidence: 0.93 }, { start: 291, end: 345, speaker: "Prof. Ngozi Adeyemi", text: "Board approves Phase 3 roadmap subject to budget amendment. Meeting adjourned.", confidence: 0.95 }] },
      extractedEntities: [{ entity: "Speaker", value: "Prof. Ngozi Adeyemi — Board Chairperson, AI Institute Africa", confidence: 0.92, evidence_pointer: "00:00–05:45" }, { entity: "Speaker", value: "Dr. Wills Mwangi — Programme Lead, AI Institute Africa", confidence: 0.91, evidence_pointer: "00:39–02:34" }, { entity: "Speaker", value: "Ms. Amina Hassan — CFO, AI Institute Africa", confidence: 0.94, evidence_pointer: "01:36–02:34" }, { entity: "Speaker", value: "Dr. Kofi Asante — Partnerships Director", confidence: 0.93, evidence_pointer: "03:39–04:50" }, { entity: "Organization", value: "The AI Institute Africa", confidence: 0.98, evidence_pointer: "00:00" }, { entity: "Amount", value: "KES 8,200,000", confidence: 0.91, evidence_pointer: "01:36" }, { entity: "Date", value: "2026-01-14", confidence: 0.99, evidence_pointer: "00:00" }],
      extractedTables: [],
      rawText: "[00:00] Prof. Ngozi Adeyemi: I call this board meeting to order. Agenda: Phase 3 roadmap, Q1 2026 budget, partnership updates.\n[00:39] Dr. Wills Mwangi: The Phase 3 roadmap focuses on audio and video evidence support for the ADRS pipeline.\n[01:36] Ms. Amina Hassan: A/V transcription infrastructure will require approximately KES 8.2 million.\n[02:35] Prof. Ngozi Adeyemi: We will table a supplementary budget request. Dr. Kofi, partner update please.\n[03:39] Dr. Kofi Asante: MOUs signed with three new ministries in Ghana and Rwanda.\n[04:51] Prof. Ngozi Adeyemi: Board approves Phase 3 roadmap. Adjourned.",
      processingTimeMs: 42180,
    },
  ];

  for (const ext of avExtractions) {
    const rawAttrs = normalizeExtractedFields(ext.extractedFields, ext.extractedEntities);
    const { deduped: dedupedAttrs } = dedupAttributes(rawAttrs);
    const qgResult = runQualityGates(ext.docType, dedupedAttrs, ext.ocrConfidence);
    const trustScore = computeTrustScore(ext.ocrConfidence, ext.extractionConfidence, qgResult.completenessScore, ext.consistencyScore, ext.docQualityScore);
    await storage.createExtractionRun({
      evidenceId: ext.evidenceId, docType: ext.docType, docTypeConfidence: ext.docTypeConfidence,
      ocrConfidence: ext.ocrConfidence, extractionConfidence: ext.extractionConfidence,
      completenessScore: qgResult.completenessScore, consistencyScore: ext.consistencyScore, docQualityScore: ext.docQualityScore,
      trustScore, trustScoreBreakdown: { ocr: ext.ocrConfidence, extraction: ext.extractionConfidence, completeness: qgResult.completenessScore, consistency: ext.consistencyScore, doc_quality: ext.docQualityScore },
      extractedFields: ext.extractedFields, extractedEntities: ext.extractedEntities, extractedTables: ext.extractedTables,
      extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
      rawText: ext.rawText, processingTimeMs: ext.processingTimeMs,
    });
  }
}

export async function registerRoutes(httpServer: any, app: Express): Promise<any> {
  await seedData().catch(console.error);
  await seedAVData().catch(console.error);

  // ─── Config endpoint (read-only feature flags) ─────────────────────────────
  app.get("/api/config", (_req: any, res: any) => {
    res.json({ features: ADRS_CONFIG.features, thresholds: { auto_validation_task: ADRS_CONFIG.thresholds.auto_validation_task, publish_trust_block: ADRS_CONFIG.thresholds.publish_trust_block, party_creation_confidence: ADRS_CONFIG.thresholds.party_creation_confidence }, trust_weights: ADRS_CONFIG.trust_weights });
  });

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", async (_req: any, res: any) => {
    try { res.json(await storage.getDashboardStats()); } catch { res.status(500).json({ error: "Failed" }); }
  });

  // ─── Batches ───────────────────────────────────────────────────────────────
  app.get("/api/batches", async (_req: any, res: any) => res.json(await storage.getBatches()));
  app.post("/api/batches", async (req: any, res: any) => {
    const parse = insertBatchSchema.safeParse({ ...req.body, batchCode: generateCode("BATCH") });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const batch = await storage.createBatch(parse.data);
    await storage.createAuditLog({ action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch.id, userId: batch.createdBy, details: { batch_code: batch.batchCode }, tenantId: "TENANT-001" });
    res.json(batch);
  });
  app.patch("/api/batches/:id", async (req: any, res: any) => {
    const batch = await storage.updateBatch(req.params.id, req.body);
    if (!batch) return res.status(404).json({ error: "Not found" });
    res.json(batch);
  });

  // ─── Evidence ──────────────────────────────────────────────────────────────
  app.get("/api/evidence", async (_req: any, res: any) => res.json(await storage.getEvidenceFiles()));
  app.get("/api/evidence/:id", async (req: any, res: any) => {
    const f = await storage.getEvidenceFile(req.params.id);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });
  app.post("/api/evidence", async (req: any, res: any) => {
    const body = { ...req.body, evidenceCode: generateCode("EVID"), fileHash: generateHash(req.body.fileName ?? "file"), storedUri: `s3://evidence/tenant-001/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${randomUUID()}/original.${req.body.fileFormat ?? "pdf"}`, immutabilityStatus: "LOCKED" };
    const parse = insertEvidenceSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const file = await storage.createEvidenceFile(parse.data);
    await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash }, tenantId: "TENANT-001" });
    res.json(file);
  });
  app.patch("/api/evidence/:id", async (req: any, res: any) => {
    const f = await storage.updateEvidenceFile(req.params.id, req.body);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  // ─── Extractions (include_text=true strips rawText by default) ─────────────
  app.get("/api/extractions", async (req: any, res: any) => {
    const runs = await storage.getExtractionRuns();
    const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
    res.json(includeText ? runs : runs.map(stripText));
  });

  app.get("/api/extractions/:id", async (req: any, res: any) => {
    const run = await storage.getExtractionRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
    res.json(includeText ? run : stripText(run));
  });

  // Dedicated text endpoint
  app.get("/api/extractions/:id/text", async (req: any, res: any) => {
    const run = await storage.getExtractionRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    if (run.extractionTextId) {
      const txt = await storage.getExtractionText(run.extractionTextId);
      if (txt) return res.json({ extraction_text_id: txt.id, evidence_id: txt.evidenceId, text: txt.text, char_count: txt.charCount, page_number: txt.pageNumber });
    }
    // Fallback: rawText on run
    res.json({ extraction_text_id: null, evidence_id: run.evidenceId, text: run.rawText ?? "", char_count: (run.rawText ?? "").length });
  });

  app.post("/api/extractions", async (req: any, res: any) => {
    const { extractedFields = {}, extractedEntities = [], ocrConfidence = 0, docType = "OTHER", rawText = "", ...rest } = req.body;

    // 1. Normalize + dedup
    const rawAttrs = normalizeExtractedFields(extractedFields, extractedEntities);
    const { deduped: dedupedAttrs, conflictKeys } = dedupAttributes(rawAttrs);
    const qgResult  = runQualityGates(docType, dedupedAttrs, ocrConfidence);
    const { extractionConfidence = 0, consistencyScore = 0, docQualityScore = 0 } = rest;
    const trustScore = computeTrustScore(ocrConfidence, extractionConfidence, qgResult.completenessScore, consistencyScore, docQualityScore);

    const parse = insertExtractionRunSchema.safeParse({
      ...rest, extractedFields, extractedEntities, ocrConfidence, docType, rawText,
      trustScore, trustScoreBreakdown: { ocr: ocrConfidence, extraction: extractionConfidence, completeness: qgResult.completenessScore, consistency: consistencyScore, doc_quality: docQualityScore },
      extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
    });
    if (!parse.success) return res.status(400).json({ error: parse.error });

    // 2. Create extraction run
    const run = await storage.createExtractionRun(parse.data);

    // 3. Store text in deduplicated extraction_texts table
    if (rawText) {
      const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
      await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
    }

    // 4. Field-level audit events (APPROVE_FIELD / REVIEW_FIELD)
    for (const attr of dedupedAttrs) {
      await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", value_normalized: attr.value_normalized, confidence: attr.confidence_score }, tenantId: "TENANT-001" });
    }

    // 5. Auto-create ValidationTask for conflicts
    if (ADRS_CONFIG.features.auto_validation_task_on_conflict && conflictKeys.length > 0) {
      await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: conflictKeys.map(k => k.split(":").slice(1).join(":")), trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: "CONFLICT", approvalPolicyReason: `${conflictKeys.length} field(s) have conflicting extracted values requiring manual deduplication: ${conflictKeys.join(", ")}.`, weakFields: conflictKeys });
      await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: "CONFLICT", conflict_keys: conflictKeys }, tenantId: "TENANT-001" });
    }

    // 6. Auto-create ValidationTask for low trust
    if (ADRS_CONFIG.features.auto_validation_task_on_low_trust && trustScore < ADRS_CONFIG.thresholds.auto_validation_task) {
      const pendingFields = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
      await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: pendingFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: "LOW_TRUST", approvalPolicyReason: `Trust score ${(trustScore * 100).toFixed(0)}% is below threshold ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}%.` });
      await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: "LOW_TRUST", trust_score: trustScore }, tenantId: "TENANT-001" });
    }

    // 7. Party inference — auto-create CDM PARTY + Identifiers
    if (ADRS_CONFIG.features.auto_party_creation) {
      const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id);
      const inferredDoc     = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id);
      let docEntityCode: string | null = null;

      if (inferredDoc) {
        const docEntity = await storage.createCdmEntity(inferredDoc.entity);
        docEntityCode = docEntity.entityCode;
        await storage.createAuditLog({ action: "AUTO_DOC_INFERRED", resourceType: "CDM", resourceId: docEntity.entityCode, userId: "system", details: { display_name: docEntity.displayName, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
      }

      for (const inferred of inferredParties) {
        if (docEntityCode) {
          inferred.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: "MENTIONED_IN", confidence: inferred.entity.confidenceScore }];
        }
        const partyEntity = await storage.createCdmEntity(inferred.entity);
        await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: partyEntity.entityCode, userId: "system", details: { entity_type: partyEntity.entityType, display_name: partyEntity.displayName, identifiers: inferred.identifiers.length, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
      }
    }

    await storage.createAuditLog({ action: "EXTRACTION_COMPLETED", resourceType: "EXTRACTION", resourceId: run.id, userId: "system", details: { doc_type: run.docType, trust_score: run.trustScore, quality_gates_passed: run.qualityGatesPassed, attrs_total: dedupedAttrs.length, attrs_pending: dedupedAttrs.filter(a => a.validation_state === "PENDING").length }, tenantId: "TENANT-001" });

    res.json(ADRS_CONFIG.features.include_text_by_default ? run : stripText(run));
  });

  // ─── Validation ────────────────────────────────────────────────────────────
  app.get("/api/validation", async (_req: any, res: any) => res.json(await storage.getValidationTasks()));
  app.get("/api/validation/:id", async (req: any, res: any) => {
    const t = await storage.getValidationTask(req.params.id);
    if (!t) return res.status(404).json({ error: "Not found" });
    res.json(t);
  });
  app.post("/api/validation", async (req: any, res: any) => {
    const parse = insertValidationTaskSchema.safeParse({ ...req.body, taskCode: generateCode("VAL") });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    res.json(await storage.createValidationTask(parse.data));
  });
  app.patch("/api/validation/:id", async (req: any, res: any) => {
    const existing = await storage.getValidationTask(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: any = { ...req.body };
    if (req.body.status && req.body.status !== existing.status) updates.validatedAt = new Date();
    const task = await storage.updateValidationTask(req.params.id, updates);
    const action = req.body.status === "APPROVED" ? "VALIDATION_APPROVED" : req.body.status === "REJECTED" ? "VALIDATION_REJECTED" : "VALIDATION_UPDATED";
    await storage.createAuditLog({ action, resourceType: "VALIDATION", resourceId: task?.taskCode, userId: req.body.validator ?? "validator", details: { status: req.body.status, notes: req.body.validatorNotes, policy_rule: existing.approvalPolicyRule }, tenantId: "TENANT-001" });
    res.json(task);
  });

  // ─── CDM ───────────────────────────────────────────────────────────────────
  app.get("/api/cdm", async (_req: any, res: any) => res.json(await storage.getCdmEntities()));
  app.get("/api/cdm/:id", async (req: any, res: any) => {
    const e = await storage.getCdmEntity(req.params.id);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  });
  app.post("/api/cdm", async (req: any, res: any) => {
    const body = { ...req.body, entityCode: req.body.entityCode ?? generateCode(req.body.entityType ?? "ENT") };
    const parse = insertCdmEntitySchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const entity = await storage.createCdmEntity(parse.data);
    await storage.createAuditLog({ action: "ENTITY_CREATED", resourceType: "CDM", resourceId: entity.entityCode, userId: "system", details: { entity_type: entity.entityType, name: entity.displayName }, tenantId: "TENANT-001" });
    res.json(entity);
  });
  app.patch("/api/cdm/:id", async (req: any, res: any) => {
    const entity = await storage.updateCdmEntity(req.params.id, req.body);
    if (!entity) return res.status(404).json({ error: "Not found" });
    res.json(entity);
  });

  // ─── Datasets ──────────────────────────────────────────────────────────────
  app.get("/api/datasets", async (_req: any, res: any) => res.json(await storage.getPublishedDatasets()));
  app.get("/api/datasets/:id", async (req: any, res: any) => {
    const d = await storage.getPublishedDataset(req.params.id);
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });

  // ─── Multi-artifact download (CSV for ML, real ZIP for bundle) ─────────────
  app.get("/api/datasets/:code/artifact", async (req: any, res: any) => {
    const datasets = await storage.getPublishedDatasets();
    const dataset  = datasets.find(d => d.datasetCode === req.params.code || d.id === req.params.code);
    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    const contents = dataset.artifactContents as any;
    if (!contents) return res.status(404).json({ error: "Artifacts not generated yet. Publish the dataset first." });
    const { type = "ml" } = req.query as Record<string, string>;

    if (type === "ml") {
      const csv = generateMlCsv(contents.ml_features ?? []);
      res.setHeader("Content-Disposition", `attachment; filename="ml_features_${dataset.datasetCode}_v${dataset.version}.csv"`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    if (type === "bundle") {
      const zip = await generateBundleZip(contents);
      res.setHeader("Content-Disposition", `attachment; filename="bundle_${dataset.datasetCode}_v${dataset.version}.zip"`);
      res.setHeader("Content-Type", "application/zip");
      return res.send(zip);
    }

    const jsonlMap: Record<string, any[]> = {
      kg_entities:    contents.kg_entities,
      kg_identifiers: contents.kg_identifiers,
      kg_edges:       contents.kg_edges,
      rag_chunks:     contents.rag_chunks,
      dataset_card:   [contents.dataset_card],
    };
    const data = jsonlMap[type];
    if (!data) return res.status(400).json({ error: `Unknown artifact type: ${type}. Valid: ml, kg_entities, kg_identifiers, kg_edges, rag_chunks, bundle` });
    const jsonl = data.map((r: any) => JSON.stringify(r)).join("\n");
    res.setHeader("Content-Disposition", `attachment; filename="${type}_${dataset.datasetCode}_v${dataset.version}.jsonl"`);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.send(jsonl);
  });

  app.post("/api/datasets", async (req: any, res: any) => {
    const body = { ...req.body, datasetCode: generateCode("DS"), tenantId: "TENANT-001" };
    const parse = insertDatasetSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const dataset = await storage.createPublishedDataset(parse.data);
    await storage.createAuditLog({ action: "DATASET_CREATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "Wills", details: { name: dataset.name, version: dataset.version }, tenantId: "TENANT-001" });
    res.json(dataset);
  });

  // ─── Publish with trust-score blocking + override ─────────────────────────
  app.post("/api/datasets/:id/publish", async (req: any, res: any) => {
    const dataset = await storage.getPublishedDataset(req.params.id);
    if (!dataset) return res.status(404).json({ error: "Not found" });

    const entities     = await storage.getCdmEntities();
    const extractions  = await storage.getExtractionRuns();
    const evidenceFiles = await storage.getEvidenceFiles();
    const evidenceMap  = new Map(evidenceFiles.map(e => [e.id, e]));

    // Trust-score blocking check (uses dataset.qualityScore which reflects all evidence linked to this dataset)
    if (ADRS_CONFIG.features.publish_trust_blocking) {
      const datasetTrustScore = dataset.qualityScore;
      const threshold = ADRS_CONFIG.thresholds.publish_trust_block;
      if (datasetTrustScore < threshold) {
        const { override, overrideReason } = req.body;
        if (!override) {
          const blockingReason = `Dataset quality score ${(datasetTrustScore * 100).toFixed(0)}% is below the publishing threshold of ${(threshold * 100).toFixed(0)}%. Improve extraction quality or provide an override reason.`;
          await storage.createAuditLog({ action: "PUBLISH_BLOCKED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { avg_trust_score: datasetTrustScore, threshold, reason: blockingReason }, tenantId: "TENANT-001" });
          return res.status(422).json({ blocked: true, avg_trust_score: datasetTrustScore, threshold, reason: blockingReason });
        }
        // Override granted — audit it
        await storage.createAuditLog({ action: "PUBLISH_OVERRIDE", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { override_reason: overrideReason, avg_trust_score: datasetTrustScore, threshold }, tenantId: "TENANT-001" });
      }
    }

    const artifacts    = buildArtifactContents(dataset, entities, extractions, evidenceMap);
    const artifactUris = buildArtifactUris(dataset.datasetCode, dataset.version);
    const updated      = await storage.updatePublishedDataset(req.params.id, { status: "PUBLISHED", publishedAt: new Date(), publishedBy: req.body.publishedBy ?? "Wills", datasetCard: artifacts.dataset_card, artifactUris, artifactContents: artifacts, formats: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"] });

    await storage.createAuditLog({ action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "system", details: { artifacts: ["ml_features.csv", "kg_entities.jsonl", "kg_identifiers.jsonl", "kg_edges.jsonl", "rag_chunks.jsonl", "bundle.zip"] }, tenantId: "TENANT-001" });
    await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { name: dataset.name, version: dataset.version, ml_rows: artifacts.ml_features.length, kg_entities: artifacts.kg_entities.length, rag_chunks: artifacts.rag_chunks.length }, tenantId: "TENANT-001" });

    res.json({ dataset: updated, ml: artifacts.ml_features.length, kg_entities: artifacts.kg_entities.length, kg_edges: artifacts.kg_edges.length, kg_identifiers: artifacts.kg_identifiers.length, rag_chunks: artifacts.rag_chunks.length });
  });

  app.patch("/api/datasets/:id", async (req: any, res: any) => {
    const existing = await storage.getPublishedDataset(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updatePublishedDataset(req.params.id, req.body);
    if (req.body.status === "PUBLISHED") await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: existing.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { name: existing.name, version: existing.version }, tenantId: "TENANT-001" });
    res.json(updated);
  });

  // ─── Normalization preview ─────────────────────────────────────────────────
  app.post("/api/normalize/preview", async (req: any, res: any) => {
    const { fields = {}, entities = [] } = req.body;
    const rawAttrs = normalizeExtractedFields(fields, entities);
    const { deduped, conflictKeys } = dedupAttributes(rawAttrs);
    res.json({ attributes: deduped, total: deduped.length, pending: deduped.filter((a: any) => a.validation_state === "PENDING").length, approved: deduped.filter((a: any) => a.validation_state === "AUTO_APPROVED").length, conflicts: conflictKeys });
  });

  // ─── Audit ─────────────────────────────────────────────────────────────────
  app.get("/api/audit", async (_req: any, res: any) => res.json(await storage.getAuditLogs(200)));

  return httpServer;
}
