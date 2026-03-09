import type { Express } from "express";
import { storage } from "./storage";
import {
  insertBatchSchema, insertEvidenceSchema, insertExtractionRunSchema,
  insertValidationTaskSchema, insertCdmEntitySchema, insertDatasetSchema
} from "@shared/schema";
import { createHash, randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { normalizeExtractedFields, dedupAttributes, runQualityGates, computeTrustScore, type DedupResult } from "./services/normalization";
import { buildArtifactContents, buildArtifactUris, checkPublishTrustThreshold, generateMlCsv, generateBundleZip } from "./services/publishing";
import { inferParties, inferDocument } from "./services/party-inference";
import { ADRS_CONFIG } from "./config";
import { uploadMiddleware, computeFileHash, getMimeType, detectCloudSource, downloadFile, UPLOADS_DIR } from "./upload";
import { extractTextFromFile, detectDocType, extractFieldsFromText, extractEntitiesFromText, computeExtractionScores, simulateTranscript } from "./services/extraction";

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

export async function registerRoutes(httpServer: any, app: Express): Promise<any> {

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

  // Serve stored file for download/preview
  app.get("/api/evidence/:id/file", async (req: any, res: any) => {
    try {
      const f = await storage.getEvidenceFile(req.params.id);
      if (!f) return res.status(404).json({ error: "Not found" });
      if (!f.storedUri.startsWith("local://")) return res.status(404).json({ error: "File not stored locally" });
      const filePath = path.join(UPLOADS_DIR, f.storedUri.slice(8));
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing from disk" });
      const ext = path.extname(f.fileName).slice(1).toLowerCase();
      res.setHeader("Content-Type", getMimeType(ext));
      res.setHeader("Content-Disposition", `inline; filename="${f.fileName}"`);
      res.sendFile(filePath);
    } catch { res.status(500).json({ error: "Failed to serve file" }); }
  });

  // Metadata-only ingest (legacy/fallback)
  app.get("/api/evidence/:id", async (req: any, res: any) => {
    const f = await storage.getEvidenceFile(req.params.id);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  // Real file upload via multipart/form-data
  app.post("/api/evidence/upload", (req: any, res: any) => {
    uploadMiddleware(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      try {
        const ext = path.extname(req.file.originalname).slice(1).toLowerCase() || "bin";
        const fileHash = computeFileHash(req.file.path);
        const storedUri = `local://${req.file.filename}`;
        const body = {
          ...req.body,
          fileName: req.file.originalname,
          fileFormat: ext,
          fileSizeBytes: req.file.size,
          fileHash,
          storedUri,
          evidenceCode: generateCode("EVID"),
          immutabilityStatus: "LOCKED",
          mediaType: req.body.mediaType || (["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO" : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO" : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT"),
          durationSeconds: req.body.durationSeconds ? parseInt(req.body.durationSeconds) : undefined,
          pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : undefined,
          batchId: req.body.batchId || undefined,
        };
        const parse = insertEvidenceSchema.safeParse(body);
        if (!parse.success) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: parse.error });
        }
        const file = await storage.createEvidenceFile(parse.data);
        await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "file_upload" }, tenantId: "TENANT-001" });
        res.json(file);
      } catch (e: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: e?.message ?? "Upload failed" });
      }
    });
  });

  // Import from URL (Google Drive shared links, Dropbox, OneDrive, HTTP)
  app.post("/api/evidence/import-url", async (req: any, res: any) => {
    const { url, uploadedBy, batchId, tags, durationSeconds } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    try {
      const { source, downloadUrl, fileName: detectedName } = detectCloudSource(url);
      const ext = path.extname(detectedName).slice(1).toLowerCase() || "bin";
      const diskName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || "bin"}`;
      const diskPath = path.join(UPLOADS_DIR, diskName);
      await downloadFile(downloadUrl, diskPath);
      const stats = fs.statSync(diskPath);
      const fileHash = computeFileHash(diskPath);
      const mediaType = ["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO"
        : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO"
        : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT";
      const body = {
        fileName: detectedName,
        fileFormat: ext,
        fileSizeBytes: stats.size,
        fileHash,
        storedUri: `local://${diskName}`,
        evidenceCode: generateCode("EVID"),
        immutabilityStatus: "LOCKED",
        sourceType: source,
        sourceReference: url,
        mediaType,
        durationSeconds: durationSeconds ? parseInt(durationSeconds) : undefined,
        uploadedBy: uploadedBy || "operator_001",
        batchId: batchId || undefined,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      };
      const parse = insertEvidenceSchema.safeParse(body);
      if (!parse.success) {
        fs.unlinkSync(diskPath);
        return res.status(400).json({ error: parse.error });
      }
      const file = await storage.createEvidenceFile(parse.data);
      await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "url_import", source_url: url }, tenantId: "TENANT-001" });
      res.json(file);
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? "Import failed" });
    }
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

  // ─── One-click file extraction ──────────────────────────────────────────────
  app.post("/api/evidence/:id/extract", async (req: any, res: any) => {
    const evidenceFile = await storage.getEvidenceFile(req.params.id);
    if (!evidenceFile) return res.status(404).json({ error: "Evidence file not found" });

    try {
      // 1. Update status to PROCESSING
      await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSING" } as any);

      const isAV = ["AUDIO", "VIDEO"].includes(evidenceFile.mediaType ?? "DOCUMENT");
      const startTime = Date.now();

      // 2. Extract text from file
      let rawText = "";
      if (isAV) {
        rawText = simulateTranscript(evidenceFile.fileName, evidenceFile.durationSeconds ?? undefined);
      } else {
        rawText = await extractTextFromFile(evidenceFile.storedUri, evidenceFile.fileFormat);
      }

      // 3. Detect doc type
      const { docType, confidence: docTypeConfidence } = detectDocType(rawText, evidenceFile.fileFormat, evidenceFile.mediaType ?? "DOCUMENT");

      // 4. Extract fields & entities
      const extractedFields = extractFieldsFromText(rawText, docType);
      const extractedEntities = extractEntitiesFromText(rawText, extractedFields);
      const fieldCount = Object.keys(extractedFields).length;

      // 5. Compute scores
      const scores = computeExtractionScores(rawText, fieldCount, docType, evidenceFile.mediaType ?? "DOCUMENT");

      // 6. Normalize + dedup (reuse existing pipeline)
      const plainFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(extractedFields)) plainFields[k] = v.value;

      const rawAttrs = normalizeExtractedFields(plainFields, extractedEntities.map(e => ({ entity: e.entity, value: e.value, confidence: e.confidence })));
      const { deduped: dedupedAttrs, conflictKeys } = dedupAttributes(rawAttrs);
      const qgResult = runQualityGates(docType, dedupedAttrs, scores.ocrConfidence);
      const trustScore = computeTrustScore(scores.ocrConfidence, scores.extractionConfidence, qgResult.completenessScore, scores.consistencyScore, scores.docQualityScore);

      // 7. Build the extraction run payload
      const runPayload = {
        evidenceId: evidenceFile.id,
        docType,
        docTypeConfidence,
        ocrConfidence: scores.ocrConfidence,
        extractionConfidence: scores.extractionConfidence,
        completenessScore: qgResult.completenessScore,
        consistencyScore: scores.consistencyScore,
        docQualityScore: scores.docQualityScore,
        trustScore,
        trustScoreBreakdown: { ocr: scores.ocrConfidence, extraction: scores.extractionConfidence, completeness: qgResult.completenessScore, consistency: scores.consistencyScore, doc_quality: scores.docQualityScore },
        extractedFields: plainFields,
        extractedEntities,
        extractedAttributes: dedupedAttrs,
        qualityGatesPassed: qgResult.passed,
        qualityGatesReport: qgResult,
        rawText: rawText || null,
        modelVersion: "adrs-v1.0",
        processingTimeMs: Date.now() - startTime,
      };

      const parse = insertExtractionRunSchema.safeParse(runPayload);
      if (!parse.success) {
        await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any);
        return res.status(400).json({ error: parse.error });
      }

      const run = await storage.createExtractionRun(parse.data);

      // 8. Store text
      if (rawText) {
        const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
        await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
      }

      // 9. Audit + field events
      await storage.createAuditLog({ action: "EXTRACTION_RUN_CREATED", resourceType: "EXTRACTION", resourceId: run.id, userId: req.body.operatorId || "system", details: { doc_type: docType, trust_score: trustScore, field_count: fieldCount, method: "auto_extract" }, tenantId: "TENANT-001" });
      for (const attr of dedupedAttrs) {
        await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", confidence: attr.confidence_score }, tenantId: "TENANT-001" });
      }

      // 10. Auto-create validation tasks
      if (ADRS_CONFIG.features.auto_validation_task_on_conflict && conflictKeys.length > 0) {
        await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: conflictKeys.map(k => k.split(":").slice(1).join(":")), trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: "CONFLICT", approvalPolicyReason: `${conflictKeys.length} field(s) conflict.`, weakFields: conflictKeys });
      }
      if (ADRS_CONFIG.features.auto_validation_task_on_low_trust && trustScore < ADRS_CONFIG.thresholds.auto_validation_task) {
        const pendingFields = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
        await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: pendingFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: "LOW_TRUST", approvalPolicyReason: `Trust score ${(trustScore * 100).toFixed(0)}% below threshold.` });
      }

      // 11. Party inference
      if (ADRS_CONFIG.features.auto_party_creation) {
        const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id);
        const inferredDoc = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id);
        let docEntityCode: string | null = null;
        if (inferredDoc) {
          const docEntity = await storage.createCdmEntity(inferredDoc.entity);
          docEntityCode = docEntity.entityCode;
        }
        for (const inf of inferredParties) {
          if (docEntityCode) inf.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: "MENTIONED_IN", confidence: inf.entity.confidenceScore }];
          const party = await storage.createCdmEntity(inf.entity);
          await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: party.entityCode, userId: "system", details: { display_name: party.displayName, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
        }
      }

      // 12. Update evidence status to PROCESSED
      await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSED" } as any);

      res.json({ run, trustScore, docType, fieldCount });
    } catch (e: any) {
      await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any).catch(() => {});
      res.status(500).json({ error: e?.message ?? "Extraction failed" });
    }
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
