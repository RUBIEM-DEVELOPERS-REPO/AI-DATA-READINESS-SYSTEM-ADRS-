import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { insertExtractionRunSchema, insertValidationTaskSchema } from "@shared/schema";
import { tenantIdFromReq, generateCode, stripText, waitForJob } from "./utils";
import { aiExtractDocumentFields, aiTranscribeAudio, aiExtractWithVision, scoreAiExtraction, aiReclassifyDocType, aiClassifyEntityType } from "../services/ai-extraction";
import { extractTextFromFile, isTextExtractionFailure } from "../services/extraction";
import { normalizeExtractedFields, dedupAttributes, runQualityGates, computeTrustScore } from "../services/normalization";
import { ADRS_CONFIG } from "../config";
import { generateEmbedding } from "../services/embeddings";
import { inferParties, inferDocument, inferPartiesFromRawEntities, resolveDocRelationshipType as resolveDocRelType } from "../services/party-inference";
import { jobQueue } from "../queue";
import { requireTenantContext, type TenantContext } from "../middleware/tenant-guard";

const router = Router();

// Apply auth and tenant context globally to all extraction router endpoints
router.use(requireAuth);
router.use(requireTenantContext);

// Background extraction pipeline runner
async function runEvidenceExtractionPipeline(evidenceFile: any, context: { tenantId: string; operatorId?: string; tenantContext: TenantContext }) {
  const isAV = ["AUDIO", "VIDEO"].includes(evidenceFile.mediaType ?? "DOCUMENT");
  const startTime = Date.now();

  try {
    await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSING" } as any, context.tenantContext);

    let rawText = "";
    if (isAV) {
      rawText = await aiTranscribeAudio(evidenceFile.storedUri, evidenceFile.fileName);
    } else {
      rawText = await extractTextFromFile(evidenceFile.storedUri, evidenceFile.fileFormat);
    }

    const VISION_FORMATS = ["pdf", "png", "jpg", "jpeg", "tiff", "tif", "bmp", "gif", "webp"];
    const useVision = !isAV && isTextExtractionFailure(rawText) && VISION_FORMATS.includes(evidenceFile.fileFormat.toLowerCase());
    const aiResult = useVision
      ? await aiExtractWithVision(evidenceFile.storedUri, evidenceFile.fileName, evidenceFile.fileFormat, rawText)
      : await aiExtractDocumentFields(rawText, evidenceFile.fileName);
    const docType = aiResult.docType;
    const docTypeConfidence = aiResult.docTypeConfidence;
    const fieldCount = Object.keys(aiResult.fields).length;

    const scores = scoreAiExtraction(aiResult.fields, docType, docTypeConfidence);

    const plainFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(aiResult.fields)) {
      if (v?.value != null && String(v.value).trim() !== "") {
        plainFields[k] = String(v.value).trim();
      }
    }

    const rawAttrs = normalizeExtractedFields(aiResult.fields as Record<string, any>, aiResult.entities);
    const { deduped: dedupedAttrs, conflictKeys, conflictDetails } = dedupAttributes(rawAttrs);
    const qgResult = runQualityGates(docType, dedupedAttrs, scores.ocrConfidence);
    const trustScore = computeTrustScore(scores.ocrConfidence, scores.extractionConfidence, qgResult.completenessScore, scores.consistencyScore, scores.docQualityScore);

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
      extractedEntities: aiResult.entities,
      extractedAttributes: dedupedAttrs,
      qualityGatesPassed: qgResult.passed,
      qualityGatesReport: qgResult,
      rawText: useVision ? `[Vision extraction used — ${aiResult.summary}]` : (rawText || null),
      modelVersion: useVision ? "adrs-vision-v1.0" : "adrs-ai-v2.0",
      processingTimeMs: Date.now() - startTime,
    };

    const parse = insertExtractionRunSchema.safeParse(runPayload);
    if (!parse.success) {
      await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any, context.tenantContext);
      throw new Error(parse.error.message);
    }

    const run = await storage.createExtractionRun(parse.data);

    if (rawText) {
      const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
      await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);

      generateEmbedding(rawText).then(async (vector) => {
        await storage.createChunkEmbedding({
          extractionTextId: etxt.id,
          evidenceId: run.evidenceId,
          embedding: vector,
          tokenCount: Math.ceil(rawText.length / 4),
        });
      }).catch(err => console.error("[Layer 4] Embedding generation failed:", err));
    }

    await storage.createAuditLog({ action: "EXTRACTION_RUN_CREATED", resourceType: "EXTRACTION", resourceId: run.id, userId: context.operatorId || "system", details: { doc_type: docType, trust_score: trustScore, field_count: fieldCount, method: "auto_extract" }, tenantId: context.tenantId });
    for (const attr of dedupedAttrs) {
      await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", confidence: attr.confidence_score }, tenantId: context.tenantId });
    }

    const hasConflicts10 = conflictKeys.length > 0;
    const isLowTrust10 = trustScore < ADRS_CONFIG.thresholds.auto_validation_task;
    if (hasConflicts10 || isLowTrust10) {
      const conflictFieldKeys = conflictKeys.map(k => k.split(":").slice(1).join(":"));
      const pendingFieldKeys = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
      const allFields = [...new Set([...conflictFieldKeys, ...pendingFieldKeys])];
      const reasons: string[] = [];
      if (hasConflicts10) reasons.push(`${conflictKeys.length} field conflict(s) require resolution`);
      if (isLowTrust10) reasons.push(`trust score ${(trustScore * 100).toFixed(0)}% is below the ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}% threshold`);
      const rule = hasConflicts10 ? "CONFLICT" : "LOW_TRUST";
      await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: allFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: rule, approvalPolicyReason: `Requires human review: ${reasons.join("; ")}.`, weakFields: hasConflicts10 ? conflictKeys : undefined, conflictDetails: hasConflicts10 ? conflictDetails : undefined } as any);
      await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: rule, has_conflicts: hasConflicts10, conflict_count: conflictKeys.length, trust_score: trustScore, threshold: ADRS_CONFIG.thresholds.auto_validation_task }, tenantId: context.tenantId });
    }

    if (ADRS_CONFIG.features.auto_party_creation) {
      const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id, context.tenantId);
      const inferredDoc = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id, context.tenantId, evidenceFile.fileName);
      let docEntityCode: string | null = null;
      if (inferredDoc) {
        const docEntity = await storage.createCdmEntity(inferredDoc.entity);
        docEntityCode = docEntity.entityCode;
        await storage.createAuditLog({ action: "AUTO_DOC_INFERRED", resourceType: "CDM", resourceId: docEntity.entityCode, userId: "system", details: { display_name: docEntity.displayName, evidence_id: run.evidenceId }, tenantId: context.tenantId });
      }

      const fieldInferredNames = new Set<string>(
        inferredParties.map(p =>
          p.entity.displayName.toLowerCase().split(/[\s,.,\-&\/]+/).filter(Boolean).sort().join(" ")
        )
      );

      const rawEntityParties = inferPartiesFromRawEntities(aiResult.entities, run.evidenceId, run.id, context.tenantId, fieldInferredNames);

      for (const inf of [...inferredParties, ...rawEntityParties]) {
        if (docEntityCode) {
          const relType = resolveDocRelType(inf.sourceAttrKeys, docType);
          inf.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: relType, confidence: inf.entity.confidenceScore, evidence_id: run.evidenceId }];
        }
        const party = await storage.createCdmEntity(inf.entity);
        await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: party.entityCode, userId: "system", details: { display_name: party.displayName, entity_type: party.entityType, evidence_id: run.evidenceId }, tenantId: context.tenantId });
      }
    }

    await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSED" } as any, context.tenantContext);
    return { run, trustScore, docType, fieldCount };
  } catch (error) {
    await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any, context.tenantContext).catch(() => {});
    throw error;
  }
}

// ─── One-click file extraction with Async Job Queue wiring ───────────────────
router.post("/evidence/:id/extract", requireRole("ANALYST"), async (req: any, res: any) => {
  const evidenceFile = await storage.getEvidenceFile(req.params.id, req.tenantContext);
  if (!evidenceFile) return res.status(404).json({ error: "Evidence file not found" });

  const tenantId = req.tenantContext.tenantId;
  const operatorId = (req.user as any)?.id || "system";

  try {
    // 1. Update status to PROCESSING
    await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSING" } as any, req.tenantContext);

    // 2. Enqueue in the background JobQueue
    const job = jobQueue.enqueue(
      `evidence-extraction-${evidenceFile.id}`,
      async () => {
        return await runEvidenceExtractionPipeline(evidenceFile, { tenantId, operatorId, tenantContext: req.tenantContext });
      },
      undefined,
      { maxAttempts: 2 },
      tenantId
    );

    // 3. Return 202 instantly if client specifically requests async flow
    const isAsync = req.query.async === "true";
    if (isAsync) {
      return res.status(202).json({ jobId: job.id, status: "queued", message: "Extraction job queued" });
    }

    // 4. Otherwise (default), wait for background task execution to resolve
    const completedJob = await waitForJob(job.id);
    if (completedJob.status === "completed") {
      return res.json(completedJob.result);
    } else {
      return res.status(500).json({ error: completedJob.error || "Background extraction job failed" });
    }
  } catch (e: any) {
    await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any, req.tenantContext).catch(() => {});
    res.status(500).json({ error: e?.message ?? "Extraction failed" });
  }
});

// ─── Extraction Runs ────────────────────────────────────────────────────────
router.get("/extractions", async (req: any, res: any) => {
  const runs = await storage.getExtractionRuns(req.tenantContext);
  const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
  res.json(includeText ? runs : runs.map(stripText));
});

router.get("/extractions/:id", async (req: any, res: any) => {
  const run = await storage.getExtractionRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Not found" });
  const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
  res.json(includeText ? run : stripText(run));
});

router.get("/extractions/:id/text", async (req: any, res: any) => {
  const run = await storage.getExtractionRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Not found" });
  if (run.extractionTextId) {
    const txt = await storage.getExtractionText(run.extractionTextId);
    if (txt) return res.json({ extraction_text_id: txt.id, evidence_id: txt.evidenceId, text: txt.text, char_count: txt.charCount, page_number: txt.pageNumber });
  }
  res.json({ extraction_text_id: null, evidence_id: run.evidenceId, text: run.rawText ?? "", char_count: (run.rawText ?? "").length });
});

router.post("/extractions", requireRole("ANALYST"), async (req: any, res: any) => {
  const tenantId = req.tenantContext.tenantId;
  const { extractedFields = {}, extractedEntities = [], ocrConfidence = 0, docType = "OTHER", rawText = "", ...rest } = req.body;

  const rawAttrs = normalizeExtractedFields(extractedFields, extractedEntities);
  const { deduped: dedupedAttrs, conflictKeys, conflictDetails } = dedupAttributes(rawAttrs);
  const qgResult  = runQualityGates(docType, dedupedAttrs, ocrConfidence);
  const { extractionConfidence = 0, consistencyScore = 0, docQualityScore = 0 } = rest;
  const trustScore = computeTrustScore(ocrConfidence, extractionConfidence, qgResult.completenessScore, consistencyScore, docQualityScore);

  const parse = insertExtractionRunSchema.safeParse({
    ...rest, extractedFields, extractedEntities, ocrConfidence, docType, rawText,
    trustScore, trustScoreBreakdown: { ocr: ocrConfidence, extraction: extractionConfidence, completeness: qgResult.completenessScore, consistency: consistencyScore, doc_quality: docQualityScore },
    extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
  });
  if (!parse.success) return res.status(400).json({ error: parse.error });

  const run = await storage.createExtractionRun(parse.data);

  if (rawText) {
    const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
    await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
  }

  for (const attr of dedupedAttrs) {
    await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", value_normalized: attr.value_normalized, confidence: attr.confidence_score }, tenantId });
  }

  const hasConflicts56 = conflictKeys.length > 0;
  const isLowTrust56   = trustScore < ADRS_CONFIG.thresholds.auto_validation_task;
  if (hasConflicts56 || isLowTrust56) {
    const conflictFieldKeys = conflictKeys.map(k => k.split(":").slice(1).join(":"));
    const pendingFieldKeys  = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
    const allFields = [...new Set([...conflictFieldKeys, ...pendingFieldKeys])];
    const reasons: string[] = [];
    if (hasConflicts56) reasons.push(`${conflictKeys.length} field conflict(s) require resolution`);
    if (isLowTrust56) reasons.push(`trust score ${(trustScore * 100).toFixed(0)}% is below the ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}% threshold`);
    const rule = hasConflicts56 ? "CONFLICT" : "LOW_TRUST";
    await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: allFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: rule, approvalPolicyReason: `Requires human review: ${reasons.join("; ")}.`, weakFields: hasConflicts56 ? conflictKeys : undefined, conflictDetails: hasConflicts56 ? conflictDetails : undefined } as any);
    await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: rule, has_conflicts: hasConflicts56, conflict_count: conflictKeys.length, trust_score: trustScore, threshold: ADRS_CONFIG.thresholds.auto_validation_task }, tenantId });
  }

  if (ADRS_CONFIG.features.auto_party_creation) {
    const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id, tenantId);
    const evidenceFile2   = await storage.getEvidenceFile(run.evidenceId, req.tenantContext);
    const inferredDoc     = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id, tenantId, evidenceFile2?.fileName);
    let docEntityCode: string | null = null;

    if (inferredDoc) {
      const docEntity = await storage.createCdmEntity(inferredDoc.entity);
      docEntityCode = docEntity.entityCode;
      await storage.createAuditLog({ action: "AUTO_DOC_INFERRED", resourceType: "CDM", resourceId: docEntity.entityCode, userId: "system", details: { display_name: docEntity.displayName, evidence_id: run.evidenceId }, tenantId });
    }

    const fieldInferredNames = new Set<string>(
      inferredParties.map(p =>
        p.entity.displayName.toLowerCase().split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ")
      )
    );
    const rawEntityParties = inferPartiesFromRawEntities(extractedEntities, run.evidenceId, run.id, tenantId, fieldInferredNames);

    for (const inferred of [...inferredParties, ...rawEntityParties]) {
      if (docEntityCode) {
        const relType = resolveDocRelType(inferred.sourceAttrKeys, docType);
        inferred.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: relType, confidence: inferred.entity.confidenceScore, evidence_id: run.evidenceId }];
      }
      const partyEntity = await storage.createCdmEntity(inferred.entity);
      await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: partyEntity.entityCode, userId: "system", details: { entity_type: partyEntity.entityType, display_name: partyEntity.displayName, identifiers: inferred.identifiers.length, evidence_id: run.evidenceId }, tenantId });
    }
  }

  await storage.createAuditLog({ action: "EXTRACTION_COMPLETED", resourceType: "EXTRACTION", resourceId: run.id, userId: "system", details: { doc_type: run.docType, trust_score: run.trustScore, quality_gates_passed: run.qualityGatesPassed, attrs_total: dedupedAttrs.length, attrs_pending: dedupedAttrs.filter(a => a.validation_state === "PENDING").length }, tenantId });

  res.json(ADRS_CONFIG.features.include_text_by_default ? run : stripText(run));
});

// ─── Validation ────────────────────────────────────────────────────────────
router.get("/validation", async (req: any, res: any) => res.json(await storage.getValidationTasks(req.tenantContext)));

router.get("/validation/:id", async (req: any, res: any) => {
  const t = await storage.getValidationTask(req.params.id);
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
});

router.post("/validation", requireRole("ANALYST"), async (req: any, res: any) => {
  const parse = insertValidationTaskSchema.safeParse({ ...req.body, taskCode: generateCode("VAL") });
  if (!parse.success) return res.status(400).json({ error: parse.error });
  res.json(await storage.createValidationTask(parse.data));
});

// Approve / Reject a validation task (triggers CDM enrichment)
router.patch("/validation/:id", requireRole("REVIEWER"), async (req: any, res: any) => {
  const existing = await storage.getValidationTask(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updates: any = { ...req.body };
  if (req.body.status && req.body.status !== existing.status) updates.validatedAt = new Date();
  const task = await storage.updateValidationTask(req.params.id, updates);
  const action = req.body.status === "APPROVED" ? "VALIDATION_APPROVED" : req.body.status === "REJECTED" ? "VALIDATION_REJECTED" : "VALIDATION_UPDATED";
  await storage.createAuditLog({ action, resourceType: "VALIDATION", resourceId: task?.taskCode, userId: req.body.validator ?? "validator", details: { status: req.body.status, notes: req.body.validatorNotes, policy_rule: existing.approvalPolicyRule }, tenantId: req.tenantContext.tenantId });

  if (req.body.status === "APPROVED" && ADRS_CONFIG.features.auto_party_creation) {
    try {
      const run = await storage.getExtractionRun(existing.extractionRunId);
      if (run) {
        const approvedAttrs = ((run.extractedAttributes as any[]) ?? []).map((a: any) => ({
          ...a,
          validation_state: a.validation_state === "PENDING" ? "APPROVED" : a.validation_state,
        }));

        const allEntities = await storage.getCdmEntities(req.tenantContext);
        const existingNames = new Set<string>(
          allEntities
            .filter(e => (e.sourceEvidenceIds ?? []).includes(run.evidenceId))
            .map(e => e.displayName.toLowerCase().trim())
        );

        const tenantId = req.tenantContext.tenantId;
        const newParties = inferParties(approvedAttrs, run.evidenceId, run.docType, run.id, tenantId);
        const rawEntityParties = inferPartiesFromRawEntities(
          (run.extractedEntities as any[]) ?? [],
          run.evidenceId,
          run.id,
          tenantId,
          new Set(Array.from(existingNames).map(n => n.split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ")))
        );

        for (const inf of [...newParties, ...rawEntityParties]) {
          const nameKey = inf.entity.displayName.toLowerCase().trim();
          if (existingNames.has(nameKey)) {
            const existingEntity = allEntities.find(e =>
              (e.sourceEvidenceIds ?? []).includes(run.evidenceId) &&
              e.displayName.toLowerCase().trim() === nameKey
            );
            if (existingEntity && inf.entity.identifiers && (inf.entity.identifiers as any[]).length > 0) {
              const existingIds = (existingEntity.identifiers as any[]) ?? [];
              const existingIdValues = new Set(existingIds.map((id: any) => id.id_value));
              const newIds = (inf.entity.identifiers as any[]).filter((id: any) => !existingIdValues.has(id.id_value));
              if (newIds.length > 0) {
                const mergedIds = [...existingIds, ...newIds];
                const mergedFields = { ...(existingEntity.canonicalFields as any), ...(inf.entity.canonicalFields as any) };
                await storage.updateCdmEntity(existingEntity.id, { identifiers: mergedIds, canonicalFields: mergedFields } as any);
              }
            }
          } else {
            // Set tenantId explicitly
            inf.entity.tenantId = tenantId;
            const party = await storage.createCdmEntity(inf.entity);
            await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: party.entityCode, userId: req.body.validator ?? "validator", details: { display_name: party.displayName, entity_type: party.entityType, evidence_id: run.evidenceId, trigger: "validation_approved" }, tenantId: tenantId });
          }
        }
      }
    } catch (enrichErr: any) {
      console.error("[CDM enrichment] post-approval party inference failed:", enrichErr?.message);
    }
  }

  res.json(task);
});

// Conflict resolution
router.post("/validation/:id/resolve-conflict", requireRole("REVIEWER"), async (req: any, res: any) => {
  const task = await storage.getValidationTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Validation task not found" });

  const { resolutions, resolved_by } = req.body as {
    resolutions: Array<{ field_key: string; chosen_value: string; source: "option_a" | "option_b" | "custom" }>;
    resolved_by?: string;
  };
  if (!Array.isArray(resolutions) || resolutions.length === 0) {
    return res.status(400).json({ error: "resolutions array is required" });
  }

  const resolvedBy = resolved_by ?? (req.user as any)?.username ?? "validator";
  const resolvedAt = new Date().toISOString();

  const run = await storage.getExtractionRun(task.extractionRunId);
  if (!run) return res.status(404).json({ error: "Extraction run not found" });

  const updatedFields: Record<string, any>  = { ...(run.extractedFields as Record<string, any> ?? {}) };
  const updatedAttrs: any[] = JSON.parse(JSON.stringify(run.extractedAttributes ?? []));

  const auditEntries: string[] = [];

  for (const resolution of resolutions) {
    const { field_key, chosen_value, source } = resolution;

    const oldValues = updatedAttrs
      .filter((a: any) => a.field_key === field_key)
      .map((a: any) => ({ value: a.value_normalized, confidence: a.confidence_score, validation_state: a.validation_state }));

    updatedFields[field_key] = chosen_value;

    const winnerIdx = updatedAttrs.findIndex((a: any) => a.field_key === field_key && !a.approval_policy_rule?.includes("CONFLICT"));
    const conflictIdx = updatedAttrs.findIndex((a: any) => a.field_key === field_key && a.approval_policy_rule === "CONFLICT");

    if (winnerIdx !== -1) {
      updatedAttrs[winnerIdx].value_normalized = chosen_value;
      updatedAttrs[winnerIdx].validation_state = "HUMAN_APPROVED";
      updatedAttrs[winnerIdx].approval_policy_rule = "HUMAN_RESOLVED";
      updatedAttrs[winnerIdx].approval_policy_reason = `Conflict resolved by ${resolvedBy}: selected "${chosen_value}" (source: ${source}).`;
    }
    if (conflictIdx !== -1 && conflictIdx !== winnerIdx) {
      updatedAttrs.splice(conflictIdx, 1);
    }

    const auditEntry = await storage.createAuditLog({
      action: "CONFLICT_RESOLVED",
      resourceType: "VALIDATION",
      resourceId: task.taskCode,
      userId: resolvedBy,
      details: {
        field_key,
        chosen_value,
        source,
        old_values: oldValues,
        evidence_id: task.evidenceId,
        extraction_run_id: task.extractionRunId,
        resolved_at: resolvedAt,
      },
      tenantId: req.tenantContext.tenantId,
    });
    auditEntries.push(auditEntry.id);
  }

  await storage.updateExtractionRun(run.id, {
    extractedFields: updatedFields,
    extractedAttributes: updatedAttrs,
  } as any);

  const existingDetails = (task.conflictDetails as any[]) ?? [];
  const resolvedFieldKeys = new Set(resolutions.map(r => r.field_key));
  const updatedDetails = existingDetails.map((d: any) => {
    if (!resolvedFieldKeys.has(d.field_key)) return d;
    const res = resolutions.find(r => r.field_key === d.field_key)!;
    return { ...d, resolved: true, resolved_value: res.chosen_value, resolved_source: res.source, resolved_by: resolvedBy, resolved_at: resolvedAt };
  });

  const allResolved = updatedDetails.every((d: any) => d.resolved);
  const taskUpdate: any = { conflictDetails: updatedDetails, updatedAt: new Date() };
  if (allResolved && task.approvalPolicyRule === "CONFLICT") {
    taskUpdate.approvalPolicyReason = `All ${resolutions.length} field conflict(s) resolved by ${resolvedBy}.`;
  }
  await storage.updateValidationTask(task.id, taskUpdate);

  await storage.createAuditLog({
    action: "CONFLICTS_RESOLVED_BATCH",
    resourceType: "VALIDATION",
    resourceId: task.taskCode,
    userId: resolvedBy,
    details: { resolved_count: resolutions.length, all_conflicts_cleared: allResolved, audit_entry_ids: auditEntries },
    tenantId: req.tenantContext.tenantId,
  });

  res.json({ resolved: resolutions.length, all_conflicts_cleared: allResolved, task_id: task.id });
});

export default router;
