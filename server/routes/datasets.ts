import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { insertCdmEntitySchema, insertDatasetSchema } from "@shared/schema";
import { tenantIdFromReq, generateCode } from "./utils";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { kgNodes, kgEdges, chunkEmbeddings, entityEmbeddings, cdmEntities, evidenceFiles, extractionTexts, extractionRuns, validationTasks } from "@shared/schema";
import { aiClassifyEntityType, aiReclassifyDocType } from "../services/ai-extraction";
import { groupEntitiesForMerge, getSingletonEntityIds } from "../services/golden-records";
import { buildArtifactContents, buildArtifactUris, generateMlCsv, generateBundleZip, generateRunSummary } from "../services/publishing";
import { ADRS_CONFIG } from "../config";
import { normalizeExtractedFields, dedupAttributes, runQualityGates } from "../services/normalization";
import { requireTenantContext } from "../middleware/tenant-guard";

const router = Router();

// Apply auth and tenant context globally to all dataset & cdm router endpoints
router.use(requireAuth);
router.use(requireTenantContext);

// ─── CDM ───────────────────────────────────────────────────────────────────
router.get("/cdm", async (req: any, res: any) => res.json(await storage.getCdmEntities(req.tenantContext)));

router.get("/cdm/golden-records", async (req: any, res: any) => {
  const entities = await storage.getCdmEntities(req.tenantContext);
  const golden   = entities.filter(e => e.isGoldenRecord);
  const summary  = golden.map(g => ({
    ...g,
    absorbedCount: entities.filter(e => e.goldenRecordId === g.id).length,
    absorbed: entities.filter(e => e.goldenRecordId === g.id).map(e => ({
      id: e.id, displayName: e.displayName, entityCode: e.entityCode, entityType: e.entityType,
    })),
  }));
  res.json(summary);
});

router.get("/cdm/run-summary", async (req: any, res: any) => {
  const [entities, extractions, evidenceFilesList] = await Promise.all([
    storage.getCdmEntities(req.tenantContext),
    storage.getExtractionRuns(req.tenantContext),
    storage.getEvidenceFiles(req.tenantContext),
  ]);
  const summary = generateRunSummary(entities, extractions, evidenceFilesList);
  res.json(summary);
});

router.get("/cdm/:id", async (req: any, res: any) => {
  const e = await storage.getCdmEntity(req.params.id);
  if (!e || e.tenantId !== req.tenantContext.tenantId) return res.status(404).json({ error: "Not found" });
  res.json(e);
});

router.post("/cdm", requireRole("ANALYST"), async (req: any, res: any) => {
  const body = { ...req.body, tenantId: req.tenantContext.tenantId, entityCode: req.body.entityCode ?? generateCode(req.body.entityType ?? "ENT") };
  const parse = insertCdmEntitySchema.safeParse(body);
  if (!parse.success) return res.status(400).json({ error: parse.error });
  const entity = await storage.createCdmEntity(parse.data);
  await storage.createAuditLog({ action: "ENTITY_CREATED", resourceType: "CDM", resourceId: entity.entityCode, userId: "system", details: { entity_type: entity.entityType, name: entity.displayName }, tenantId: req.tenantContext.tenantId });
  res.json(entity);
});

router.patch("/cdm/:id", requireRole("ANALYST"), async (req: any, res: any) => {
  const existing = await storage.getCdmEntity(req.params.id);
  if (!existing || existing.tenantId !== req.tenantContext.tenantId) return res.status(404).json({ error: "Not found" });
  const entity = await storage.updateCdmEntity(req.params.id, req.body);
  if (!entity) return res.status(404).json({ error: "Not found" });
  res.json(entity);
});

// CDM entity / document AI reclassification
router.post("/cdm/reclassify", requireRole("ANALYST"), async (req: any, res: any) => {
  const results = {
    entitiesScanned: 0,
    entitiesReclassified: 0,
    docTypesScanned: 0,
    docTypesReclassified: 0,
    details: [] as Array<{ id: string; field: string; from: string; to: string }>,
  };

  const entities = await storage.getCdmEntities(req.tenantContext);
  const partyEntities = entities.filter(e => e.entityType === "PERSON" || e.entityType === "ORGANIZATION");
  results.entitiesScanned = partyEntities.length;

  for (const entity of partyEntities) {
    const fields = entity.canonicalFields as Record<string, any>;
    const { entityType: aiType, confidence } = await aiClassifyEntityType(entity.displayName, fields);
    if (aiType !== entity.entityType && confidence >= 0.75) {
      await storage.updateCdmEntity(entity.id, { entityType: aiType } as any);
      await storage.createAuditLog({
        action: "ENTITY_RECLASSIFIED",
        resourceType: "CDM",
        resourceId: entity.entityCode,
        userId: "system",
        details: { from: entity.entityType, to: aiType, confidence, display_name: entity.displayName },
        tenantId: req.tenantContext.tenantId,
      });
      results.entitiesReclassified++;
      results.details.push({ id: entity.id, field: "entityType", from: entity.entityType, to: aiType });
    }
  }

  const runs = await storage.getExtractionRuns(req.tenantContext);
  const otherRuns = runs.filter(r => r.docType === "OTHER");
  results.docTypesScanned = otherRuns.length;

  for (const run of otherRuns) {
    let text = run.rawText ?? "";
    if (!text && run.extractionTextId) {
      const etxt = await storage.getExtractionText(run.extractionTextId);
      if (etxt) text = etxt.text;
    }
    const evid = await storage.getEvidenceFile(run.evidenceId, req.tenantContext);
    const fileName = evid?.fileName ?? "document";
    const { docType: newType, confidence } = await aiReclassifyDocType(text, fileName);
    if (newType !== "OTHER" && confidence >= 0.65) {
      await storage.updateExtractionRun(run.id, { docType: newType } as any);
      const linkedDoc = entities.find(e => e.entityType === "DOCUMENT" && e.sourceEvidenceIds?.includes(run.evidenceId));
      if (linkedDoc) {
        const updatedFields = { ...(linkedDoc.canonicalFields as Record<string, any>), doc_type: newType };
        await storage.updateCdmEntity(linkedDoc.id, { canonicalFields: updatedFields } as any);
      }
      await storage.createAuditLog({
        action: "DOC_TYPE_RECLASSIFIED",
        resourceType: "EXTRACTION",
        resourceId: run.id,
        userId: "system",
        details: { from: "OTHER", to: newType, confidence, file_name: fileName },
        tenantId: req.tenantContext.tenantId,
      });
      results.docTypesReclassified++;
      results.details.push({ id: run.id, field: "docType", from: "OTHER", to: newType });
    }
  }

  res.json(results);
});

// CDM golden records computation
router.post("/cdm/golden-records/compute", requireRole("ANALYST"), async (req: any, res: any) => {
  const tenantId = req.tenantContext.tenantId;
  const entities = await storage.getCdmEntities(req.tenantContext);
  const groups   = groupEntitiesForMerge(entities);

  let promoted    = 0;
  let merged      = 0;
  let quarantined = 0;
  let singletonPromoted = 0;
  const detail: Array<{ golden: string; absorbed: string[]; reasons: string[]; is_quarantined: boolean; explanation: string[] }> = [];

  for (const group of groups) {
    const goldenEntity = entities.find(e => e.id === group.goldenEntityId);
    const absorbedEntities = group.mergedEntityIds.map(id => entities.find(e => e.id === id)).filter(Boolean) as typeof entities;

    const allEvidenceIds = [
      ...((goldenEntity?.sourceEvidenceIds ?? []) as string[]),
      ...absorbedEntities.flatMap(e => (e.sourceEvidenceIds ?? []) as string[]),
    ];
    const mergedEvidenceIds = [...new Set(allEvidenceIds)];

    const goldenIds: any[] = (goldenEntity?.identifiers as any[]) ?? [];
    const existingIdValues = new Set(goldenIds.map((id: any) => id.id_value));
    const absorbedIds = absorbedEntities.flatMap(e => (e.identifiers as any[]) ?? []);
    for (const id of absorbedIds) {
      if (!existingIdValues.has(id.id_value)) { goldenIds.push(id); existingIdValues.add(id.id_value); }
    }

    const mergedFields = Object.keys(group.mergedCanonicalFields).length > 0
      ? group.mergedCanonicalFields
      : (() => {
          const f: Record<string, any> = {};
          for (const abs of absorbedEntities) Object.assign(f, abs.canonicalFields as Record<string, any>);
          Object.assign(f, goldenEntity?.canonicalFields as Record<string, any>);
          return f;
        })();

    const goldenLifecycle = group.isQuarantined ? "QUARANTINED" : "GOLDEN";
    const goldenLifecycleReason = group.isQuarantined
      ? group.quarantineReason
      : `Golden record computed: merged ${group.mergedEntityIds.length + 1} entities by ${group.matchReasons.join(" + ")}`;

    await storage.updateCdmEntity(group.goldenEntityId, {
      isGoldenRecord: !group.isQuarantined,
      goldenRecordId: null,
      sourceEvidenceIds: mergedEvidenceIds,
      identifiers: goldenIds,
      canonicalFields: mergedFields,
      entityLifecycle: goldenLifecycle,
      lifecycleReason: goldenLifecycleReason,
    } as any);
    if (group.isQuarantined) quarantined++; else promoted++;

    for (const absorbedId of group.mergedEntityIds) {
      await storage.updateCdmEntity(absorbedId, {
        isGoldenRecord: false,
        goldenRecordId: group.goldenEntityId,
        entityLifecycle: group.isQuarantined ? "QUARANTINED" : "MERGED",
        lifecycleReason: group.isQuarantined
          ? `Absorbed into quarantined golden record: ${group.quarantineReason}`
          : `Merged into golden record ${group.goldenEntityId}`,
      } as any);
      merged++;
    }

    await storage.createAuditLog({
      action: group.isQuarantined ? "GOLDEN_RECORD_QUARANTINED" : "GOLDEN_RECORD_COMPUTED",
      resourceType: "CDM",
      resourceId: group.goldenEntityId,
      userId: "system",
      details: {
        golden_name:      group.goldenDisplayName,
        merged_count:     group.mergedEntityIds.length,
        match_reasons:    group.matchReasons,
        confidence:       group.confidence,
        evidence_sources: mergedEvidenceIds.length,
        is_quarantined:   group.isQuarantined,
        quarantine_reason: group.quarantineReason,
        field_conflicts:  group.fieldMergeDecisions.filter(d => d.conflict).length,
        explanation:      group.explanation,
      },
      tenantId,
    });

    detail.push({ golden: group.goldenDisplayName, absorbed: group.mergedEntityIds, reasons: group.matchReasons, is_quarantined: group.isQuarantined, explanation: group.explanation });
  }

  if (ADRS_CONFIG.lifecycle.auto_promote_singletons) {
    const singletons = getSingletonEntityIds(entities, groups);
    for (const singleton of singletons) {
      const entity = entities.find(e => e.id === singleton.entityId);
      if (!entity) continue;
      const currentLifecycle = (entity as any).entityLifecycle as string | null;
      if (currentLifecycle === "GOLDEN") continue;
      if (currentLifecycle === "QUARANTINED" || currentLifecycle === "REJECTED") continue;

      await storage.updateCdmEntity(singleton.entityId, {
        isGoldenRecord: true,
        goldenRecordId: null,
        entityLifecycle: "GOLDEN",
        lifecycleReason: singleton.lifecycleReason,
      } as any);
      singletonPromoted++;

      await storage.createAuditLog({
        action: "SINGLETON_PROMOTED_TO_GOLDEN",
        resourceType: "CDM",
        resourceId: singleton.entityId,
        userId: "system",
        details: { display_name: singleton.displayName, entity_type: singleton.entityType, confidence: singleton.confidence },
        tenantId,
      });
    }
  }

  res.json({
    goldenGroupsFound:   groups.length,
    entitiesPromoted:    promoted,
    entitiesMerged:      merged,
    entitiesQuarantined: quarantined,
    singletonsPromotedToGolden: singletonPromoted,
    detail,
  });
});

// ─── Datasets ──────────────────────────────────────────────────────────────
router.get("/datasets", async (req: any, res: any) => res.json(await storage.getPublishedDatasets(req.tenantContext)));

router.get("/datasets/:id", async (req: any, res: any) => {
  const d = await storage.getPublishedDataset(req.params.id);
  if (!d || d.tenantId !== req.tenantContext.tenantId) return res.status(404).json({ error: "Not found" });
  res.json(d);
});

// Download Artifacts (CSV for ML, JSONL for Knowledge Graph, ZIP Bundle)
router.get("/datasets/:code/artifact", async (req: any, res: any) => {
  const datasets = await storage.getPublishedDatasets(req.tenantContext);
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
    kg_graph:       contents.kg_graph ?? [],
    kg_entities:    contents.kg_entities,
    kg_identifiers: contents.kg_identifiers,
    kg_edges:       contents.kg_edges,
    rag_chunks:     contents.rag_chunks,
    dataset_card:   [contents.dataset_card],
  };
  const data = jsonlMap[type];
  if (!data) return res.status(400).json({ error: `Unknown artifact type: ${type}` });
  const jsonl = data.map((r: any) => JSON.stringify(r)).join("\n");
  res.setHeader("Content-Disposition", `attachment; filename="${type}_${dataset.datasetCode}_v${dataset.version}.jsonl"`);
  res.setHeader("Content-Type", "application/x-ndjson");
  res.send(jsonl);
});

router.post("/datasets", requireRole("ANALYST"), async (req: any, res: any) => {
  const tenantId = req.tenantContext.tenantId;
  const body = { ...req.body, datasetCode: generateCode("DS"), tenantId };
  const parse = insertDatasetSchema.safeParse(body);
  if (!parse.success) return res.status(400).json({ error: parse.error });
  const dataset = await storage.createPublishedDataset(parse.data);
  await storage.createAuditLog({ action: "DATASET_CREATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: dataset.name, version: dataset.version }, tenantId });
  res.json(dataset);
});

// Publish with quality trust gates and override
router.post("/datasets/:id/publish", requireRole("ADMIN"), async (req: any, res: any) => {
  req.body = req.body ?? {};
  const dataset = await storage.getPublishedDataset(req.params.id);
  if (!dataset || dataset.tenantId !== req.tenantContext.tenantId) return res.status(404).json({ error: "Not found" });

  const allEntities     = await storage.getCdmEntities(req.tenantContext);
  const allExtractions  = await storage.getExtractionRuns(req.tenantContext);
  const allEvidenceFiles = await storage.getEvidenceFiles(req.tenantContext);

  const scope = (dataset as any).scope ?? "CROSS_BATCH";
  const sourceBatchIds: string[] = (dataset as any).sourceBatchIds ?? [];

  const scopedEvidence = scope === "SINGLE_BATCH" && sourceBatchIds.length > 0
    ? allEvidenceFiles.filter(e => e.batchId && sourceBatchIds.includes(e.batchId))
    : allEvidenceFiles;

  const scopedEvidenceIds = new Set(scopedEvidence.map(e => e.id));
  const scopedExtractions = allExtractions.filter(r => scopedEvidenceIds.has(r.evidenceId));
  const scopedEntities    = allEntities.filter(e => (e.sourceEvidenceIds ?? []).some(id => scopedEvidenceIds.has(id)));

  const entities     = scopedEntities;
  const extractions  = scopedExtractions;
  const evidenceFilesList = scopedEvidence;
  const evidenceMap  = new Map(evidenceFilesList.map(e => [e.id, e]));

  const tenantId = req.tenantContext.tenantId;

  // Quality check average trust score gating
  if (ADRS_CONFIG.features.publish_trust_blocking) {
    const datasetTrustScore = dataset.qualityScore;
    const threshold = ADRS_CONFIG.thresholds.publish_trust_block;
    if (datasetTrustScore < threshold) {
      const { override, overrideReason } = req.body;
      if (!override) {
        const blockingReason = `Dataset quality score ${(datasetTrustScore * 100).toFixed(0)}% is below the publishing threshold of ${(threshold * 100).toFixed(0)}%.`;
        await storage.createAuditLog({ action: "PUBLISH_BLOCKED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { avg_trust_score: datasetTrustScore, threshold, reason: blockingReason }, tenantId });
        return res.status(422).json({ blocked: true, avg_trust_score: datasetTrustScore, threshold, reason: blockingReason });
      }
      await storage.createAuditLog({ action: "PUBLISH_OVERRIDE", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { override_reason: overrideReason, avg_trust_score: datasetTrustScore, threshold }, tenantId });
    }
  }

  const artifacts    = buildArtifactContents(dataset, entities, extractions, evidenceMap);
  const artifactUris = buildArtifactUris(dataset.datasetCode, dataset.version);
  const kgNodesCount = artifacts.kg_graph.filter((r: any) => r.record_type === "NODE").length;
  const kgEdgesCount = artifacts.kg_graph.filter((r: any) => r.record_type === "EDGE").length;
  const updated      = await storage.updatePublishedDataset(req.params.id, { status: "PUBLISHED", publishedAt: new Date(), publishedBy: (req.user as any)?.id ?? "system", datasetCard: artifacts.dataset_card, artifactUris, artifactContents: artifacts, formats: ["ML_FEATURES", "KG_GRAPH", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"] });

  await storage.createAuditLog({ action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "system", details: { artifacts: ["ml_features.csv", "kg_graph.jsonl", "kg_entities.jsonl", "kg_identifiers.jsonl", "kg_edges.jsonl", "rag_chunks.jsonl", "bundle.zip"], quality_gates_passed: artifacts.quality_gates.overall_passed }, tenantId });
  await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: dataset.name, version: dataset.version, ml_rows: artifacts.ml_features.length, kg_nodes: kgNodesCount, kg_edges: kgEdgesCount, rag_chunks: artifacts.rag_chunks.length }, tenantId });

  res.json({ dataset: updated, ml: artifacts.ml_features.length, kg_nodes: kgNodesCount, kg_edges: kgEdgesCount, kg_entities: artifacts.kg_entities.length, kg_identifiers: artifacts.kg_identifiers.length, rag_chunks: artifacts.rag_chunks.length, quality_gates: artifacts.quality_gates });
});

router.patch("/datasets/:id", requireRole("ADMIN"), async (req: any, res: any) => {
  const existing = await storage.getPublishedDataset(req.params.id);
  if (!existing || existing.tenantId !== req.tenantContext.tenantId) return res.status(404).json({ error: "Not found" });
  const updated = await storage.updatePublishedDataset(req.params.id, req.body);
  if (req.body.status === "PUBLISHED") await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: existing.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: existing.name, version: existing.version }, tenantId: req.tenantContext.tenantId });
  res.json(updated);
});

// Normalization preview
router.post("/normalize/preview", requireRole("ANALYST"), async (req: any, res: any) => {
  const { fields = {}, entities = [] } = req.body;
  const rawAttrs = normalizeExtractedFields(fields, entities);
  const { deduped, conflictKeys } = dedupAttributes(rawAttrs);
  res.json({ attributes: deduped, total: deduped.length, pending: deduped.filter((a: any) => a.validation_state === "PENDING").length, approved: deduped.filter((a: any) => a.validation_state === "AUTO_APPROVED").length, conflicts: conflictKeys });
});

export default router;
