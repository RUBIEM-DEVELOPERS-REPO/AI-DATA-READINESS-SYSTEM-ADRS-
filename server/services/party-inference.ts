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

// ─── Organisation-indicator tokens ───────────────────────────────────────────
// If any of these tokens appear in an entity name it is very likely an organisation.
const ORG_INDICATORS = new Set([
  "ltd", "limited", "inc", "incorporated", "corp", "corporation", "co", "llc", "plc",
  "gmbh", "bv", "pty", "pvt", "ngo", "npo", "cbo", "sacco",
  "foundation", "institute", "association", "trust", "fund",
  "bank", "authority", "ministry", "department", "council", "board", "agency",
  "group", "holdings", "enterprises", "solutions", "services", "industries",
  "technologies", "tech", "international", "africa", "global",
  "school", "college", "university", "hospital", "clinic", "government",
  "municipality", "commission", "bureau", "office",
]);

/**
 * Returns true when a name looks like an individual human name rather than an
 * organisation — used to correct prefix-map misclassifications.
 *
 * Decision rules (applied in order):
 *  1. If ANY org-indicator token appears → not a person.
 *  2. If the name is 2–4 space-separated tokens (title/first/middle/last) → person.
 *  3. Otherwise → ambiguous, leave as-is (caller keeps the prefix-map value).
 */
function looksLikePersonName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  const lower = name.toLowerCase();
  const tokens = lower.split(/[\s,.\-&/]+/).filter(Boolean);
  if (tokens.some(t => ORG_INDICATORS.has(t))) return false;
  return tokens.length >= 2 && tokens.length <= 4;
}

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

    // Find the primary name field for this cluster (needed for heuristic below)
    const nameAttr    = groupAttrs.find(a => a.field_key === `${prefix}_name` || a.field_key === "name");
    const emailAttr   = groupAttrs.find(a => a.field_key.includes("email"));
    const phoneAttr   = groupAttrs.find(a => a.field_key.includes("phone") || a.field_key.includes("mobile"));
    const addressAttr = groupAttrs.find(a => a.field_key.includes("address"));
    const nationalIdAttr = groupAttrs.find(
      a => a.field_key.includes("national_id") || a.field_key.includes("id_number")
    );

    // Skip clusters with no identifying signal at all
    if (!nameAttr && !emailAttr && !phoneAttr) continue;

    // Determine entity type from prefix map; unknown prefixes → ORGANIZATION
    let entityType: "PERSON" | "ORGANIZATION" = PARTY_PREFIX_TYPES[prefix] ?? "ORGANIZATION";

    // Heuristic override: if prefix says ORGANIZATION but the primary name
    // looks like a human name (2–4 tokens, no org-indicator words), reclassify
    // to PERSON so "John Doe" is not stored as an organisation.
    if (entityType === "ORGANIZATION" && nameAttr && looksLikePersonName(nameAttr.value_normalized)) {
      entityType = "PERSON";
    }

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

// ─── Party inference from raw AI entity list ─────────────────────────────────
/**
 * Converts the raw `extractedEntities` array from the AI extraction result into
 * CDM entities for PERSON and ORGANIZATION entries.
 *
 * This captures every person and organisation the AI detected in the document text
 * that was NOT already promoted via the prefix-based field grouping (inferParties).
 * The `skipNames` set (normalised sorted tokens) prevents creating duplicates of
 * entities already created by inferParties.
 *
 * Zero hallucination: only values already returned by the AI extraction are used.
 */
export function inferPartiesFromRawEntities(
  rawEntities: Array<{ entity: string; value: string; confidence: number }>,
  evidenceId: string,
  runId: string,
  skipNames: Set<string> = new Set()
): InferredParty[] {
  if (!ADRS_CONFIG.features.auto_party_creation) return [];

  const threshold = ADRS_CONFIG.thresholds.party_creation_confidence * 0.8; // slightly lower bar for raw entities
  const parties: InferredParty[] = [];
  const seenNormalised = new Set<string>();
  let idx = 0;

  for (let i = 0; i < rawEntities.length; i++) {
    const ent = rawEntities[i];
    const rawType = String(ent.entity ?? "").toUpperCase().trim();
    if (rawType !== "PERSON" && rawType !== "ORGANIZATION") continue;
    if ((ent.confidence ?? 0) < threshold) continue;

    const rawName = String(ent.value ?? "").trim();
    if (!rawName || rawName.length < 2) continue;

    // Normalise: lowercase, sort tokens — used for dedup only, not stored
    const normKey = rawName.toLowerCase().split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ");
    if (seenNormalised.has(normKey)) continue;
    if (skipNames.has(normKey)) continue;
    seenNormalised.add(normKey);

    // Apply heuristic: re-classify ORGANIZATION if the name looks like a human name
    let entityType: "PERSON" | "ORGANIZATION" = rawType === "PERSON" ? "PERSON" : "ORGANIZATION";
    if (entityType === "ORGANIZATION" && looksLikePersonName(rawName)) entityType = "PERSON";

    const entityCode = `AUTO-${entityType.slice(0, 3)}-ENT-${runId.slice(0, 8).toUpperCase()}-${idx}`;

    // ── Correlate nearby contact entities (EMAIL, PHONE, ADDRESS) ──────────────
    // Look within a window of ±4 positions in the raw entity list.
    const windowStart = Math.max(0, i - 4);
    const windowEnd   = Math.min(rawEntities.length - 1, i + 4);
    const windowEnts  = rawEntities.slice(windowStart, windowEnd + 1);

    let emailVal: string | undefined;
    let phoneVal: string | undefined;
    let addressVal: string | undefined;

    for (const w of windowEnts) {
      const wt = String(w.entity ?? "").toUpperCase().trim();
      if (wt === "EMAIL" && !emailVal && w.value?.includes("@")) emailVal = w.value.trim();
      if (wt === "PHONE" && !phoneVal && w.value?.trim()) phoneVal = w.value.trim();
      if (wt === "ADDRESS" && !addressVal && w.value?.trim()) addressVal = w.value.trim();
    }

    // Build canonical fields with contact details
    const canonicalFields: Record<string, any> = { name: rawName, source: "entity_extraction" };
    if (emailVal) canonicalFields.email = emailVal;
    if (phoneVal) canonicalFields.phone = phoneVal;
    if (addressVal) canonicalFields.address = addressVal;

    // Build identifiers
    const identifiers: InferredParty["identifiers"] = [];
    if (emailVal) identifiers.push({ id_type_label: "Email", id_value: emailVal, is_verified: false });
    if (phoneVal) identifiers.push({ id_type_label: "Phone", id_value: phoneVal, is_verified: false });

    const entity: InsertCdmEntity = {
      entityCode,
      entityType,
      displayName: rawName,
      canonicalFields,
      identifiers,
      relationships: [],
      sourceEvidenceIds: [evidenceId],
      isGoldenRecord: false,
      confidenceScore: Math.min(1, ent.confidence ?? 0.75),
      schemaVersion: "1.0",
      tenantId: "TENANT-001",
    };

    parties.push({ entity, sourceAttrKeys: [], identifiers, relationships: [] });
    idx++;
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
