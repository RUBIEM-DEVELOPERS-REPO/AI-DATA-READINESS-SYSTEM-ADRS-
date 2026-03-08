import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBatchSchema, insertEvidenceSchema, insertExtractionRunSchema, insertValidationTaskSchema, insertCdmEntitySchema, insertDatasetSchema } from "@shared/schema";
import { createHash, randomUUID } from "crypto";
import { normalizeExtractedFields, dedupAttributes, runQualityGates } from "./services/normalization";
import { buildArtifactContents, buildArtifactUris } from "./services/publishing";

function generateCode(prefix: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${prefix}-${year}-${rand}`;
}

function generateHash(input: string): string {
  return "sha256:" + createHash("sha256").update(input + Date.now()).digest("hex");
}

async function seedData() {
  const evidence = await storage.getEvidenceFiles();
  if (evidence.length > 0) return;

  const batch1 = await storage.createBatch({
    batchCode: "BATCH-2026-0001",
    sourceLocation: "Ministry of Finance Archive — Warehouse A",
    status: "COMPLETED",
    expectedDocuments: 120,
    scannedDocuments: 118,
    createdBy: "operator_001",
    notes: "Q4 2025 financial documents digitization run",
  });

  const batch2 = await storage.createBatch({
    batchCode: "BATCH-2026-0002",
    sourceLocation: "Department of Lands — Records Room B",
    status: "IN_PROGRESS",
    expectedDocuments: 85,
    scannedDocuments: 62,
    createdBy: "operator_002",
    notes: "Land registry documents 2015–2023",
  });

  const seedEvidence = [
    { evidenceCode: "EVID-001", batchId: batch1.id, fileName: "invoice_ministry_2025_q4_001.pdf", fileFormat: "pdf", fileSizeBytes: 2457600, fileHash: generateHash("inv001"), sourceType: "SCAN" as const, sourceReference: `${batch1.batchCode}/FOLDER-001`, status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/inv001/original.pdf", pageCount: 4, uploadedBy: "operator_001", tags: ["finance", "invoice", "2025"] },
    { evidenceCode: "EVID-002", batchId: batch1.id, fileName: "procurement_contract_2025_003.pdf", fileFormat: "pdf", fileSizeBytes: 5120000, fileHash: generateHash("con003"), sourceType: "SCAN" as const, sourceReference: `${batch1.batchCode}/FOLDER-002`, status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/con003/original.pdf", pageCount: 12, uploadedBy: "operator_001", tags: ["procurement", "contract"] },
    { evidenceCode: "EVID-003", batchId: batch2.id, fileName: "land_title_deed_KE-2019-04821.tiff", fileFormat: "tiff", fileSizeBytes: 8388608, fileHash: generateHash("deed04821"), sourceType: "SCAN" as const, sourceReference: `${batch2.batchCode}/FOLDER-001`, status: "PROCESSING" as const, storedUri: "s3://evidence/tenant-001/2026/03/deed04821/original.tiff", pageCount: 2, uploadedBy: "operator_002", tags: ["land", "deed", "property"] },
    { evidenceCode: "EVID-004", fileName: "annual_report_2024_ai_institute.docx", fileFormat: "docx", fileSizeBytes: 3670016, fileHash: generateHash("report2024"), sourceType: "SHAREPOINT" as const, sourceReference: "https://sharepoint/AI-Institute/Reports/2024", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/02/report2024/original.docx", pageCount: 28, uploadedBy: "system_connector", tags: ["report", "annual", "ai-institute"] },
    { evidenceCode: "EVID-005", fileName: "vendor_invoice_abc_holdings_march.pdf", fileFormat: "pdf", fileSizeBytes: 1024000, fileHash: generateHash("vendor005"), sourceType: "EMAIL" as const, sourceReference: "inbox@ministry.go.ke → accounts@internal.go.ke", status: "PROCESSED" as const, storedUri: "s3://evidence/tenant-001/2026/03/vendor005/original.pdf", pageCount: 2, uploadedBy: "email_connector", tags: ["vendor", "invoice", "abc-holdings"] },
  ];

  const createdEvidence: any[] = [];
  for (const ev of seedEvidence) {
    createdEvidence.push(await storage.createEvidenceFile(ev));
  }

  // Build extraction runs WITH normalization
  const rawExtractionData = [
    {
      evidenceId: createdEvidence[0].id,
      docType: "INVOICE" as const,
      docTypeConfidence: 0.94,
      ocrConfidence: 0.91,
      extractionConfidence: 0.88,
      completenessScore: 0.92,
      consistencyScore: 0.87,
      docQualityScore: 0.90,
      extractedFields: { invoice_number: "INV-2025-00341", amount: "KES 4,250,000", supplier_name: "TechVault Solutions Ltd", date: "2025-12-15", payment_terms: "Net 30" },
      extractedEntities: [
        { entity: "Organization", value: "TechVault Solutions Ltd", confidence: 0.94, evidence_pointer: "PAGE-001:bbox(10,20,200,40)" },
        { entity: "Amount", value: "KES 4,250,000", confidence: 0.91, evidence_pointer: "PAGE-001:bbox(300,120,450,140)" },
        { entity: "Date", value: "2025-12-15", confidence: 0.98, evidence_pointer: "PAGE-001:bbox(200,60,350,80)" },
      ],
      extractedTables: [{ table_id: "TABLE-001", rows: [["Item", "Qty", "Unit Price", "Total"], ["Enterprise Licenses", "50", "KES 85,000", "KES 4,250,000"]], confidence: 0.89 }],
      rawText: "INVOICE\nInvoice No: INV-2025-00341\nDate: December 15, 2025\n\nBill To:\nMinistry of Finance\nNairobi, Kenya\n\nFrom:\nTechVault Solutions Ltd\nMombasa Road, Nairobi\n\nItems:\nEnterprise Licenses (50) @ KES 85,000 = KES 4,250,000\n\nTotal Due: KES 4,250,000\nPayment Terms: Net 30",
      processingTimeMs: 2340,
    },
    {
      evidenceId: createdEvidence[1].id,
      docType: "CONTRACT" as const,
      docTypeConfidence: 0.97,
      ocrConfidence: 0.89,
      extractionConfidence: 0.85,
      completenessScore: 0.88,
      consistencyScore: 0.82,
      docQualityScore: 0.86,
      extractedFields: { contract_number: "PROC-2025-0087", parties: "Ministry of Finance & BuildRight Construction", value: "KES 12,800,000", start_date: "2026-01-01", end_date: "2026-12-31" },
      extractedEntities: [
        { entity: "Organization", value: "Ministry of Finance", confidence: 0.97, evidence_pointer: "PAGE-001:bbox(50,100,300,120)" },
        { entity: "Organization", value: "BuildRight Construction Ltd", confidence: 0.93, evidence_pointer: "PAGE-001:bbox(50,130,350,150)" },
        { entity: "Amount", value: "KES 12,800,000", confidence: 0.88, evidence_pointer: "PAGE-003:bbox(200,200,400,220)" },
      ],
      extractedTables: [],
      rawText: "PROCUREMENT CONTRACT\nRef: PROC-2025-0087\n\nThis agreement entered between Ministry of Finance (hereinafter 'Client') and BuildRight Construction Ltd (hereinafter 'Contractor').\n\nContract Value: KES 12,800,000\nCommencement: 1 January 2026\nCompletion: 31 December 2026",
      processingTimeMs: 4120,
    },
    {
      evidenceId: createdEvidence[3].id,
      docType: "REPORT" as const,
      docTypeConfidence: 0.92,
      ocrConfidence: 0.95,
      extractionConfidence: 0.91,
      completenessScore: 0.96,
      consistencyScore: 0.93,
      docQualityScore: 0.94,
      extractedFields: { report_title: "Annual Report 2024", organization: "The AI Institute Africa", year: "2024", pages: "28" },
      extractedEntities: [
        { entity: "Organization", value: "The AI Institute Africa", confidence: 0.99, evidence_pointer: "PAGE-001:bbox(100,50,400,80)" },
        { entity: "Date", value: "2024", confidence: 0.98, evidence_pointer: "PAGE-001:bbox(100,80,200,100)" },
      ],
      extractedTables: [{ table_id: "TABLE-001", rows: [["Metric", "2024", "2023"], ["Datasets Published", "47", "29"], ["Partners", "18", "12"]], confidence: 0.92 }],
      rawText: "THE AI INSTITUTE AFRICA\nANNUAL REPORT 2024\n\nExecutive Summary:\nThe AI Institute Africa continues to lead data readiness initiatives across the continent.\n\nKey Metrics:\n- Datasets Published: 47 (up from 29 in 2023)\n- Partner Organizations: 18 (up from 12)\n- Countries Reached: 8\n\nOur mission is to transform raw evidence into AI-ready datasets that enable decision-making across African governments and institutions.",
      processingTimeMs: 6890,
    },
    {
      evidenceId: createdEvidence[4].id,
      docType: "INVOICE" as const,
      docTypeConfidence: 0.96,
      ocrConfidence: 0.82,
      extractionConfidence: 0.78,
      completenessScore: 0.80,
      consistencyScore: 0.75,
      docQualityScore: 0.83,
      extractedFields: { invoice_number: "ABC-2026-0312", vendor: "ABC Holdings Ltd", amount: "KES 780,000", date: "2026-03-01" },
      extractedEntities: [
        { entity: "Organization", value: "ABC Holdings Ltd", confidence: 0.89, evidence_pointer: "PAGE-001:bbox(10,20,200,40)" },
        { entity: "Amount", value: "KES 780,000", confidence: 0.82, evidence_pointer: "PAGE-001:bbox(300,100,420,120)" },
      ],
      extractedTables: [],
      rawText: "ABC HOLDINGS LTD\nInvoice #: ABC-2026-0312\nDate: 01/03/2026\n\nOffice Supplies & Equipment\nTotal: KES 780,000",
      processingTimeMs: 1980,
    },
  ];

  const createdExtractions: any[] = [];
  for (const ext of rawExtractionData) {
    const rawAttrs = normalizeExtractedFields(ext.extractedFields, ext.extractedEntities);
    const dedupedAttrs = dedupAttributes(rawAttrs);
    const qgResult = runQualityGates(ext.docType, dedupedAttrs, ext.ocrConfidence);
    const trustScore = 0.35 * ext.ocrConfidence + 0.25 * ext.extractionConfidence + 0.15 * qgResult.completenessScore + 0.15 * ext.consistencyScore + 0.10 * ext.docQualityScore;

    const run = await storage.createExtractionRun({
      ...ext,
      trustScore,
      trustScoreBreakdown: { ocr: ext.ocrConfidence, extraction: ext.extractionConfidence, completeness: qgResult.completenessScore, consistency: ext.consistencyScore, doc_quality: ext.docQualityScore },
      extractedAttributes: dedupedAttrs,
      qualityGatesPassed: qgResult.passed,
      qualityGatesReport: qgResult,
    });
    createdExtractions.push(run);
  }

  // Validation tasks with policy metadata
  const validationData = [
    { taskCode: "VAL-2026-001", extractionRunId: createdExtractions[0].id, evidenceId: createdEvidence[0].id, status: "APPROVED" as const, assignedTo: "validator_007", fieldsToValidate: ["invoice_number", "amount", "supplier_name"], validatorNotes: "All fields verified. Amounts match physical document.", trustScore: createdExtractions[0].trustScore, approvalStage: 1, maxApprovalStages: 1 },
    { taskCode: "VAL-2026-002", extractionRunId: createdExtractions[1].id, evidenceId: createdEvidence[1].id, status: "PENDING_VALIDATION" as const, assignedTo: "validator_003", fieldsToValidate: ["contract_number", "value", "parties", "end_date"], trustScore: createdExtractions[1].trustScore, approvalStage: 1, maxApprovalStages: 2, approvalPolicyRule: "LOW_CONFIDENCE", approvalPolicyReason: "3 fields below auto-approval threshold. Human review required for contract value and parties." },
    { taskCode: "VAL-2026-003", extractionRunId: createdExtractions[2].id, evidenceId: createdEvidence[3].id, status: "APPROVED" as const, assignedTo: "validator_007", fieldsToValidate: ["report_title", "organization"], validatorNotes: "Confirmed. Authentic annual report.", trustScore: createdExtractions[2].trustScore, approvalStage: 1, maxApprovalStages: 1 },
    { taskCode: "VAL-2026-004", extractionRunId: createdExtractions[3].id, evidenceId: createdEvidence[4].id, status: "PENDING_VALIDATION" as const, assignedTo: "validator_002", fieldsToValidate: ["invoice_number", "vendor", "amount"], trustScore: createdExtractions[3].trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: "LOW_CONFIDENCE", approvalPolicyReason: "OCR confidence 82% is below threshold. Amount extraction confidence 78% requires verification." },
  ];

  for (const vt of validationData) {
    await storage.createValidationTask(vt);
  }

  // CDM entities with identifiers and relationships
  const cdmData = [
    {
      entityCode: "PERSON-001", entityType: "PERSON" as const, displayName: "Dr. Amara Osei",
      canonicalFields: { person_id: "KE-ID-4521987", name: "Dr. Amara Osei", national_id: "KE4521987", role: "Director General", organization: "Ministry of Finance", phone: "+254701234567", address: "Treasury Building, Nairobi" },
      identifiers: [{ id_type_label: "Phone", id_value: "+254701234567", is_verified: false }, { id_type_label: "National ID", id_value: "KE4521987", is_verified: true }],
      relationships: [{ target_entity_id: "ORG-001", relationship_type: "TRANSACTED_WITH", confidence: 0.94, evidence_id: createdEvidence[0].id }],
      sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.94,
    },
    {
      entityCode: "ORG-001", entityType: "ORGANIZATION" as const, displayName: "TechVault Solutions Ltd",
      canonicalFields: { org_id: "KRA-PIN-P051423987K", org_name: "TechVault Solutions Ltd", registration_number: "CPR/2018/041234", sector: "Technology", address: "Mombasa Road, Nairobi, Kenya" },
      identifiers: [{ id_type_label: "Registration", id_value: "CPR/2018/041234", is_verified: true }, { id_type_label: "KRA PIN", id_value: "P051423987K", is_verified: true }],
      relationships: [{ target_entity_id: "TRX-001", relationship_type: "ISSUED", confidence: 0.94, evidence_id: createdEvidence[0].id }],
      sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.94,
    },
    {
      entityCode: "ORG-002", entityType: "ORGANIZATION" as const, displayName: "BuildRight Construction Ltd",
      canonicalFields: { org_id: "KRA-PIN-P061234098K", org_name: "BuildRight Construction Ltd", registration_number: "CPR/2019/078901", sector: "Construction", address: "Industrial Area, Nairobi, Kenya" },
      identifiers: [{ id_type_label: "Registration", id_value: "CPR/2019/078901", is_verified: false }],
      relationships: [],
      sourceEvidenceIds: [createdEvidence[1].id], isGoldenRecord: false, confidenceScore: 0.88,
    },
    {
      entityCode: "ORG-003", entityType: "ORGANIZATION" as const, displayName: "The AI Institute Africa",
      canonicalFields: { org_id: "NGO-2020-0041", org_name: "The AI Institute Africa", registration_number: "NGO/2020/041", sector: "Research & Development", address: "Westlands, Nairobi, Kenya", website: "aiinstituteafrica.org" },
      identifiers: [{ id_type_label: "Registration", id_value: "NGO/2020/041", is_verified: true }],
      relationships: [],
      sourceEvidenceIds: [createdEvidence[3].id], isGoldenRecord: true, confidenceScore: 0.99,
    },
    {
      entityCode: "TRX-001", entityType: "TRANSACTION" as const, displayName: "INV-2025-00341 — TechVault",
      canonicalFields: { transaction_id: "TRX-2025-00341", type: "INVOICE", amount: "KES 4,250,000", amount_numeric: 4250000, currency: "KES", counterparty: "TechVault Solutions Ltd", date: "2025-12-15", status: "PENDING_PAYMENT" },
      identifiers: [],
      relationships: [{ target_entity_id: "ORG-001", relationship_type: "INVOLVES", confidence: 0.94 }],
      sourceEvidenceIds: [createdEvidence[0].id], isGoldenRecord: true, confidenceScore: 0.91,
    },
    {
      entityCode: "DOC-001", entityType: "DOCUMENT" as const, displayName: "Annual Report 2024 — AI Institute Africa",
      canonicalFields: { doc_id: "DOC-2024-ANNUAL", title: "Annual Report 2024", doc_type: "ANNUAL_REPORT", issuer: "The AI Institute Africa", year: "2024", pages: "28", language: "English" },
      identifiers: [],
      relationships: [{ target_entity_id: "ORG-003", relationship_type: "ISSUED_BY", confidence: 0.99 }],
      sourceEvidenceIds: [createdEvidence[3].id], isGoldenRecord: true, confidenceScore: 0.97,
    },
  ];

  const createdEntities: any[] = [];
  for (const entity of cdmData) {
    createdEntities.push(await storage.createCdmEntity(entity));
  }

  // Published dataset WITH multi-artifact content
  const ds1Partial = {
    datasetCode: "DS-2026-001", name: "Ministry Finance Records — Q4 2025",
    description: "Validated financial documents from Ministry of Finance Q4 2025 digitization. Includes invoices, contracts, and payment records.",
    version: "2.1.0", status: "PUBLISHED" as const, recordCount: 847,
    entityTypes: ["TRANSACTION", "ORGANIZATION", "PERSON"],
    formats: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"],
    qualityScore: 0.91,
    lineageInfo: { source_batches: ["BATCH-2026-0001"], pipeline_version: "1.0", processing_date: "2026-03-01" },
    publishedBy: "Wills", publishedAt: new Date("2026-03-01"),
  };

  const evidenceMap = new Map(createdEvidence.map((e: any) => [e.id, e]));
  const artifacts = buildArtifactContents(ds1Partial, createdEntities, [createdExtractions[0], createdExtractions[1], createdExtractions[2]], evidenceMap);
  const artifactUris = buildArtifactUris("DS-2026-001", "2.1.0");

  await storage.createPublishedDataset({
    ...ds1Partial,
    datasetCard: artifacts.dataset_card,
    artifactUris,
    artifactContents: artifacts,
    qualityGates: { passed: true, checks: [{ rule: "TRUST_SCORE", passed: true, detail: "Avg trust score 91%" }, { rule: "APPROVAL_RATE", passed: true, detail: "75% approved" }] },
    tenantId: "TENANT-001",
  });

  await storage.createPublishedDataset({
    datasetCode: "DS-2026-002", name: "AI Institute Knowledge Graph 2024",
    description: "Entity relationships extracted from the AI Institute Africa annual reports and programme documents.",
    version: "1.0.0", status: "DRAFT" as const, recordCount: 312,
    entityTypes: ["ORGANIZATION", "PERSON", "DOCUMENT"],
    formats: ["KG_ENTITIES", "KG_EDGES", "RAG_CHUNKS"],
    qualityScore: 0.87,
    lineageInfo: { source_evidence: ["EVID-004"], pipeline_version: "1.0" },
    tenantId: "TENANT-001",
  });

  // Audit seed
  const auditEntries = [
    { action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch1.id, userId: "operator_001", details: { batch_code: "BATCH-2026-0001", source: "Ministry of Finance" } },
    { action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch2.id, userId: "operator_002", details: { batch_code: "BATCH-2026-0002" } },
    { action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: createdEvidence[0].id, userId: "operator_001", details: { file: "invoice_ministry_2025_q4_001.pdf", hash: "sha256:ab234..." } },
    { action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: createdEvidence[1].id, userId: "operator_001", details: { file: "procurement_contract_2025_003.pdf" } },
    { action: "NORMALIZATION_COMPLETED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { attrs_normalized: 8, attrs_pending: 1 } },
    { action: "QUALITY_GATE_PASSED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { checks_passed: 4, doc_type: "INVOICE" } },
    { action: "EXTRACTION_COMPLETED", resourceType: "EXTRACTION", resourceId: createdExtractions[0].id, userId: "system", details: { doc_type: "INVOICE", trust_score: "0.90" } },
    { action: "VALIDATION_APPROVED", resourceType: "VALIDATION", resourceId: "VAL-2026-001", userId: "validator_007", details: { task: "VAL-2026-001", policy_rule: "MANUAL_REVIEW" } },
    { action: "ENTITY_CREATED", resourceType: "CDM", resourceId: "ORG-001", userId: "system", details: { entity_type: "ORGANIZATION", name: "TechVault Solutions Ltd" } },
    { action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: "DS-2026-001", userId: "system", details: { artifacts: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "RAG_CHUNKS"] } },
    { action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: "DS-2026-001", userId: "Wills", details: { name: "Ministry Finance Records Q4 2025", version: "2.1.0", records: 847 } },
  ];

  for (const entry of auditEntries) {
    await storage.createAuditLog({ ...entry, tenantId: "TENANT-001" });
  }
}

export async function registerRoutes(httpServer: any, app: Express): Promise<any> {
  await seedData().catch(console.error);

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      res.json(await storage.getDashboardStats());
    } catch { res.status(500).json({ error: "Failed to fetch stats" }); }
  });

  // ─── Batches ────────────────────────────────────────────────────────────────
  app.get("/api/batches", async (req, res) => res.json(await storage.getBatches()));

  app.post("/api/batches", async (req, res) => {
    const parse = insertBatchSchema.safeParse({ ...req.body, batchCode: generateCode("BATCH") });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const batch = await storage.createBatch(parse.data);
    await storage.createAuditLog({ action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch.id, userId: batch.createdBy, details: { batch_code: batch.batchCode }, tenantId: "TENANT-001" });
    res.json(batch);
  });

  app.patch("/api/batches/:id", async (req, res) => {
    const batch = await storage.updateBatch(req.params.id, req.body);
    if (!batch) return res.status(404).json({ error: "Not found" });
    res.json(batch);
  });

  // ─── Evidence ───────────────────────────────────────────────────────────────
  app.get("/api/evidence", async (req, res) => res.json(await storage.getEvidenceFiles()));
  app.get("/api/evidence/:id", async (req, res) => {
    const f = await storage.getEvidenceFile(req.params.id);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  app.post("/api/evidence", async (req, res) => {
    const body = {
      ...req.body,
      evidenceCode: generateCode("EVID"),
      fileHash: generateHash(req.body.fileName ?? "file"),
      storedUri: `s3://evidence/tenant-001/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${randomUUID()}/original.${req.body.fileFormat ?? "pdf"}`,
      immutabilityStatus: "LOCKED",
    };
    const parse = insertEvidenceSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const file = await storage.createEvidenceFile(parse.data);
    await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash }, tenantId: "TENANT-001" });
    res.json(file);
  });

  app.patch("/api/evidence/:id", async (req, res) => {
    const f = await storage.updateEvidenceFile(req.params.id, req.body);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  // ─── Extractions ─────────────────────────────────────────────────────────────
  app.get("/api/extractions", async (req, res) => res.json(await storage.getExtractionRuns()));
  app.get("/api/extractions/:id", async (req, res) => {
    const r = await storage.getExtractionRun(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json(r);
  });

  app.post("/api/extractions", async (req, res) => {
    // Run normalization + quality gates before saving
    const { extractedFields = {}, extractedEntities = [], ocrConfidence = 0, docType = "OTHER", ...rest } = req.body;
    const rawAttrs = normalizeExtractedFields(extractedFields, extractedEntities);
    const dedupedAttrs = dedupAttributes(rawAttrs);
    const qgResult = runQualityGates(docType, dedupedAttrs, ocrConfidence);
    const { extractionConfidence = 0, completenessScore = 0, consistencyScore = 0, docQualityScore = 0 } = rest;
    const trustScore = 0.35 * ocrConfidence + 0.25 * extractionConfidence + 0.15 * qgResult.completenessScore + 0.15 * consistencyScore + 0.10 * docQualityScore;

    const parse = insertExtractionRunSchema.safeParse({
      ...rest, extractedFields, extractedEntities, ocrConfidence, docType,
      trustScore, trustScoreBreakdown: { ocr: ocrConfidence, extraction: extractionConfidence, completeness: qgResult.completenessScore, consistency: consistencyScore, doc_quality: docQualityScore },
      extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
    });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const run = await storage.createExtractionRun(parse.data);
    await storage.createAuditLog({ action: "EXTRACTION_COMPLETED", resourceType: "EXTRACTION", resourceId: run.id, userId: "system", details: { doc_type: run.docType, trust_score: run.trustScore, quality_gates_passed: run.qualityGatesPassed }, tenantId: "TENANT-001" });
    res.json(run);
  });

  // ─── Validation ──────────────────────────────────────────────────────────────
  app.get("/api/validation", async (req, res) => res.json(await storage.getValidationTasks()));
  app.get("/api/validation/:id", async (req, res) => {
    const t = await storage.getValidationTask(req.params.id);
    if (!t) return res.status(404).json({ error: "Not found" });
    res.json(t);
  });

  app.post("/api/validation", async (req, res) => {
    const body = { ...req.body, taskCode: generateCode("VAL") };
    const parse = insertValidationTaskSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    res.json(await storage.createValidationTask(parse.data));
  });

  app.patch("/api/validation/:id", async (req, res) => {
    const existing = await storage.getValidationTask(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: any = { ...req.body };
    if (req.body.status && req.body.status !== existing.status) updates.validatedAt = new Date();
    const task = await storage.updateValidationTask(req.params.id, updates);
    const action = req.body.status === "APPROVED" ? "VALIDATION_APPROVED" : req.body.status === "REJECTED" ? "VALIDATION_REJECTED" : "VALIDATION_UPDATED";
    await storage.createAuditLog({ action, resourceType: "VALIDATION", resourceId: task?.taskCode, userId: req.body.validator ?? "validator", details: { status: req.body.status, notes: req.body.validatorNotes, policy_rule: existing.approvalPolicyRule }, tenantId: "TENANT-001" });
    res.json(task);
  });

  // ─── CDM ─────────────────────────────────────────────────────────────────────
  app.get("/api/cdm", async (req, res) => res.json(await storage.getCdmEntities()));
  app.get("/api/cdm/:id", async (req, res) => {
    const e = await storage.getCdmEntity(req.params.id);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  });

  app.post("/api/cdm", async (req, res) => {
    const body = { ...req.body, entityCode: req.body.entityCode ?? generateCode(req.body.entityType ?? "ENT") };
    const parse = insertCdmEntitySchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const entity = await storage.createCdmEntity(parse.data);
    await storage.createAuditLog({ action: "ENTITY_CREATED", resourceType: "CDM", resourceId: entity.entityCode, userId: "system", details: { entity_type: entity.entityType, name: entity.displayName }, tenantId: "TENANT-001" });
    res.json(entity);
  });

  app.patch("/api/cdm/:id", async (req, res) => {
    const entity = await storage.updateCdmEntity(req.params.id, req.body);
    if (!entity) return res.status(404).json({ error: "Not found" });
    res.json(entity);
  });

  // ─── Datasets ────────────────────────────────────────────────────────────────
  app.get("/api/datasets", async (req, res) => res.json(await storage.getPublishedDatasets()));
  app.get("/api/datasets/:id", async (req, res) => {
    const d = await storage.getPublishedDataset(req.params.id);
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });

  // ─── Multi-artifact download endpoint ────────────────────────────────────────
  app.get("/api/datasets/:code/artifact", async (req, res) => {
    const datasets = await storage.getPublishedDatasets();
    const dataset = datasets.find(d => d.datasetCode === req.params.code || d.id === req.params.code);
    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    const contents = dataset.artifactContents as any;
    if (!contents) return res.status(404).json({ error: "Artifacts not generated yet" });

    const { type = "ml" } = req.query as Record<string, string>;
    const artifactMap: Record<string, any> = {
      ml: contents.ml_features,
      kg_entities: contents.kg_entities,
      kg_identifiers: contents.kg_identifiers,
      kg_edges: contents.kg_edges,
      rag_chunks: contents.rag_chunks,
      dataset_card: contents.dataset_card,
      bundle: contents,
    };

    const artifact = artifactMap[type];
    if (!artifact) return res.status(400).json({ error: `Unknown artifact type: ${type}` });

    // Stream as JSONL for list artifacts, JSON for single objects
    const filename = type === "ml" ? "ml_features.jsonl" : type === "bundle" ? "bundle.json" : `${type}.jsonl`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.json(artifact);
  });

  app.post("/api/datasets", async (req, res) => {
    const body = { ...req.body, datasetCode: generateCode("DS"), tenantId: "TENANT-001" };
    const parse = insertDatasetSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const dataset = await storage.createPublishedDataset(parse.data);
    await storage.createAuditLog({ action: "DATASET_CREATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "Wills", details: { name: dataset.name, version: dataset.version }, tenantId: "TENANT-001" });
    res.json(dataset);
  });

  // ─── Publish with artifact generation ────────────────────────────────────────
  app.post("/api/datasets/:id/publish", async (req, res) => {
    const dataset = await storage.getPublishedDataset(req.params.id);
    if (!dataset) return res.status(404).json({ error: "Not found" });

    const entities = await storage.getCdmEntities();
    const extractions = await storage.getExtractionRuns();
    const evidenceFiles = await storage.getEvidenceFiles();
    const evidenceMap = new Map(evidenceFiles.map(e => [e.id, e]));

    const artifacts = buildArtifactContents(dataset, entities, extractions, evidenceMap);
    const artifactUris = buildArtifactUris(dataset.datasetCode, dataset.version);

    const updated = await storage.updatePublishedDataset(req.params.id, {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedBy: req.body.publishedBy ?? "Wills",
      datasetCard: artifacts.dataset_card,
      artifactUris,
      artifactContents: artifacts,
      formats: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"],
    });

    await storage.createAuditLog({ action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "system", details: { artifacts: Object.keys(artifacts) }, tenantId: "TENANT-001" });
    await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { name: dataset.name, version: dataset.version, ml_rows: artifacts.ml_features.length, kg_entities: artifacts.kg_entities.length, rag_chunks: artifacts.rag_chunks.length }, tenantId: "TENANT-001" });

    res.json({ dataset: updated, artifacts: { ml: artifacts.ml_features.length, kg_entities: artifacts.kg_entities.length, kg_edges: artifacts.kg_edges.length, kg_identifiers: artifacts.kg_identifiers.length, rag_chunks: artifacts.rag_chunks.length } });
  });

  app.patch("/api/datasets/:id", async (req, res) => {
    const existing = await storage.getPublishedDataset(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updatePublishedDataset(req.params.id, req.body);
    if (req.body.status === "PUBLISHED") {
      await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: existing.datasetCode, userId: req.body.publishedBy ?? "Wills", details: { name: existing.name, version: existing.version }, tenantId: "TENANT-001" });
    }
    res.json(updated);
  });

  // ─── Normalization preview endpoint ──────────────────────────────────────────
  app.post("/api/normalize/preview", async (req, res) => {
    const { fields = {}, entities = [] } = req.body;
    const rawAttrs = normalizeExtractedFields(fields, entities);
    const deduped = dedupAttributes(rawAttrs);
    res.json({ attributes: deduped, total: deduped.length, pending: deduped.filter(a => a.validation_state === "PENDING").length, approved: deduped.filter(a => a.validation_state === "AUTO_APPROVED").length });
  });

  // ─── Audit ───────────────────────────────────────────────────────────────────
  app.get("/api/audit", async (req, res) => res.json(await storage.getAuditLogs(200)));

  return httpServer;
}
