import JSZip from "jszip";
import type {
  CdmEntity, PublishedDataset, ExtractionRun, EvidenceFile,
  MlFeatureRow, KgEntityRow, KgEdgeRow, RagChunkRow, DatasetCard, DatasetArtifactUris
} from "@shared/schema";

// ─── CSV generation ───────────────────────────────────────────────────────────
function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.map(escape).join(",");
  const body   = rows.map(r => cols.map(c => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

// ─── JSONL generation ─────────────────────────────────────────────────────────
function toJsonl(rows: any[]): string {
  return rows.map(r => JSON.stringify(r)).join("\n");
}

// ─── ML Features Artifact ─────────────────────────────────────────────────────
export function generateMlFeatures(entities: CdmEntity[]): MlFeatureRow[] {
  return entities.map((entity) => {
    const fields = entity.canonicalFields as Record<string, any>;
    const row: MlFeatureRow = {
      entity_id:            entity.entityCode,
      entity_type:          entity.entityType,
      display_name:         entity.displayName,
      confidence_score:     entity.confidenceScore,
      is_golden_record:     entity.isGoldenRecord ? 1 : 0,
      schema_version:       entity.schemaVersion,
      source_evidence_count: (entity.sourceEvidenceIds ?? []).length,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) row[`feat_${k}`] = typeof v === "number" ? v : String(v);
    }
    return row;
  });
}

// ─── Knowledge Graph Artifacts ────────────────────────────────────────────────
export function generateKgEntities(entities: CdmEntity[]): KgEntityRow[] {
  return entities.map((entity) => ({
    entity_id:        entity.entityCode,
    entity_type:      entity.entityType,
    display_name:     entity.displayName,
    golden_record_id: entity.goldenRecordId ?? undefined,
    is_golden_record: entity.isGoldenRecord,
    fields:           entity.canonicalFields as Record<string, any>,
    identifiers:      (entity.identifiers as any[]) ?? [],
    evidence_ids:     entity.sourceEvidenceIds ?? [],
    confidence_score: entity.confidenceScore,
  }));
}

export function generateKgEdges(entities: CdmEntity[]): KgEdgeRow[] {
  const edges: KgEdgeRow[] = [];
  const relationships = entities.flatMap(e =>
    ((e.relationships as any[]) ?? []).map((r: any) => ({ ...r, sourceId: e.entityCode }))
  );
  for (const rel of relationships) {
    edges.push({
      edge_id:            `EDGE-${rel.sourceId}-${rel.target_entity_id}-${rel.relationship_type}`,
      source_entity_id:   rel.sourceId,
      target_entity_id:   rel.target_entity_id,
      relationship_type:  rel.relationship_type,
      confidence:         rel.confidence ?? 0.9,
      evidence_id:        rel.evidence_id,
    });
  }
  // Implicit MENTIONED_IN edges from shared evidence
  const docEntities   = entities.filter(e => e.entityType === "DOCUMENT");
  const partyEntities = entities.filter(e => e.entityType === "PERSON" || e.entityType === "ORGANIZATION");
  for (const doc of docEntities) {
    for (const party of partyEntities) {
      const shared = (doc.sourceEvidenceIds ?? []).some(id => (party.sourceEvidenceIds ?? []).includes(id));
      if (shared) {
        const edgeId = `EDGE-${party.entityCode}-${doc.entityCode}-MENTIONED_IN`;
        if (!edges.find(e => e.edge_id === edgeId)) {
          edges.push({ edge_id: edgeId, source_entity_id: party.entityCode, target_entity_id: doc.entityCode, relationship_type: "MENTIONED_IN", confidence: Math.min(doc.confidenceScore, party.confidenceScore) });
        }
      }
    }
  }
  return edges;
}

export function generateKgIdentifiers(entities: CdmEntity[]): Array<{
  identifier_id: string; entity_id: string; id_type: string; id_value: string; is_verified: boolean;
}> {
  const result: ReturnType<typeof generateKgIdentifiers> = [];
  for (const entity of entities) {
    const identifiers = (entity.identifiers as any[]) ?? [];
    for (const id of identifiers) {
      result.push({ identifier_id: `ID-${entity.entityCode}-${id.id_type_label}`, entity_id: entity.entityCode, id_type: id.id_type_label, id_value: id.id_value, is_verified: id.is_verified ?? false });
    }
    const fields = entity.canonicalFields as Record<string, any>;
    if (fields.email && !identifiers.find((i: any) => i.id_type_label === "Email")) {
      result.push({ identifier_id: `ID-${entity.entityCode}-email`, entity_id: entity.entityCode, id_type: "Email", id_value: fields.email, is_verified: true });
    }
    if (fields.phone && !identifiers.find((i: any) => i.id_type_label === "Phone")) {
      result.push({ identifier_id: `ID-${entity.entityCode}-phone`, entity_id: entity.entityCode, id_type: "Phone", id_value: fields.phone, is_verified: false });
    }
    if ((fields.national_id ?? fields.registration_number) && !identifiers.find((i: any) => i.id_type_label === "Registration")) {
      const idVal = fields.national_id ?? fields.registration_number;
      result.push({ identifier_id: `ID-${entity.entityCode}-reg`, entity_id: entity.entityCode, id_type: "Registration", id_value: idVal, is_verified: true });
    }
  }
  return result;
}

// ─── RAG/LLM Artifact ─────────────────────────────────────────────────────────
export function generateRagChunks(
  extractions: ExtractionRun[],
  evidenceMap: Map<string, EvidenceFile>,
  entityMap: Map<string, CdmEntity>
): RagChunkRow[] {
  const chunks: RagChunkRow[] = [];
  for (const run of extractions) {
    if (!run.rawText) continue;
    const evidence = evidenceMap.get(run.evidenceId);
    const docTitle = evidence?.fileName ?? "Unknown";
    const linkedEntities = Array.from(entityMap.values())
      .filter(e => (e.sourceEvidenceIds ?? []).includes(run.evidenceId))
      .map(e => e.entityCode);
    const paragraphs = run.rawText.split(/\n{2,}/).filter(p => p.trim().length > 30);
    if (paragraphs.length > 0) {
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (para.length < 20) continue;
        chunks.push({ chunk_id: `CHUNK-${run.id}-P${String(i + 1).padStart(3, "0")}`, text: para, evidence_id: run.evidenceId, page_number: i + 1, document_title: docTitle, linked_entity_ids: linkedEntities, trust_score: run.trustScore, validation_state: run.trustScore >= 0.80 ? "VALIDATED" : "UNVALIDATED" });
      }
    } else {
      chunks.push({ chunk_id: `CHUNK-${run.id}-P001`, text: run.rawText.trim().slice(0, 2000), evidence_id: run.evidenceId, document_title: docTitle, linked_entity_ids: linkedEntities, trust_score: run.trustScore, validation_state: run.trustScore >= 0.80 ? "VALIDATED" : "UNVALIDATED" });
    }
  }
  return chunks;
}

// ─── Dataset Card ─────────────────────────────────────────────────────────────
export function generateDatasetCard(
  dataset: Partial<PublishedDataset>,
  entities: CdmEntity[],
  extractions: ExtractionRun[],
  mlFeatures: MlFeatureRow[],
  kgEntities: KgEntityRow[],
  kgEdges: KgEdgeRow[],
  ragChunks: RagChunkRow[]
): DatasetCard {
  const avgConfidence = entities.length ? entities.reduce((s, e) => s + e.confidenceScore, 0) / entities.length : 0;
  const avgTrust      = extractions.length ? extractions.reduce((s, e) => s + e.trustScore, 0) / extractions.length : 0;
  const allAttrs      = extractions.flatMap(e => (e.extractedAttributes as any[]) ?? []);
  const totalAttrs    = allAttrs.length;
  const autoApproved  = allAttrs.filter((a: any) => a.validation_state === "AUTO_APPROVED").length;
  const humanApproved = allAttrs.filter((a: any) => a.validation_state === "APPROVED").length;
  const pending       = allAttrs.filter((a: any) => a.validation_state === "PENDING").length;
  const rejected      = allAttrs.filter((a: any) => a.validation_state === "REJECTED").length;
  const normSuccess   = allAttrs.filter((a: any) => a.normalization_status === "SUCCESS").length;
  const lineageInfo   = dataset.lineageInfo as Record<string, any> ?? {};
  const sourceEvids   = entities.flatMap(e => e.sourceEvidenceIds ?? []);
  return {
    schema_version: "1.1",
    dataset_version: dataset.version ?? "1.0.0",
    dataset_code: dataset.datasetCode ?? "",
    name: dataset.name ?? "",
    description: dataset.description ?? undefined,
    generated_at: new Date().toISOString(),
    lineage: { source_batches: lineageInfo.source_batches ?? [], source_evidence_ids: [...new Set(sourceEvids)], pipeline_version: lineageInfo.pipeline_version ?? "1.0", extraction_model_version: extractions[0]?.modelVersion ?? "v1.0" },
    quality_metrics: { total_records: dataset.recordCount ?? entities.length, avg_confidence: Math.round(avgConfidence * 1000) / 1000, avg_trust_score: Math.round(avgTrust * 1000) / 1000, approved_pct: totalAttrs > 0 ? Math.round((autoApproved + humanApproved) / totalAttrs * 100) : 0, pending_pct: totalAttrs > 0 ? Math.round(pending / totalAttrs * 100) : 0, normalization_success_pct: totalAttrs > 0 ? Math.round(normSuccess / totalAttrs * 100) : 0 },
    validation_summary: { total_attributes: totalAttrs, auto_approved: autoApproved, human_approved: humanApproved, pending, rejected },
    artifacts: { ml_features: { rows: mlFeatures.length, columns: mlFeatures[0] ? Object.keys(mlFeatures[0]) : [] }, kg_entities: { count: kgEntities.length }, kg_edges: { count: kgEdges.length }, rag_chunks: { count: ragChunks.length, avg_chunk_length: ragChunks.length ? Math.round(ragChunks.reduce((s, c) => s + c.text.length, 0) / ragChunks.length) : 0 } },
    approvals: dataset.publishedBy ? [{ role: "Dataset Publisher", user: dataset.publishedBy, timestamp: dataset.publishedAt?.toISOString() ?? new Date().toISOString() }] : [],
  };
}

// ─── Build all artifacts ──────────────────────────────────────────────────────
export interface ArtifactContents {
  ml_features: MlFeatureRow[];
  kg_entities: KgEntityRow[];
  kg_identifiers: ReturnType<typeof generateKgIdentifiers>;
  kg_edges: KgEdgeRow[];
  rag_chunks: RagChunkRow[];
  dataset_card: DatasetCard;
}

export function buildArtifactContents(
  dataset: Partial<PublishedDataset>,
  entities: CdmEntity[],
  extractions: ExtractionRun[],
  evidenceMap: Map<string, EvidenceFile>
): ArtifactContents {
  const entityMap  = new Map(entities.map(e => [e.id, e]));
  const mlFeatures = generateMlFeatures(entities);
  const kgEntities = generateKgEntities(entities);
  const kgIdentifiers = generateKgIdentifiers(entities);
  const kgEdges    = generateKgEdges(entities);
  const ragChunks  = generateRagChunks(extractions, evidenceMap, entityMap);
  const datasetCard = generateDatasetCard(dataset, entities, extractions, mlFeatures, kgEntities, kgEdges, ragChunks);
  return { ml_features: mlFeatures, kg_entities: kgEntities, kg_identifiers: kgIdentifiers, kg_edges: kgEdges, rag_chunks: ragChunks, dataset_card: datasetCard };
}

export function buildArtifactUris(datasetCode: string, version: string): DatasetArtifactUris {
  const base = `/api/datasets/${datasetCode}/artifact`;
  return { ml: `${base}?type=ml&version=${version}`, kg_entities: `${base}?type=kg_entities&version=${version}`, kg_identifiers: `${base}?type=kg_identifiers&version=${version}`, kg_edges: `${base}?type=kg_edges&version=${version}`, rag_chunks: `${base}?type=rag_chunks&version=${version}`, bundle_zip: `${base}?type=bundle&version=${version}` };
}

// ─── Trust score threshold check for blocking ─────────────────────────────────
export interface TrustCheckResult {
  blocked: boolean;
  avgTrustScore: number;
  threshold: number;
  blockingReason?: string;
}

export function checkPublishTrustThreshold(
  extractions: ExtractionRun[],
  threshold: number
): TrustCheckResult {
  if (extractions.length === 0) {
    return { blocked: false, avgTrustScore: 0, threshold };
  }
  const avgTrust = extractions.reduce((s, e) => s + e.trustScore, 0) / extractions.length;
  const blocked  = avgTrust < threshold;
  return {
    blocked,
    avgTrustScore: Math.round(avgTrust * 1000) / 1000,
    threshold,
    blockingReason: blocked ? `Average trust score ${(avgTrust * 100).toFixed(0)}% is below the publishing threshold of ${(threshold * 100).toFixed(0)}%. Improve extraction quality or provide an override reason.` : undefined,
  };
}

// ─── Real CSV download for ML features ────────────────────────────────────────
export function generateMlCsv(mlFeatures: MlFeatureRow[]): string {
  return toCsv(mlFeatures);
}

// ─── Real ZIP bundle ──────────────────────────────────────────────────────────
export async function generateBundleZip(contents: ArtifactContents): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("dataset_card.json",    JSON.stringify(contents.dataset_card, null, 2));
  zip.file("ml_features.csv",      toCsv(contents.ml_features));
  zip.file("kg_entities.jsonl",    toJsonl(contents.kg_entities));
  zip.file("kg_identifiers.jsonl", toJsonl(contents.kg_identifiers));
  zip.file("kg_edges.jsonl",       toJsonl(contents.kg_edges));
  zip.file("rag_chunks.jsonl",     toJsonl(contents.rag_chunks));
  zip.file("README.md", [
    "# ADRS Dataset Bundle",
    "",
    `Dataset: ${contents.dataset_card.name}`,
    `Version: ${contents.dataset_card.dataset_version}`,
    `Generated: ${contents.dataset_card.generated_at}`,
    "",
    "## Files",
    "- `dataset_card.json` — Full dataset card with quality metrics and lineage",
    "- `ml_features.csv` — Flat feature matrix for supervised ML (one row per CDM entity)",
    "- `kg_entities.jsonl` — Entity records for Knowledge Graph / entity resolution",
    "- `kg_identifiers.jsonl` — Identifier records (email, phone, IDs) linked to entities",
    "- `kg_edges.jsonl` — Relationship edges between entities",
    "- `rag_chunks.jsonl` — Paragraph-chunked text corpus for LLM/RAG pipelines",
    "",
    "## Schema Version",
    `schema_version: ${contents.dataset_card.schema_version}`,
  ].join("\n"));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
