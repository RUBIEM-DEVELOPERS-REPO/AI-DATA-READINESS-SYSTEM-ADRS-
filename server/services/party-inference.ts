import type { NormalizedAttribute, InsertCdmEntity } from "@shared/schema";
import { ADRS_CONFIG } from "../config";

export interface InferredParty {
  entity: InsertCdmEntity;
  sourceAttrKeys: string[];
  identifiers: Array<{ id_type_label: string; id_value: string; is_verified: boolean }>;
  relationships: Array<{ target_entity_id: string; relationship_type: string; confidence: number; evidence_id?: string }>;
}

export interface InferredDocument {
  entity: InsertCdmEntity;
  sourceAttrKeys: string[];
}

// ─── Raw entity-type keys that come from extractedEntities mapping (not party roles).
// These are already captured in prefixed party fields (vendor_email, etc.) so skip them.
const SKIP_RAW_ENTITY_PREFIXES = new Set([
  "email", "phone", "address", "location", "money", "date",
  "reference", "organization", "person", "asset", "document",
  "url", "id", "name",
]);

// ─── Maps field-key prefixes to CDM entity types ──────────────────────────────
const PARTY_PREFIX_TYPES: Record<string, "PERSON" | "ORGANIZATION"> = {
  vendor:      "ORGANIZATION",
  supplier:    "ORGANIZATION",
  customer:    "ORGANIZATION",
  client:      "ORGANIZATION",
  buyer:       "ORGANIZATION",
  company:     "ORGANIZATION",
  contractor:  "ORGANIZATION",
  employer:    "ORGANIZATION",
  bank:        "ORGANIZATION",
  institution: "ORGANIZATION",
  lender:      "ORGANIZATION",
  payee:       "ORGANIZATION",
  payer:       "ORGANIZATION",
  issuer:      "ORGANIZATION",
  borrower:    "PERSON",
  signatory:   "PERSON",
  person:      "PERSON",
  employee:    "PERSON",
  director:    "PERSON",
  officer:     "PERSON",
  guarantor:   "PERSON",
  surety:      "PERSON",
  witness:     "PERSON",
  agent:       "PERSON",
  recipient:   "PERSON",
};

// ─── Party inference from normalized attributes ───────────────────────────────
export function inferParties(
  attrs: NormalizedAttribute[],
  evidenceId: string,
  docType: string,
  runId: string
): InferredParty[] {
  if (!ADRS_CONFIG.features.auto_party_creation) return [];

  const threshold = ADRS_CONFIG.thresholds.party_creation_confidence;

  const approvedPartyAttrs = attrs.filter(
    a =>
      a.subject_type === "PARTY" &&
      (a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED") &&
      a.confidence_score >= threshold
  );

  if (approvedPartyAttrs.length === 0) return [];

  // ── Group attributes by their field-key prefix ──────────────────────────────
  // e.g. "vendor_name" → prefix "vendor"; "signatory_name" → prefix "signatory"
  // Unprefixed attrs (no underscore) get their full key as a single-attr group.
  const groups = new Map<string, NormalizedAttribute[]>();

  for (const attr of approvedPartyAttrs) {
    const underscoreIdx = attr.field_key.indexOf("_");
    const prefix = underscoreIdx > 0 ? attr.field_key.slice(0, underscoreIdx) : attr.field_key;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(attr);
  }

  const parties: InferredParty[] = [];
  let partyIndex = 0;

  for (const [prefix, groupAttrs] of groups) {
    // Skip raw entity-type keys (e.g. "email", "phone", "address") — these are not party roles
    if (SKIP_RAW_ENTITY_PREFIXES.has(prefix)) continue;

    // Determine entity type from prefix map; unknown prefixes → ORGANIZATION
    const entityType: "PERSON" | "ORGANIZATION" = PARTY_PREFIX_TYPES[prefix] ?? "ORGANIZATION";

    // Find the primary name field for this cluster
    const nameAttr    = groupAttrs.find(a => a.field_key === `${prefix}_name` || a.field_key === "name");
    const emailAttr   = groupAttrs.find(a => a.field_key.includes("email"));
    const phoneAttr   = groupAttrs.find(a => a.field_key.includes("phone") || a.field_key.includes("mobile"));
    const addressAttr = groupAttrs.find(a => a.field_key.includes("address"));
    const nationalIdAttr = groupAttrs.find(
      a => a.field_key.includes("national_id") || a.field_key.includes("id_number")
    );

    // Skip clusters with no identifying signal at all
    if (!nameAttr && !emailAttr && !phoneAttr) continue;

    const displayName =
      nameAttr?.value_normalized ??
      emailAttr?.value_normalized ??
      phoneAttr?.value_normalized ??
      `${entityType}-${runId.slice(0, 8).toUpperCase()}-${partyIndex}`;

    const entityCode = `AUTO-${entityType.slice(0, 3)}-${runId.slice(0, 8).toUpperCase()}-${partyIndex}`;

    // Build canonical fields from ALL attrs in this cluster
    const canonicalFields: Record<string, any> = {};
    for (const attr of groupAttrs) {
      // Strip the common prefix so the field reads naturally (e.g. vendor_name → name)
      const shortKey = attr.field_key.startsWith(`${prefix}_`)
        ? attr.field_key.slice(prefix.length + 1)
        : attr.field_key;
      canonicalFields[shortKey] = attr.value_normalized;
    }

    // Build identifiers
    const identifiers: InferredParty["identifiers"] = [];
    if (emailAttr) {
      identifiers.push({
        id_type_label: "Email",
        id_value: emailAttr.value_normalized,
        is_verified: emailAttr.validation_state === "APPROVED",
      });
    }
    if (phoneAttr) {
      identifiers.push({
        id_type_label: "Phone",
        id_value: phoneAttr.value_normalized,
        is_verified: phoneAttr.validation_state === "APPROVED",
      });
    }
    if (nationalIdAttr) {
      identifiers.push({
        id_type_label: "National ID",
        id_value: nationalIdAttr.value_normalized,
        is_verified: nationalIdAttr.validation_state === "APPROVED",
      });
    }

    const entity: InsertCdmEntity = {
      entityCode,
      entityType,
      displayName,
      canonicalFields,
      identifiers,
      relationships: [],
      sourceEvidenceIds: [evidenceId],
      isGoldenRecord: false,
      confidenceScore: Math.max(...groupAttrs.map(a => a.confidence_score)),
      schemaVersion: "1.0",
      tenantId: "TENANT-001",
    };

    parties.push({ entity, sourceAttrKeys: groupAttrs.map(a => a.field_key), identifiers, relationships: [] });
    partyIndex++;
  }

  return parties;
}

// ─── Document entity inference ────────────────────────────────────────────────
export function inferDocument(
  attrs: NormalizedAttribute[],
  evidenceId: string,
  docType: string,
  runId: string
): InferredDocument | null {
  if (!ADRS_CONFIG.features.auto_party_creation) return null;

  const docAttrs = attrs.filter(
    a =>
      a.subject_type === "DOCUMENT" &&
      (a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED")
  );
  if (docAttrs.length === 0) return null;

  const titleAttr  = docAttrs.find(a => a.field_key.includes("title") || a.field_key.includes("report_title"));
  const numberAttr = docAttrs.find(a => a.field_key.includes("number") || a.field_key.includes("ref") || a.field_key.includes("code"));

  const displayName = titleAttr?.value_normalized ?? numberAttr?.value_normalized ?? `${docType}-${runId.slice(0, 8)}`;
  const entityCode  = `AUTO-DOC-${runId.slice(0, 8).toUpperCase()}`;

  const canonicalFields: Record<string, any> = { doc_type: docType };
  for (const a of docAttrs) {
    canonicalFields[a.field_key] = a.value_normalized;
  }

  const entity: InsertCdmEntity = {
    entityCode,
    entityType: "DOCUMENT",
    displayName,
    canonicalFields,
    identifiers: [],
    relationships: [],
    sourceEvidenceIds: [evidenceId],
    isGoldenRecord: false,
    confidenceScore:
      docAttrs.length
        ? docAttrs.reduce((s, a) => s + a.confidence_score, 0) / docAttrs.length
        : 0,
    schemaVersion: "1.0",
    tenantId: "TENANT-001",
  };

  return { entity, sourceAttrKeys: docAttrs.map(a => a.field_key) };
}
