import JSZip from "jszip";
import type {
  CdmEntity, PublishedDataset, ExtractionRun, EvidenceFile,
  MlFeatureRow, KgEntityRow, KgEdgeRow, KgGraphRecord, RagChunkRow,
  DatasetCard, DatasetArtifactUris, ArtifactQualityGates
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

function toJsonl(rows: any[]): string {
  return rows.map(r => JSON.stringify(r)).join("\n");
}

// ─── PII field detection ──────────────────────────────────────────────────────
const PII_FIELD_NAMES = new Set([
  "name", "full_name", "first_name", "last_name", "display_name",
  "email", "phone", "mobile", "telephone", "fax",
  "national_id", "registration_number", "tax_number", "passport",
  "id_number", "vat_number", "pin", "tin", "ein",
  "address", "street_address", "postal_address", "physical_address",
  "account_number", "bank_account", "iban", "swift_code", "sort_code",
  "card_number", "cvv",
]);

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,  // email
  /\b(\+?[\d\s\-().]{8,20})\b/,                                // phone (loose)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,              // card number
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/,      // IBAN
  /\b\d{3}-\d{2}-\d{4}\b/,                                    // SSN
  /Acc\s+No\.?\s*:?\s*[\d\s]+/i,                               // bank acc
];

function containsPii(text: string): boolean {
  return PII_PATTERNS.some(p => p.test(text));
}

// ─── ML-safe field classification ────────────────────────────────────────────
const ML_NUMERIC_KEYS = /^(amount|total|qty|quantity|price|cost|fee|balance|count|rate|score|weight|subtotal|tax|discount|units|volume|pages)/i;
const ML_DATE_KEYS    = /^(date|issued|created|expiry|due|paid|received|effective|start|end|invoice_date)/i;
const ML_CATEGORY_KEYS = /^(type|status|method|currency|category|class|tier|payment_method|document_type|source_type|media_type|entity_type)/i;

function isIdentifierField(key: string): boolean {
  return PII_FIELD_NAMES.has(key.toLowerCase()) ||
    /^(email|phone|mobile|id_|_id$|national|registration|passport|account|bank|iban|swift|card|vat|tin|ein|pin)/.test(key.toLowerCase());
}

function normalizeNumeric(v: any): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.round(v * 100) / 100;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeCategory(v: any): string {
  return String(v).toLowerCase().replace(/[\s\-]+/g, "_").slice(0, 64);
}

// ─── ML Features Artifact (clean, no PII) ────────────────────────────────────
export function generateMlFeatures(
  entities: CdmEntity[],
  extractions: ExtractionRun[]
): MlFeatureRow[] {
  // Build evidence→extraction lookup for ML-safe attribute extraction
  const extractionByEvidence = new Map<string, ExtractionRun>();
  for (const run of extractions) {
    if (!extractionByEvidence.has(run.evidenceId)) {
      extractionByEvidence.set(run.evidenceId, run);
    }
  }

  const rows: MlFeatureRow[] = [];

  for (const entity of entities) {
    if (entity.confidenceScore < 0.5) continue;

    const fields = entity.canonicalFields as Record<string, any>;

    const identifiers      = (entity.identifiers as any[]) ?? [];
    const relationships    = (entity.relationships as any[]) ?? [];
    const entityTypeRank: Record<string, number> = { PERSON: 1, ORGANIZATION: 2, DOCUMENT: 3, TRANSACTION: 4, ASSET: 5 };

    // Normalization quality: fraction of approved attrs in source extractions
    let normSuccess = 0; let normTotal = 0;
    for (const evidenceId of (entity.sourceEvidenceIds ?? [])) {
      const run = extractionByEvidence.get(evidenceId);
      if (!run) continue;
      const attrs = (run.extractedAttributes as any[]) ?? [];
      for (const a of attrs) {
        normTotal++;
        if (a.normalization_status === "SUCCESS") normSuccess++;
      }
    }
    const normalizationQuality = normTotal > 0 ? Math.round((normSuccess / normTotal) * 1000) / 1000 : null;

    const row: MlFeatureRow = {
      entity_id:                entity.entityCode,
      entity_type:              entity.entityType,
      entity_type_rank:         entityTypeRank[entity.entityType] ?? 9,
      confidence_score:         Math.round(entity.confidenceScore * 1000) / 1000,
      is_golden_record:         entity.isGoldenRecord ? 1 : 0,
      has_golden_record:        (entity.goldenRecordId || entity.isGoldenRecord) ? 1 : 0,
      schema_version:           entity.schemaVersion,
      source_evidence_count:    (entity.sourceEvidenceIds ?? []).length,
      identifier_count:         identifiers.length,
      has_email:                identifiers.some((i: any) => i.id_type_label === "Email") ? 1 : 0,
      has_phone:                identifiers.some((i: any) => i.id_type_label === "Phone") ? 1 : 0,
      relationship_count:       relationships.length,
      canonical_field_count:    Object.keys(fields).length,
      name_token_count:         (entity.displayName ?? "").split(/\s+/).filter(Boolean).length,
      normalization_quality:    normalizationQuality,
      provenance_quality:       provenanceQuality(entity.confidenceScore) === "HIGH" ? 1 : provenanceQuality(entity.confidenceScore) === "MEDIUM" ? 0.5 : 0,
    };

    // Pull ML-safe features from canonical fields (exclude PII)
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || isIdentifierField(k)) continue;
      const kl = k.toLowerCase();

      if (typeof v === "number" || typeof v === "boolean") {
        row[`feat_${kl}`] = typeof v === "boolean" ? (v ? 1 : 0) : v;
      } else {
        const s = String(v).trim();
        const n = normalizeNumeric(s);
        if (n !== null && /^[\d.,$€£%\s]+$/.test(s)) {
          row[`feat_${kl}`] = n;
        } else {
          row[`feat_${kl}`] = s;
        }
      }
    }

    // Also pull ML-safe features from extractedAttributes for each source evidence
    for (const evidenceId of (entity.sourceEvidenceIds ?? [])) {
      const run = extractionByEvidence.get(evidenceId);
      if (!run) continue;
      const attrs = (run.extractedAttributes as any[]) ?? [];
      for (const attr of attrs) {
        if (!attr.field_key || isIdentifierField(attr.field_key)) continue;
        const kl = attr.field_key.toLowerCase();
        const val = attr.value_normalized ?? attr.value_raw;
        if (!val) continue;

        if (typeof val === "number" || typeof val === "boolean") {
          if (!(`feat_${kl}` in row)) row[`feat_${kl}`] = typeof val === "boolean" ? (val ? 1 : 0) : val;
        } else {
          const s = String(val).trim();
          const n = normalizeNumeric(s);
          if (n !== null && /^[\d.,$€£%\s]+$/.test(s)) {
            if (!(`feat_${kl}` in row)) row[`feat_${kl}`] = n;
          } else {
            if (!(`feat_${kl}` in row)) row[`feat_${kl}`] = s;
          }
        }
      }
    }

    rows.push(row);
  }

  // Deduplicate columns: if all values for a feature column are identical across all rows, it's useless
  const featureCols = [...new Set(rows.flatMap(r => Object.keys(r).filter(k => k.startsWith("feat_"))))];
  const uselessCols = new Set<string>();
  for (const col of featureCols) {
    const vals = rows.map(r => r[col]).filter(v => v != null);
    if (vals.length > 1 && new Set(vals.map(String)).size === 1) uselessCols.add(col);
  }
  for (const row of rows) {
    for (const col of uselessCols) delete row[col];
  }

  return rows;
}

// ─── Knowledge Graph — unified NODE + EDGE artifact ──────────────────────────

function provenanceQuality(confidence: number): "HIGH" | "MEDIUM" | "LOW" {
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.65) return "MEDIUM";
  return "LOW";
}

// Canonical node label mapping
function canonicalNodeLabel(entityType: string): string {
  const map: Record<string, string> = {
    PERSON: "PARTY",
    ORGANIZATION: "PARTY",
    DOCUMENT: "DOCUMENT",
    TRANSACTION: "TRANSACTION",
    EVENT: "EVENT",
    OBJECT: "OBJECT",
  };
  return map[entityType] ?? "OBJECT";
}

// Deduplicate entities: merge those sharing same email + phone into a golden node
function deduplicateEntities(entities: CdmEntity[]): Map<string, CdmEntity[]> {
  const groups = new Map<string, CdmEntity[]>();

  for (const entity of entities) {
    const fields = entity.canonicalFields as Record<string, any>;
    const email = (fields.email ?? "").toLowerCase().trim();
    const phone = (fields.phone ?? "").replace(/\D/g, "").slice(-9);
    const reg = (fields.registration_number ?? fields.national_id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = (entity.displayName ?? fields.name ?? "").toLowerCase().trim();

    // Cascading deduplication key
    let key = `unique::${entity.id}`;
    if (reg && reg.length > 3) key = `reg::${reg}`;
    else if (email && email.includes("@")) key = `email::${email}`;
    else if (phone && phone.length >= 7) key = `phone::${phone}`;
    else if (name && name.length > 2) key = `name::${name}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entity);
  }

  return groups;
}

export function generateKgGraph(
  entities: CdmEntity[],
  datasetVersionId?: string
): KgGraphRecord[] {
  const records: KgGraphRecord[] = [];
  const emittedEdges = new Set<string>();

  // Separate by entity type
  const partyEntities = entities.filter(e =>
    e.entityType === "PERSON" || e.entityType === "ORGANIZATION"
  );
  const docEntities = entities.filter(e => e.entityType === "DOCUMENT");
  const otherEntities = entities.filter(e =>
    e.entityType !== "PERSON" && e.entityType !== "ORGANIZATION" && e.entityType !== "DOCUMENT"
  );

  // Deduplicate party entities
  const partyGroups = deduplicateEntities(partyEntities);
  const canonicalIdMap = new Map<string, string>(); // originalId → canonicalId

  for (const [, group] of partyGroups) {
    // The entity with highest confidence becomes canonical
    const canonical = group.reduce((a, b) => a.confidenceScore >= b.confidenceScore ? a : b);
    const allEvidenceIds = [...new Set(group.flatMap(e => e.sourceEvidenceIds ?? []))];
    const allIdentifiers = group.flatMap(e => (e.identifiers as any[]) ?? []);

    // Deduplicate identifiers by type+value
    const seenIds = new Set<string>();
    const deduped: any[] = [];
    for (const id of allIdentifiers) {
      const key = `${id.id_type_label}::${id.id_value}`;
      if (!seenIds.has(key)) { seenIds.add(key); deduped.push(id); }
    }

    // Build node properties (no raw PII in ML, but KG nodes CAN carry identifiers)
    const fields = canonical.canonicalFields as Record<string, any>;
    const nodeProps: Record<string, any> = {
      display_name: canonical.displayName,
      entity_sub_type: canonical.entityType,
      confidence_score: canonical.confidenceScore,
      is_golden_record: canonical.isGoldenRecord || group.length > 1,
      schema_version: canonical.schemaVersion,
      identifiers: deduped.map(id => ({ type: id.id_type_label, value: id.id_value, verified: id.is_verified ?? false })),
    };
    // Add non-PII canonical fields as properties
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && !isIdentifierField(k)) nodeProps[k] = v;
    }

    const nodeRecord: KgGraphRecord = {
      record_type: "NODE",
      id: canonical.entityCode,
      label: canonicalNodeLabel(canonical.entityType),
      properties: nodeProps,
      provenance: {
        evidence_ids: allEvidenceIds,
        confidence: canonical.confidenceScore,
        provenance_quality: provenanceQuality(canonical.confidenceScore),
        dataset_version_id: datasetVersionId,
      },
    };
    records.push(nodeRecord);

    // Track canonical id for merged entities
    for (const e of group) {
      canonicalIdMap.set(e.entityCode, canonical.entityCode);
    }
  }

  // Document nodes
  for (const doc of docEntities) {
    const fields = doc.canonicalFields as Record<string, any>;
    const nodeProps: Record<string, any> = {
      display_name: doc.displayName,
      entity_sub_type: "DOCUMENT",
      confidence_score: doc.confidenceScore,
      is_golden_record: doc.isGoldenRecord,
      schema_version: doc.schemaVersion,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) nodeProps[k] = v;
    }
    records.push({
      record_type: "NODE",
      id: doc.entityCode,
      label: "DOCUMENT",
      properties: nodeProps,
      provenance: {
        evidence_ids: doc.sourceEvidenceIds ?? [],
        confidence: doc.confidenceScore,
        provenance_quality: provenanceQuality(doc.confidenceScore),
        dataset_version_id: datasetVersionId,
      },
    });
    canonicalIdMap.set(doc.entityCode, doc.entityCode);
  }

  // Other entity nodes
  for (const entity of otherEntities) {
    const fields = entity.canonicalFields as Record<string, any>;
    const nodeProps: Record<string, any> = {
      display_name: entity.displayName,
      entity_sub_type: entity.entityType,
      confidence_score: entity.confidenceScore,
      is_golden_record: entity.isGoldenRecord,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) nodeProps[k] = v;
    }
    records.push({
      record_type: "NODE",
      id: entity.entityCode,
      label: canonicalNodeLabel(entity.entityType),
      properties: nodeProps,
      provenance: {
        evidence_ids: entity.sourceEvidenceIds ?? [],
        confidence: entity.confidenceScore,
        provenance_quality: provenanceQuality(entity.confidenceScore),
        dataset_version_id: datasetVersionId,
      },
    });
    canonicalIdMap.set(entity.entityCode, entity.entityCode);
  }

  // Collect all emitted node IDs
  const emittedNodeIds = new Set(records.filter(r => r.record_type === "NODE").map(r => r.id));

  // Explicit relationship edges from entity.relationships
  for (const entity of entities) {
    const rels = (entity.relationships as any[]) ?? [];
    const srcId = canonicalIdMap.get(entity.entityCode) ?? entity.entityCode;
    for (const rel of rels) {
      const tgtId = canonicalIdMap.get(rel.target_entity_id) ?? rel.target_entity_id;
      if (srcId === tgtId) continue; // prevent self-loops
      if (!emittedNodeIds.has(srcId) || !emittedNodeIds.has(tgtId)) continue;
      const edgeId = `EDGE-${srcId}-${tgtId}-${rel.relationship_type}`;
      if (emittedEdges.has(edgeId)) continue;
      emittedEdges.add(edgeId);
      records.push({
        record_type: "EDGE",
        id: edgeId,
        type_label: rel.relationship_type,
        from: srcId,
        to: tgtId,
        properties: { confidence: rel.confidence ?? 0.85 },
        provenance: {
          evidence_ids: rel.evidence_id ? [rel.evidence_id] : [],
          confidence: rel.confidence ?? 0.85,
          provenance_quality: provenanceQuality(rel.confidence ?? 0.85),
          dataset_version_id: datasetVersionId,
        },
      });
    }
  }

  // Semantic edges: PARTY → <relationship_type> → DOCUMENT
  // Use the relationship_type stored on each entity, falling back to MENTIONED_IN
  for (const doc of docEntities) {
    const docId = canonicalIdMap.get(doc.entityCode) ?? doc.entityCode;
    if (!emittedNodeIds.has(docId)) continue;

    for (const [, group] of partyGroups) {
      const canonical = group.reduce((a, b) => a.confidenceScore >= b.confidenceScore ? a : b);
      const partyId = canonical.entityCode;
      if (!emittedNodeIds.has(partyId)) continue;
      if (partyId === docId) continue;

      const sharedEvidence = (doc.sourceEvidenceIds ?? []).some(id =>
        group.some(e => (e.sourceEvidenceIds ?? []).includes(id))
      );
      if (!sharedEvidence) continue;

      // Determine the best relationship type across the group (prefer specific over generic)
      const RELATIONSHIP_PRIORITY: Record<string, number> = {
        SUBJECT_OF: 10, ISSUED_BY: 9, ISSUED_TO: 9, SIGNATORY_OF: 8,
        AFFILIATED_WITH: 7, EMPLOYED_BY: 7, MENTIONED_IN: 1,
      };
      let bestRelType = "MENTIONED_IN";
      let bestPriority = 0;
      for (const e of group) {
        const rels = (e.relationships as any[]) ?? [];
        for (const r of rels) {
          if (r.target_entity_id === doc.entityCode || r.target_entity_id === docId) {
            const priority = RELATIONSHIP_PRIORITY[r.relationship_type] ?? 0;
            if (priority > bestPriority) { bestPriority = priority; bestRelType = r.relationship_type; }
          }
        }
      }

      const edgeId = `EDGE-${partyId}-${docId}-${bestRelType}`;
      if (emittedEdges.has(edgeId)) continue;
      emittedEdges.add(edgeId);

      const confidence = Math.min(doc.confidenceScore, canonical.confidenceScore);
      records.push({
        record_type: "EDGE",
        id: edgeId,
        type_label: bestRelType,
        from: partyId,
        to: docId,
        properties: { confidence, relationship_basis: "shared_evidence", semantic_type: bestRelType !== "MENTIONED_IN" ? "semantic" : "implicit" },
        provenance: {
          evidence_ids: (doc.sourceEvidenceIds ?? []).filter(id =>
            group.some(e => (e.sourceEvidenceIds ?? []).includes(id))
          ),
          confidence,
          provenance_quality: provenanceQuality(confidence),
          dataset_version_id: datasetVersionId,
        },
      });
    }
  }

  return records;
}

// ─── Legacy KG artifacts (kept for backward compat / bundle) ─────────────────
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
    if (rel.sourceId === rel.target_entity_id) continue; // no self-loops
    edges.push({
      edge_id:            `EDGE-${rel.sourceId}-${rel.target_entity_id}-${rel.relationship_type}`,
      source_entity_id:   rel.sourceId,
      target_entity_id:   rel.target_entity_id,
      relationship_type:  rel.relationship_type,
      confidence:         rel.confidence ?? 0.9,
      evidence_id:        rel.evidence_id,
    });
  }
  const docEntities   = entities.filter(e => e.entityType === "DOCUMENT");
  const partyEntities = entities.filter(e => e.entityType === "PERSON" || e.entityType === "ORGANIZATION");
  const seen = new Set<string>();
  for (const doc of docEntities) {
    for (const party of partyEntities) {
      if (party.entityCode === doc.entityCode) continue;
      const shared = (doc.sourceEvidenceIds ?? []).some(id => (party.sourceEvidenceIds ?? []).includes(id));
      if (shared) {
        const edgeId = `EDGE-${party.entityCode}-${doc.entityCode}-MENTIONED_IN`;
        if (!seen.has(edgeId)) {
          seen.add(edgeId);
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

// ─── RAG Artifact — semantic section chunking ─────────────────────────────────

// Document section patterns — ordered by priority (most specific first).
// Covers: invoices, receipts, CVs/resumes, contracts, reports, correspondence.
const SECTION_PATTERNS: Array<{ pattern: RegExp; chunkType: string }> = [
  // ── Invoice / financial ────────────────────────────────────────────────────
  { pattern: /^(INVOICE|QUOTATION|QUOTE|TAX INVOICE|RECEIPT|STATEMENT|PROFORMA|CREDIT NOTE|DEBIT NOTE)/im,  chunkType: "issuer_header" },
  { pattern: /^(CUSTOMER DETAILS?|CLIENT DETAILS?|BILL TO|SOLD TO|SHIP TO|CUSTOMER INFO|DELIVER TO)/im,     chunkType: "customer_details" },
  { pattern: /^(BANK (TRANSFER|DETAILS?)|PAYMENT (DETAILS?|INFO|INSTRUCTIONS?)|REMITTANCE|BANKING DETAILS)/im, chunkType: "payment_details" },
  { pattern: /^(LINE ITEMS?|DESCRIPTION|ITEMS?|SERVICES?|PRODUCTS?|SCOPE OF WORK|DELIVERABLE|PARTICULARS)/im, chunkType: "line_items" },
  { pattern: /^(SUBTOTAL|TOTAL|AMOUNT DUE|GRAND TOTAL|BALANCE|TOTAL AMOUNT|AMOUNT IN WORDS|SUMMARY OF CHARGES)/im, chunkType: "totals" },
  { pattern: /^(TERMS?|CONDITIONS?|NOTES?|REMARKS?|PAYMENT TERMS?|DISCLAIMER|IMPORTANT NOTICE)/im,          chunkType: "terms" },
  { pattern: /^(ORDER|ORD|ATT|REFERENCE|REF|PURCHASE ORDER|PO NUMBER)/im,                                   chunkType: "reference" },
  // ── CV / resume ────────────────────────────────────────────────────────────
  { pattern: /^(PERSONAL (DETAILS?|INFORMATION|PROFILE|STATEMENT)|PROFILE|ABOUT ME|SUMMARY|OBJECTIVE|CAREER OBJECTIVE)/im, chunkType: "cv_personal" },
  { pattern: /^(WORK EXPERIENCE|EMPLOYMENT (HISTORY|RECORD)|EXPERIENCE|PROFESSIONAL EXPERIENCE|CAREER HISTORY)/im,         chunkType: "cv_experience" },
  { pattern: /^(EDUCATION|ACADEMIC (QUALIFICATIONS?|BACKGROUND|HISTORY)|QUALIFICATIONS?|SCHOOLING|TRAINING)/im,            chunkType: "cv_education" },
  { pattern: /^(SKILLS?|COMPETENC(Y|IES)|CAPABILITIES?|AREAS? OF EXPERTISE|TECHNICAL SKILLS?|KEY SKILLS?)/im,             chunkType: "cv_skills" },
  { pattern: /^(CERTIF(ICATE|ICATION)S?|LICEN(C|S)ES?|PROFESSIONAL DEVELOPMENT|ACCREDITATION)/im,                         chunkType: "cv_certifications" },
  { pattern: /^(REFERENCES?|REFEREE|CHARACTER REFERENCES?|PROFESSIONAL REFERENCES?)/im,                                    chunkType: "cv_references" },
  { pattern: /^(AWARDS?|ACHIEVEMENT|HONOURS?|RECOGNITION|PUBLICATIONS?|RESEARCH)/im,                                       chunkType: "cv_achievements" },
  { pattern: /^(LANGUAGES?|LINGUISTIC|SPOKEN LANGUAGES?)/im,                                                               chunkType: "cv_languages" },
  // ── Contract / legal ───────────────────────────────────────────────────────
  { pattern: /^(WHEREAS|RECITALS?|BACKGROUND|PREAMBLE)/im,                                                  chunkType: "contract_preamble" },
  { pattern: /^(PARTIES|PARTY DETAILS?|BETWEEN|SIGNATORIES)/im,                                             chunkType: "contract_parties" },
  { pattern: /^(OBLIGATIONS?|DUTIES|RESPONSIBILITIES|DELIVERABLES?|SCOPE)/im,                               chunkType: "contract_obligations" },
  { pattern: /^(TERMINATION|EXPIRY|EXPIRATION|DURATION|TERM OF AGREEMENT)/im,                               chunkType: "contract_term" },
  { pattern: /^(GOVERNING LAW|JURISDICTION|DISPUTE RESOLUTION|ARBITRATION)/im,                              chunkType: "contract_legal" },
  { pattern: /^(SIGNATURES?|SIGNED BY|EXECUTION|IN WITNESS)/im,                                             chunkType: "contract_signature" },
  // ── Report / correspondence ────────────────────────────────────────────────
  { pattern: /^(EXECUTIVE SUMMARY|ABSTRACT|INTRODUCTION|BACKGROUND INFORMATION)/im,                         chunkType: "report_intro" },
  { pattern: /^(FINDINGS?|RESULTS?|ANALYSIS|OBSERVATIONS?|RECOMMENDATIONS?)/im,                             chunkType: "report_findings" },
  { pattern: /^(CONCLUSION|SUMMARY|CLOSING REMARKS?|NEXT STEPS?|WAY FORWARD)/im,                            chunkType: "report_conclusion" },
  { pattern: /^(APPENDIX|ANNEX|ATTACHMENT|EXHIBIT|SCHEDULE)/im,                                             chunkType: "report_appendix" },
  // ── Email / correspondence ─────────────────────────────────────────────────
  { pattern: /^(DEAR|TO WHOM IT MAY CONCERN|HI |HELLO |GOOD (MORNING|AFTERNOON|EVENING))/im,                chunkType: "correspondence_salutation" },
  { pattern: /^(YOURS (SINCERELY|FAITHFULLY|TRULY)|BEST REGARDS?|REGARDS?|THANK YOU|THANKS?)/im,            chunkType: "correspondence_closing" },
];

// Boilerplate patterns (repeated across many documents from same supplier)
const BOILERPLATE_PATTERNS = [
  /For Building Renovations?, Roofing, Waterproofing/i,
  /Professional Consulting, Compliance.*IT Solutions/i,
  /Empowering Businesses Through/i,
  /Acc Name:.*Bank:.*Acc Type:/is,
  /Ecocash.*Innbucks.*O.?mari/i,
];

function detectChunkType(text: string): string {
  for (const { pattern, chunkType } of SECTION_PATTERNS) {
    if (pattern.test(text)) return chunkType;
  }
  // Heuristic fallbacks
  if (/\d+[.,]\d{2}/.test(text) && text.split("\n").length <= 5) return "line_items";
  if (/thank you|regards|sincerely|yours/i.test(text)) return "closing";
  return "body";
}

function isBoilerplate(text: string): boolean {
  return BOILERPLATE_PATTERNS.some(p => p.test(text));
}

function isTrivialChunk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 25) return true;
  // Label-only: short text with colon or all-caps label
  if (/^[A-Z\s:]{2,40}$/.test(trimmed)) return true;
  // Only numbers/punctuation
  if (/^[\d\s.,\-$%:]{2,30}$/.test(trimmed)) return true;
  return false;
}

function classifyValidationState(trustScore: number): "VALIDATED" | "PARTIALLY_VALIDATED" | "UNVALIDATED" {
  if (trustScore >= 0.80) return "VALIDATED";
  if (trustScore >= 0.60) return "PARTIALLY_VALIDATED";
  return "UNVALIDATED";
}

// Split rawText into semantic sections using section pattern positions
function semanticSplit(rawText: string): Array<{ text: string; startIdx: number }> {
  const lines = rawText.split("\n");
  const sections: Array<{ text: string; startIdx: number }> = [];
  let currentLines: string[] = [];
  let currentStart = 0;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineIsHeader = SECTION_PATTERNS.some(({ pattern }) => pattern.test(line));

    if (lineIsHeader && currentLines.length > 0) {
      // Flush current section
      const sectionText = currentLines.join("\n").trim();
      if (sectionText.length > 0) {
        sections.push({ text: sectionText, startIdx: currentStart });
      }
      currentStart = charOffset;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
    charOffset += line.length + 1; // +1 for newline
  }

  // Flush last section
  if (currentLines.length > 0) {
    const sectionText = currentLines.join("\n").trim();
    if (sectionText.length > 0) {
      sections.push({ text: sectionText, startIdx: currentStart });
    }
  }

  // If no sections found, fall back to double-newline split
  if (sections.length <= 1) {
    const paras = rawText.split(/\n{2,}/);
    let offset = 0;
    return paras.map(p => {
      const result = { text: p.trim(), startIdx: offset };
      offset += p.length + 2;
      return result;
    }).filter(s => s.text.length > 0);
  }

  return sections;
}

export function generateRagChunks(
  extractions: ExtractionRun[],
  evidenceMap: Map<string, EvidenceFile>,
  entityMap: Map<string, CdmEntity>
): RagChunkRow[] {
  const chunks: RagChunkRow[] = [];
  const seenTexts = new Map<string, string>(); // normalized text → first chunk_id (dedup across docs)

  for (const run of extractions) {
    if (!run.rawText) continue;

    const evidence = evidenceMap.get(run.evidenceId);
    const docTitle = evidence?.fileName ?? "Unknown";

    const linkedEntities = Array.from(entityMap.values())
      .filter(e => (e.sourceEvidenceIds ?? []).includes(run.evidenceId))
      .map(e => e.entityCode);

    const sections = semanticSplit(run.rawText);

    let chunkIdx = 0;
    for (const { text, startIdx } of sections) {
      if (isTrivialChunk(text)) continue;

      // Dedup identical text across extraction runs (boilerplate detection)
      const normalizedText = text.replace(/\s+/g, " ").toLowerCase().trim();
      if (seenTexts.has(normalizedText)) {
        // Still emit but mark as boilerplate
        const boilerChunkId = `CHUNK-${run.id}-S${String(chunkIdx + 1).padStart(3, "0")}`;
        chunkIdx++;
        chunks.push({
          chunk_id:          boilerChunkId,
          text:              text.slice(0, 2000),
          evidence_id:       run.evidenceId,
          page_number:       chunkIdx,
          document_title:    docTitle,
          linked_entity_ids: linkedEntities,
          trust_score:       run.trustScore,
          validation_state:  classifyValidationState(run.trustScore),
          chunk_type:        detectChunkType(text),
          language:          "en",
          span_start:        startIdx,
          span_end:          startIdx + text.length,
          contains_pii:      containsPii(text),
          redaction_status:  containsPii(text) ? "INTERNAL_RAW" : "INTERNAL_STRUCTURED",
          provenance_quality: provenanceQuality(run.trustScore),
          is_boilerplate:    true,
        });
        continue;
      }
      seenTexts.set(normalizedText, run.id);

      const isBoilerplateChunk = isBoilerplate(text);
      const hasPii = containsPii(text);
      const chunkType = detectChunkType(text);
      const chunkId = `CHUNK-${run.id}-S${String(chunkIdx + 1).padStart(3, "0")}`;
      chunkIdx++;

      chunks.push({
        chunk_id:          chunkId,
        text:              text.slice(0, 2000),
        evidence_id:       run.evidenceId,
        page_number:       chunkIdx,
        document_title:    docTitle,
        linked_entity_ids: linkedEntities,
        trust_score:       run.trustScore,
        validation_state:  classifyValidationState(run.trustScore),
        chunk_type:        chunkType,
        language:          "en",
        span_start:        startIdx,
        span_end:          startIdx + text.length,
        contains_pii:      hasPii,
        redaction_status:  hasPii ? "INTERNAL_RAW" : "INTERNAL_STRUCTURED",
        provenance_quality: provenanceQuality(run.trustScore),
        is_boilerplate:    isBoilerplateChunk,
      });
    }
  }

  return chunks;
}

// ─── Quality Gates ────────────────────────────────────────────────────────────
export function validateArtifacts(
  mlFeatures: MlFeatureRow[],
  kgGraph: KgGraphRecord[],
  ragChunks: RagChunkRow[]
): ArtifactQualityGates {
  const mlIssues: string[] = [];
  const kgIssues: string[] = [];
  const ragIssues: string[] = [];

  // ML validation
  if (mlFeatures.length === 0) {
    mlIssues.push("ML artifact has zero rows — no qualifying entities found");
  }
  const mlPiiCols = [...new Set(mlFeatures.flatMap(r =>
    Object.keys(r).filter(k => k.startsWith("feat_") && isIdentifierField(k.replace("feat_", "")))
  ))];
  if (mlPiiCols.length > 0) mlIssues.push(`PII leakage detected in ML feature columns: ${mlPiiCols.join(", ")}`);

  const mlCols = [...new Set(mlFeatures.flatMap(r => Object.keys(r)))];
  const mlColSet = new Set(mlCols);
  if (mlColSet.size !== mlCols.length) mlIssues.push("Duplicate column names detected in ML artifact");

  // KG validation
  const nodeIds = new Set(kgGraph.filter(r => r.record_type === "NODE").map(r => r.id));
  const edgeRecords = kgGraph.filter(r => r.record_type === "EDGE");
  const selfLoops = edgeRecords.filter(e => e.from === e.to);
  if (selfLoops.length > 0) kgIssues.push(`${selfLoops.length} self-loop edge(s) detected`);

  const orphanEdges = edgeRecords.filter(e => !nodeIds.has(e.from!) || !nodeIds.has(e.to!));
  if (orphanEdges.length > 0) kgIssues.push(`${orphanEdges.length} edge(s) reference non-existent nodes`);

  const lowProvNodes = kgGraph.filter(r => r.record_type === "NODE" && r.provenance.evidence_ids.length === 0);
  if (lowProvNodes.length > 0) kgIssues.push(`${lowProvNodes.length} node(s) have no evidence provenance`);

  // RAG validation
  const trivial = ragChunks.filter(c => isTrivialChunk(c.text));
  if (trivial.length > 0) ragIssues.push(`${trivial.length} trivial chunk(s) in RAG artifact — run cleaning`);

  const ungroundedChunks = ragChunks.filter(c => !c.evidence_id);
  if (ungroundedChunks.length > 0) ragIssues.push(`${ungroundedChunks.length} chunk(s) missing evidence_id`);

  const dupChunkTexts = new Map<string, number>();
  for (const c of ragChunks) {
    const key = c.text.slice(0, 100).toLowerCase();
    dupChunkTexts.set(key, (dupChunkTexts.get(key) ?? 0) + 1);
  }
  const dupCount = [...dupChunkTexts.values()].filter(v => v > 1).length;
  if (dupCount > 0) ragIssues.push(`${dupCount} near-duplicate chunk text(s) detected`);

  const kgNodeCount = nodeIds.size;
  const kgEdgeCount = edgeRecords.length;

  return {
    ml:  { passed: mlIssues.length === 0,  row_count:   mlFeatures.length,  issues: mlIssues  },
    kg:  { passed: kgIssues.length === 0,  node_count:  kgNodeCount, edge_count: kgEdgeCount, issues: kgIssues  },
    rag: { passed: ragIssues.length === 0, chunk_count: ragChunks.length,    issues: ragIssues },
    overall_passed: mlIssues.length === 0 && kgIssues.length === 0 && ragIssues.length === 0,
  };
}

// ─── Dataset Card ─────────────────────────────────────────────────────────────
export function generateDatasetCard(
  dataset: Partial<PublishedDataset>,
  entities: CdmEntity[],
  extractions: ExtractionRun[],
  mlFeatures: MlFeatureRow[],
  kgGraph: KgGraphRecord[],
  kgEntities: KgEntityRow[],
  kgEdges: KgEdgeRow[],
  ragChunks: RagChunkRow[],
  qualityGates?: ArtifactQualityGates
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

  const kgNodeCount = kgGraph.filter(r => r.record_type === "NODE").length;
  const kgEdgeCount = kgGraph.filter(r => r.record_type === "EDGE").length;
  const validatedChunks = ragChunks.filter(c => c.validation_state === "VALIDATED").length;
  const featureCols = [...new Set(mlFeatures.flatMap(r => Object.keys(r).filter(k => k.startsWith("feat_"))))];
  const avgChunkLen = ragChunks.length
    ? Math.round(ragChunks.reduce((s, c) => s + c.text.length, 0) / ragChunks.length)
    : 0;
  const validatedPct = ragChunks.length
    ? Math.round(validatedChunks / ragChunks.length * 100)
    : 0;

  return {
    schema_version:  "1.2",
    dataset_version: dataset.version ?? "1.0.0",
    dataset_code:    dataset.datasetCode ?? "",
    name:            dataset.name ?? "",
    description:     dataset.description ?? undefined,
    generated_at:    new Date().toISOString(),
    lineage: {
      source_batches:           lineageInfo.source_batches ?? [],
      source_evidence_ids:      [...new Set(sourceEvids)],
      pipeline_version:         lineageInfo.pipeline_version ?? "1.0",
      extraction_model_version: extractions[0]?.modelVersion ?? "v1.0",
    },
    quality_metrics: {
      total_records:             dataset.recordCount ?? entities.length,
      avg_confidence:            Math.round(avgConfidence * 1000) / 1000,
      avg_trust_score:           Math.round(avgTrust * 1000) / 1000,
      approved_pct:              totalAttrs > 0 ? Math.round((autoApproved + humanApproved) / totalAttrs * 100) : 0,
      pending_pct:               totalAttrs > 0 ? Math.round(pending / totalAttrs * 100) : 0,
      normalization_success_pct: totalAttrs > 0 ? Math.round(normSuccess / totalAttrs * 100) : 0,
    },
    validation_summary: { total_attributes: totalAttrs, auto_approved: autoApproved, human_approved: humanApproved, pending, rejected },
    artifacts: {
      ml_features: { rows: mlFeatures.length, columns: ["entity_id", "entity_type", "confidence_score", "is_golden_record", "schema_version", "source_evidence_count", ...featureCols], feature_count: featureCols.length },
      kg_graph:    { node_count: kgNodeCount, edge_count: kgEdgeCount },
      kg_entities: { count: kgEntities.length },
      kg_edges:    { count: kgEdges.length },
      rag_chunks:  { count: ragChunks.length, avg_chunk_length: avgChunkLen, validated_pct: validatedPct },
    },
    quality_gates: qualityGates,
    approvals: dataset.publishedBy ? [{ role: "Dataset Publisher", user: dataset.publishedBy, timestamp: dataset.publishedAt?.toISOString() ?? new Date().toISOString() }] : [],
  };
}

// ─── Build all artifacts ──────────────────────────────────────────────────────
export interface ArtifactContents {
  ml_features:     MlFeatureRow[];
  kg_graph:        KgGraphRecord[];
  kg_entities:     KgEntityRow[];
  kg_identifiers:  ReturnType<typeof generateKgIdentifiers>;
  kg_edges:        KgEdgeRow[];
  rag_chunks:      RagChunkRow[];
  dataset_card:    DatasetCard;
  quality_gates:   ArtifactQualityGates;
}

// ─── Lifecycle-aware entity filter ───────────────────────────────────────────
/**
 * Filter entities for export.
 * Rules:
 *  • QUARANTINED and REJECTED entities must never appear in published artifacts.
 *  • DRAFT entities are not yet validated enough to export; exclude them.
 *  • GOLDEN, CANDIDATE, MERGED, RETIRED entities are export-eligible.
 *  • DOCUMENT entities bypass lifecycle filtering (always exported — they represent lineage).
 *  • If entity_lifecycle is null/undefined (legacy rows), assume CANDIDATE (backward compat).
 */
function filterEntitiesForExport(entities: CdmEntity[]): { exportable: CdmEntity[]; excluded: { entity: CdmEntity; reason: string }[] } {
  const exportable: CdmEntity[] = [];
  const excluded: { entity: CdmEntity; reason: string }[] = [];

  const EXPORT_LIFECYCLES = new Set(["GOLDEN", "CANDIDATE", "MERGED", "RETIRED"]);
  const BLOCKED_LIFECYCLES = new Set(["QUARANTINED", "REJECTED"]);

  for (const e of entities) {
    if (e.entityType === "DOCUMENT") {
      exportable.push(e); // documents always export
      continue;
    }
    const lifecycle = (e as any).entityLifecycle as string | undefined | null;
    if (!lifecycle || EXPORT_LIFECYCLES.has(lifecycle)) {
      exportable.push(e);
    } else if (BLOCKED_LIFECYCLES.has(lifecycle)) {
      excluded.push({ entity: e, reason: `Lifecycle is ${lifecycle}; blocked from export` });
    } else {
      // DRAFT or unknown → exclude with softer warning
      excluded.push({ entity: e, reason: `Lifecycle is ${lifecycle ?? "unknown"}; not yet promoted for export` });
    }
  }

  return { exportable, excluded };
}

export function buildArtifactContents(
  dataset: Partial<PublishedDataset>,
  entities: CdmEntity[],
  extractions: ExtractionRun[],
  evidenceMap: Map<string, EvidenceFile>
): ArtifactContents {
  // Apply lifecycle filter before generating any artifacts
  const { exportable: exportEntities, excluded: excludedEntities } = filterEntitiesForExport(entities);

  const entityMap     = new Map(exportEntities.map(e => [e.id, e]));
  const mlFeatures    = generateMlFeatures(exportEntities, extractions);
  const kgGraph       = generateKgGraph(exportEntities, dataset.datasetCode);
  const kgEntities    = generateKgEntities(exportEntities);
  const kgIdentifiers = generateKgIdentifiers(exportEntities);
  const kgEdges       = generateKgEdges(exportEntities);
  const ragChunks     = generateRagChunks(extractions, evidenceMap, entityMap);
  const qualityGates  = validateArtifacts(mlFeatures, kgGraph, ragChunks);

  // Attach lifecycle exclusion summary to quality gates
  if (excludedEntities.length > 0) {
    const quarantinedCount = excludedEntities.filter(x => (x.entity as any).entityLifecycle === "QUARANTINED").length;
    const rejectedCount    = excludedEntities.filter(x => (x.entity as any).entityLifecycle === "REJECTED").length;
    const draftCount       = excludedEntities.filter(x => !["QUARANTINED","REJECTED"].includes((x.entity as any).entityLifecycle ?? "")).length;
    (qualityGates as any).lifecycle_exclusions = {
      total_excluded: excludedEntities.length,
      quarantined: quarantinedCount,
      rejected: rejectedCount,
      draft_or_pending: draftCount,
      message: `${excludedEntities.length} entity/entities excluded from export due to lifecycle state.`,
    };
  }

  const datasetCard = generateDatasetCard(dataset, exportEntities, extractions, mlFeatures, kgGraph, kgEntities, kgEdges, ragChunks, qualityGates);
  return { ml_features: mlFeatures, kg_graph: kgGraph, kg_entities: kgEntities, kg_identifiers: kgIdentifiers, kg_edges: kgEdges, rag_chunks: ragChunks, dataset_card: datasetCard, quality_gates: qualityGates };
}

export function buildArtifactUris(datasetCode: string, version: string): DatasetArtifactUris {
  const base = `/api/datasets/${datasetCode}/artifact`;
  return {
    ml:             `${base}?type=ml&version=${version}`,
    kg_graph:       `${base}?type=kg_graph&version=${version}`,
    kg_entities:    `${base}?type=kg_entities&version=${version}`,
    kg_identifiers: `${base}?type=kg_identifiers&version=${version}`,
    kg_edges:       `${base}?type=kg_edges&version=${version}`,
    rag_chunks:     `${base}?type=rag_chunks&version=${version}`,
    bundle_zip:     `${base}?type=bundle&version=${version}`,
  };
}

// ─── Trust score threshold check ──────────────────────────────────────────────
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

export function generateMlCsv(mlFeatures: MlFeatureRow[]): string {
  return toCsv(mlFeatures);
}

// ─── Run Accounting / Observability ──────────────────────────────────────────
export interface RunSummary {
  documents_ingested: number;
  documents_extracted: number;
  documents_mapped_to_cdm: number;
  documents_exported_to_rag: number;
  documents_exported_to_kg: number;
  documents_exported_to_ml: number;
  documents_quarantined: number;
  documents_rejected: number;
  entities_created: number;
  entities_golden: number;
  entities_candidate: number;
  entities_quarantined: number;
  entities_rejected: number;
  entities_draft: number;
  relationships_created: number;
  golden_records_created: number;
  contact_bindings_total: number;
  contact_bindings_quarantined: number;
  validation_failures: number;
  avg_trust_score: number;
  low_trust_runs: number;
  run_computed_at: string;
}

/**
 * Compute a full observability summary across all pipeline data.
 * Called from GET /api/cdm/run-summary.
 */
export function generateRunSummary(
  entities: CdmEntity[],
  extractions: ExtractionRun[],
  evidenceFiles: EvidenceFile[]
): RunSummary {
  const evidenceIds = new Set(entities.flatMap(e => e.sourceEvidenceIds ?? []));
  const docEntities = entities.filter(e => e.entityType === "DOCUMENT");
  const partyEntities = entities.filter(e => e.entityType !== "DOCUMENT");

  const goldenEntities    = entities.filter(e => (e as any).entityLifecycle === "GOLDEN");
  const candidateEntities = entities.filter(e => (e as any).entityLifecycle === "CANDIDATE");
  const quarantinedEnt    = entities.filter(e => (e as any).entityLifecycle === "QUARANTINED");
  const rejectedEnt       = entities.filter(e => (e as any).entityLifecycle === "REJECTED");
  const draftEnt          = entities.filter(e => !["GOLDEN","CANDIDATE","QUARANTINED","REJECTED","MERGED","RETIRED"].includes((e as any).entityLifecycle ?? ""));

  const totalRelationships = entities.reduce((s, e) => s + ((e.relationships as any[]) ?? []).length, 0);

  const goldenRecordIds   = new Set(entities.filter(e => e.isGoldenRecord).map(e => e.id));
  const mergedRecords     = entities.filter(e => e.goldenRecordId);

  const avgTrustScore = extractions.length
    ? extractions.reduce((s, e) => s + e.trustScore, 0) / extractions.length
    : 0;
  const lowTrustRuns = extractions.filter(e => e.trustScore < 0.70).length;

  const validationFailures = extractions.filter(e => !(e.qualityGatesPassed as unknown as boolean)).length;

  // Contact binding audit: count from entity metadata
  let contactBindingsTotal = 0;
  let contactBindingsQuarantined = 0;
  for (const e of entities) {
    const audit = (e as any).contactBindingAudit as any;
    if (audit) {
      contactBindingsTotal += (audit.binding_count ?? 0);
      contactBindingsQuarantined += (audit.quarantined_count ?? 0);
    }
  }

  // Document-level: which evidences have at least one extraction + CDM entity
  const evidencesWithCdm = evidenceIds.size;

  // Which evidences have QUARANTINED evidence status (failed)
  const quarantinedEvidence = evidenceFiles.filter(e => e.status === "QUARANTINED" || e.status === "FAILED").length;
  const rejectedEvidence    = evidenceFiles.filter(e => e.status === "REJECTED").length;

  // Which evidences appear in RAG-eligible extractions (have rawText)
  const evidencesWithRawText = new Set(extractions.filter(e => e.rawText && e.rawText.length > 0).map(e => e.evidenceId));

  return {
    documents_ingested:        evidenceFiles.length,
    documents_extracted:       extractions.length,
    documents_mapped_to_cdm:   evidencesWithCdm,
    documents_exported_to_rag: evidencesWithRawText.size,
    documents_exported_to_kg:  docEntities.length,
    documents_exported_to_ml:  partyEntities.filter(e => e.confidenceScore >= 0.5 &&
                                  !["QUARANTINED","REJECTED"].includes((e as any).entityLifecycle ?? "")).length,
    documents_quarantined:     quarantinedEvidence,
    documents_rejected:        rejectedEvidence,
    entities_created:          entities.length,
    entities_golden:           goldenEntities.length,
    entities_candidate:        candidateEntities.length,
    entities_quarantined:      quarantinedEnt.length,
    entities_rejected:         rejectedEnt.length,
    entities_draft:            draftEnt.length,
    relationships_created:     totalRelationships,
    golden_records_created:    goldenRecordIds.size + mergedRecords.length,
    contact_bindings_total:    contactBindingsTotal,
    contact_bindings_quarantined: contactBindingsQuarantined,
    validation_failures:       validationFailures,
    avg_trust_score:           Math.round(avgTrustScore * 1000) / 1000,
    low_trust_runs:            lowTrustRuns,
    run_computed_at:           new Date().toISOString(),
  };
}

// ─── Bundle ZIP ───────────────────────────────────────────────────────────────
export async function generateBundleZip(contents: ArtifactContents): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("dataset_card.json",    JSON.stringify(contents.dataset_card, null, 2));
  zip.file("ml_features.csv",      toCsv(contents.ml_features));
  zip.file("kg_graph.jsonl",       toJsonl(contents.kg_graph));
  zip.file("kg_entities.jsonl",    toJsonl(contents.kg_entities));
  zip.file("kg_identifiers.jsonl", toJsonl(contents.kg_identifiers));
  zip.file("kg_edges.jsonl",       toJsonl(contents.kg_edges));
  zip.file("rag_chunks.jsonl",     toJsonl(contents.rag_chunks));
  zip.file("quality_gates.json",   JSON.stringify(contents.quality_gates, null, 2));
  zip.file("README.md", [
    "# ADRS Dataset Bundle — v1.2",
    "",
    `Dataset: ${contents.dataset_card.name}`,
    `Version: ${contents.dataset_card.dataset_version}`,
    `Generated: ${contents.dataset_card.generated_at}`,
    `Schema: ${contents.dataset_card.schema_version}`,
    "",
    "## AI-Ready Artifacts",
    "- `ml_features.csv` — Clean feature matrix for supervised ML/analytics (PII-free, no identifier leakage)",
    "- `kg_graph.jsonl` — Unified Knowledge Graph (NODE + EDGE records) ready for graph systems",
    "- `rag_chunks.jsonl` — Semantic sections for LLM/RAG pipelines (section-typed, PII-tagged, validated)",
    "",
    "## Supporting Files",
    "- `kg_entities.jsonl` — Raw entity records (for advanced use)",
    "- `kg_identifiers.jsonl` — Identifier records linked to entities",
    "- `kg_edges.jsonl` — Raw edge records (for advanced use)",
    "- `dataset_card.json` — Full dataset card with quality metrics and lineage",
    "- `quality_gates.json` — Pre-publish quality validation report",
    "",
    "## KG Graph Format",
    "Each line in kg_graph.jsonl is one of:",
    '  { "record_type": "NODE", "id": "...", "label": "PARTY|DOCUMENT|TRANSACTION", "properties": {...}, "provenance": {...} }',
    '  { "record_type": "EDGE", "id": "...", "type_label": "...", "from": "...", "to": "...", "properties": {...}, "provenance": {...} }',
    "",
    "## Schema Version",
    `schema_version: ${contents.dataset_card.schema_version}`,
  ].join("\n"));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
