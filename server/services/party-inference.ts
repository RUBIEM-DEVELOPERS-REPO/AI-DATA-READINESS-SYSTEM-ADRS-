import crypto from "crypto";
import type { NormalizedAttribute, InsertCdmEntity } from "@shared/schema";
import { ADRS_CONFIG } from "../config";
import { buildContactBindings, applyContactBindingsToParty } from "./contact-binding";
import { classifyEntityForCdm } from "./entity-type-correction";

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

// ─── Raw entity-type keys that are contacts, not party roles ─────────────────
const SKIP_RAW_ENTITY_PREFIXES = new Set([
  "email", "phone", "address", "location", "money", "date",
  "reference", "organization", "person", "asset", "document",
  "url", "id", "name",
]);

// ─── Organisation-indicator tokens ───────────────────────────────────────────
const ORG_INDICATORS = new Set([
  "ltd", "limited", "inc", "incorporated", "corp", "corporation", "co", "llc", "plc",
  "gmbh", "bv", "pty", "pvt", "ngo", "npo", "cbo", "sacco", "lp", "llp",
  "foundation", "institute", "institution", "association", "trust", "fund", "charity",
  "bank", "authority", "ministry", "department", "council", "board", "agency",
  "municipality", "commission", "bureau", "office", "cooperative", "co-operative",
  "group", "holdings", "enterprises", "solutions", "services", "industries",
  "technologies", "tech", "international", "africa", "global", "regional", "national",
  "school", "college", "university", "academy", "polytechnic",
  "hospital", "clinic", "centre", "center", "pharmacy", "health",
  "government", "parliament", "senate", "municipal",
  "mine", "mines", "mining", "quarry", "quarries", "colliery",
  "gold", "silver", "platinum", "diamond", "coal", "oil", "gas", "petroleum",
  "steel", "metals", "metallurgy", "chemicals", "pharmaceuticals", "pharma",
  "energy", "power", "electricity", "utilities", "station", "plant", "works", "dam",
  "pipeline", "grid", "hub", "port", "airport", "railway", "roads",
  "project", "projects", "programme", "program", "initiative", "scheme", "development",
  "estate", "estates", "properties", "property", "developments", "construction",
  "engineering", "contractors", "contracting", "architects", "architecture",
  "consultants", "consulting", "advisors", "advisory", "lawyers", "attorneys",
  "solicitors", "advocates", "law", "legal", "accounting", "auditors",
  "farm", "farms", "ranch", "ranches", "agriculture", "agro",
  "logistics", "transport", "transportation", "airlines", "airways", "shipping",
  "freight", "cargo", "movers",
  "lodge", "resort", "camp", "hotel", "motel", "inn", "investments", "ventures",
  "partners", "partnership", "traders", "commerce", "trading", "distributors",
  "suppliers", "manufacturers", "manufacturing",
  "media", "communications", "networks", "telecoms", "telecom", "systems", "digital",
  "zesa", "zinwa", "zimra", "nssa", "nust", "zupco", "cabs", "agribank", "posb",
]);

const PARTY_PREFIX_TYPES: Record<string, "PERSON" | "ORGANIZATION"> = {
  vendor: "ORGANIZATION", supplier: "ORGANIZATION", customer: "ORGANIZATION",
  client: "ORGANIZATION", buyer: "ORGANIZATION", company: "ORGANIZATION",
  contractor: "ORGANIZATION", employer: "ORGANIZATION", bank: "ORGANIZATION",
  institution: "ORGANIZATION", lender: "ORGANIZATION", payee: "ORGANIZATION",
  payer: "ORGANIZATION", issuer: "ORGANIZATION",
  borrower: "PERSON", signatory: "PERSON", person: "PERSON",
  employee: "PERSON", director: "PERSON", officer: "PERSON",
  guarantor: "PERSON", surety: "PERSON", witness: "PERSON",
  agent: "PERSON", recipient: "PERSON", candidate: "PERSON", applicant: "PERSON",
};

function looksLikePersonName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  const lower = name.toLowerCase();
  const tokens = lower.split(/[\s,.\-&/()+]+/).filter(Boolean);
  if (tokens.some(t => ORG_INDICATORS.has(t))) return false;
  const origTokens = name.trim().split(/[\s,.\-&/()+]+/).filter(Boolean);
  if (origTokens.length <= 3 && origTokens.every(t => /^[A-Z]{2,}$/.test(t))) return false;
  if (tokens.length > 4) return false;
  return tokens.length >= 2;
}

// ─── Deterministic fingerprint ────────────────────────────────────────────────
// SHA-256(tenantId:entityType:evidenceId:roleKey) — prevents re-extraction duplicates
function computeFingerprint(tenantId: string, entityType: string, evidenceId: string, roleKey: string): string {
  return crypto
    .createHash("sha256")
    .update(`${tenantId}:${entityType}:${evidenceId}:${roleKey}`)
    .digest("hex")
    .slice(0, 32);
}

// ─── Lifecycle assignment from trust score + entity quality ───────────────────
function assignLifecycle(
  confidence: number,
  nameTokenCount: number,
  entityType: "PERSON" | "ORGANIZATION" | "DOCUMENT"
): { lifecycle: string; reason: string } {
  const cfg = ADRS_CONFIG.lifecycle;

  if (confidence < cfg.quarantine_trust_threshold) {
    return { lifecycle: "QUARANTINED", reason: `Confidence ${(confidence * 100).toFixed(0)}% is below quarantine threshold ${(cfg.quarantine_trust_threshold * 100).toFixed(0)}%` };
  }
  if (entityType === "PERSON" && nameTokenCount < cfg.person_min_name_tokens) {
    return { lifecycle: "QUARANTINED", reason: `Person entity has only ${nameTokenCount} name token(s); minimum is ${cfg.person_min_name_tokens} for CANDIDATE promotion` };
  }
  // Documents auto-promoted to CANDIDATE (they represent concrete evidence)
  if (entityType === "DOCUMENT") {
    return { lifecycle: "CANDIDATE", reason: "Document entity auto-promoted to CANDIDATE on creation" };
  }
  return { lifecycle: "CANDIDATE", reason: `Confidence ${(confidence * 100).toFixed(0)}% meets CANDIDATE threshold` };
}

// ─── Party inference from normalized attributes ───────────────────────────────
export function inferParties(
  attrs: NormalizedAttribute[],
  evidenceId: string,
  docType: string,
  runId: string,
  tenantId: string = "TENANT-001"
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

  // ── Build contact bindings for all attributes ────────────────────────────────
  const contactResult = buildContactBindings(approvedPartyAttrs, [], docType);

  // ── Group attributes by their field-key prefix ──────────────────────────────
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
    if (SKIP_RAW_ENTITY_PREFIXES.has(prefix)) continue;

    const nameAttr    = groupAttrs.find(a => a.field_key === `${prefix}_name` || a.field_key === "name");
    const nationalIdAttr = groupAttrs.find(
      a => a.field_key.includes("national_id") || a.field_key.includes("id_number")
    );

    if (!nameAttr && !groupAttrs.some(a => a.field_key.includes("email") || a.field_key.includes("phone"))) continue;

    const displayName = nameAttr?.value_normalized ??
      groupAttrs.find(a => a.field_key.includes("email"))?.value_normalized ??
      groupAttrs.find(a => a.field_key.includes("phone"))?.value_normalized ??
      `${prefix}-${runId.slice(0, 8).toUpperCase()}-${partyIndex}`;

    // ── Entity type correction ────────────────────────────────────────────────
    let entityType: "PERSON" | "ORGANIZATION" = PARTY_PREFIX_TYPES[prefix] ?? "ORGANIZATION";
    if (entityType === "ORGANIZATION" && nameAttr && looksLikePersonName(nameAttr.value_normalized)) {
      entityType = "PERSON";
    }
    const typeDecision = classifyEntityForCdm(displayName, entityType, Math.max(...groupAttrs.map(a => a.confidence_score)));
    if (typeDecision.action === "skip") continue; // e.g. skill/role values used as party name

    const confidence = Math.max(...groupAttrs.map(a => a.confidence_score));
    const nameTokenCount = displayName.split(/\s+/).filter(Boolean).length;
    const { lifecycle, reason: lifecycleReason } = assignLifecycle(confidence, nameTokenCount, entityType);

    const entityCode = `AUTO-${entityType.slice(0, 3)}-${runId.slice(0, 8).toUpperCase()}-${partyIndex}`;
    const fingerprint = computeFingerprint(tenantId, entityType, evidenceId, prefix);

    // ── Canonical fields ──────────────────────────────────────────────────────
    const canonicalFields: Record<string, any> = {};
    for (const attr of groupAttrs) {
      const shortKey = attr.field_key.startsWith(`${prefix}_`) ? attr.field_key.slice(prefix.length + 1) : attr.field_key;
      canonicalFields[shortKey] = attr.value_normalized;
    }

    // ── Contact identifiers from strict contact binding ───────────────────────
    const boundIdentifiers = applyContactBindingsToParty(prefix, contactResult);
    const identifiers: InferredParty["identifiers"] = boundIdentifiers.map(b => ({
      id_type_label: b.id_type_label,
      id_value: b.id_value,
      is_verified: b.is_verified,
    }));
    if (nationalIdAttr) {
      identifiers.push({ id_type_label: "National ID", id_value: nationalIdAttr.value_normalized, is_verified: nationalIdAttr.validation_state === "APPROVED" });
    }

    // Sync contact values back to canonicalFields from strict bindings
    const rc = contactResult.byRole.get(prefix);
    if (rc?.email) canonicalFields.email = rc.email.contact_value;
    if (rc?.phone) canonicalFields.phone = rc.phone.contact_value;
    if (rc?.address) canonicalFields.address = rc.address.contact_value;

    const entity: InsertCdmEntity = {
      entityCode,
      entityType,
      displayName,
      canonicalFields,
      identifiers,
      relationships: [],
      sourceEvidenceIds: [evidenceId],
      isGoldenRecord: false,
      confidenceScore: confidence,
      schemaVersion: "1.0",
      tenantId,
      entityLifecycle: lifecycle,
      lifecycleReason,
      entityFingerprint: fingerprint,
      contactBindingAudit: {
        binding_count: identifiers.length,
        quarantined_count: contactResult.allQuarantined.length,
        document_level_count: contactResult.documentLevel.length,
        summary: contactResult.summary,
      },
    };

    parties.push({ entity, sourceAttrKeys: groupAttrs.map(a => a.field_key), identifiers, relationships: [] });
    partyIndex++;
  }

  return parties;
}

// ─── Party inference from raw AI entity list ─────────────────────────────────
/**
 * Converts raw extractedEntities into CDM entities for PERSON and ORGANIZATION.
 *
 * v2 changes:
 *  - Entity type correction: skip skills, roles, certs, languages, locations
 *  - Contact binding: replaced ±4 window with strict contact-binding service (±2 max)
 *  - Fingerprints: deterministic SHA-256 per (tenantId:type:evidenceId:i)
 *  - Lifecycle: QUARANTINED if confidence < threshold or single-token name
 *  - Config-driven min confidence (raw_entity_min_confidence)
 */
export function inferPartiesFromRawEntities(
  rawEntities: Array<{ entity: string; value: string; confidence: number }>,
  evidenceId: string,
  runId: string,
  skipNames: Set<string> = new Set(),
  tenantId: string = "TENANT-001"
): InferredParty[] {
  if (!ADRS_CONFIG.features.auto_party_creation) return [];

  const threshold = ADRS_CONFIG.lifecycle.raw_entity_min_confidence;
  const parties: InferredParty[] = [];
  const seenNormalised = new Set<string>();
  let idx = 0;

  // ── Build contact bindings for raw entity list ────────────────────────────────
  // The contact-binding service handles the strict adjacency (±2) and section isolation.
  const emptyAttrs: NormalizedAttribute[] = [];
  const contactResult = buildContactBindings(emptyAttrs, rawEntities, "OTHER");

  for (let i = 0; i < rawEntities.length; i++) {
    const ent = rawEntities[i];
    const rawType = String(ent.entity ?? "").toUpperCase().trim();
    if (rawType !== "PERSON" && rawType !== "ORGANIZATION") continue;
    if ((ent.confidence ?? 0) < threshold) continue;

    const rawName = String(ent.value ?? "").trim();
    if (!rawName || rawName.length < 2) continue;

    const normKey = rawName.toLowerCase().split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ");
    if (seenNormalised.has(normKey)) continue;
    if (skipNames.has(normKey)) continue;
    seenNormalised.add(normKey);

    // Determine entity type with heuristic correction
    let entityType: "PERSON" | "ORGANIZATION" = rawType === "PERSON" ? "PERSON" : "ORGANIZATION";
    if (entityType === "ORGANIZATION" && looksLikePersonName(rawName)) entityType = "PERSON";

    // ── Entity type correction — skip non-entity values ───────────────────────
    const typeDecision = classifyEntityForCdm(rawName, entityType, ent.confidence ?? 0.75);
    if (typeDecision.action === "skip") continue;

    const confidence = Math.min(1, ent.confidence ?? 0.75);
    const nameTokens = rawName.split(/\s+/).filter(Boolean);
    const nameTokenCount = nameTokens.length;

    const { lifecycle, reason: lifecycleReason } = assignLifecycle(confidence, nameTokenCount, entityType);
    // If quarantined by type decision, respect that
    const finalLifecycle = typeDecision.action === "quarantine" ? "QUARANTINED" : lifecycle;
    const finalLifecycleReason = typeDecision.action === "quarantine" ? typeDecision.reason : lifecycleReason;

    const entityCode = `AUTO-${entityType.slice(0, 3)}-ENT-${runId.slice(0, 8).toUpperCase()}-${idx}`;
    const fingerprint = computeFingerprint(tenantId, entityType, evidenceId, `raw_${i}`);

    // ── Get contacts from the strict contact binding result ───────────────────
    // The binding service uses a synthetic role key per entity position.
    const roleKey = `raw_entity_${i}`;
    const boundIdentifiers = applyContactBindingsToParty(roleKey, contactResult);
    const identifiers: InferredParty["identifiers"] = boundIdentifiers.map(b => ({
      id_type_label: b.id_type_label,
      id_value: b.id_value,
      is_verified: b.is_verified,
    }));

    // Build canonical fields with strictly-bound contacts only
    const canonicalFields: Record<string, any> = { name: rawName, source: "entity_extraction" };
    const rc = contactResult.byRole.get(roleKey);
    if (rc?.email) canonicalFields.email = rc.email.contact_value;
    if (rc?.phone) canonicalFields.phone = rc.phone.contact_value;
    if (rc?.address) canonicalFields.address = rc.address.contact_value;

    const entity: InsertCdmEntity = {
      entityCode,
      entityType,
      displayName: rawName,
      canonicalFields,
      identifiers,
      relationships: [],
      sourceEvidenceIds: [evidenceId],
      isGoldenRecord: false,
      confidenceScore: confidence,
      schemaVersion: "1.0",
      tenantId,
      entityLifecycle: finalLifecycle,
      lifecycleReason: finalLifecycleReason,
      entityFingerprint: fingerprint,
      contactBindingAudit: {
        binding_count: identifiers.length,
        binding_method: identifiers.length > 0 ? "adjacent_entity" : "none",
      },
    };

    parties.push({ entity, sourceAttrKeys: [], identifiers, relationships: [] });
    idx++;
  }

  return parties;
}

// ─── Weak display name detector ───────────────────────────────────────────────
const WEAK_DISPLAY_PATTERNS = [
  /^(available upon request|upon request|on request|see (above|cv|attached|document)|as per cv|as above|same as above|to be (advised|determined|confirmed)|refer to cv)$/i,
  /^(n\/a|na|none|null|undefined|unknown|tbd|pending|not (applicable|specified|stated|provided|available|listed))$/i,
  /^[.\-_\s]+$/,
];
function isWeakDisplayName(s: string): boolean {
  if (!s || s.trim().length < 3) return true;
  return WEAK_DISPLAY_PATTERNS.some(p => p.test(s.trim()));
}

// ─── Document entity inference ────────────────────────────────────────────────
/**
 * Always creates a DOCUMENT CDM entity — guaranteeing one lineage node per evidence.
 *
 * Display name priority:
 *  1. Explicit title / report_title attribute
 *  2. Reference / invoice / contract number  →  "{DOC_TYPE} #{number}"
 *  3. Subject of document  →  e.g. "CV — Jane Smith"
 *  4. Vendor / issuer name
 *  5. Evidence file name (extension stripped)
 *  6. Readable doc-type label as last resort
 */
export function inferDocument(
  attrs: NormalizedAttribute[],
  evidenceId: string,
  docType: string,
  runId: string,
  evidenceFileName?: string,
  tenantId: string = "TENANT-001"
): InferredDocument | null {
  if (!ADRS_CONFIG.features.auto_party_creation) return null;

  const approved = (state: string) => state === "AUTO_APPROVED" || state === "APPROVED";
  const docAttrs  = attrs.filter(a => a.subject_type === "DOCUMENT" && approved(a.validation_state));
  const allAttrs  = attrs.filter(a => approved(a.validation_state));

  const entityCode = `AUTO-DOC-${runId.slice(0, 8).toUpperCase()}`;

  const pick = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const a = allAttrs.find(a => a.field_key === key || a.field_key.endsWith(`_${key}`));
      if (a && !isWeakDisplayName(a.value_normalized)) return a.value_normalized;
    }
    return undefined;
  };

  const titleVal   = pick(["title", "report_title", "document_title", "subject"]);
  const numVal     = pick(["invoice_number", "contract_number", "reference_number", "ref_no", "order_number", "permit_number"]);
  const subjectVal = pick(["candidate_name", "applicant_name", "employee_name", "patient_name"]);
  const vendorVal  = pick(["vendor_name", "supplier_name", "issuer_name"]);
  const docTypeLabel = docType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  let displayName: string;
  if (titleVal) {
    displayName = titleVal;
  } else if (numVal) {
    displayName = `${docTypeLabel} #${numVal}`;
  } else if (subjectVal) {
    displayName = `${docTypeLabel} — ${subjectVal}`;
  } else if (vendorVal) {
    displayName = vendorVal;
  } else if (evidenceFileName) {
    displayName = evidenceFileName.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim();
  } else {
    displayName = docTypeLabel;
  }

  const canonicalFields: Record<string, any> = { doc_type: docType };
  for (const a of docAttrs) {
    canonicalFields[a.field_key] = a.value_normalized;
  }

  const avgConf = docAttrs.length
    ? docAttrs.reduce((s, a) => s + a.confidence_score, 0) / docAttrs.length
    : 0.70;

  const fingerprint = computeFingerprint(tenantId, "DOCUMENT", evidenceId, "document");

  const entity: InsertCdmEntity = {
    entityCode,
    entityType: "DOCUMENT",
    displayName,
    canonicalFields,
    identifiers: [],
    relationships: [],
    sourceEvidenceIds: [evidenceId],
    isGoldenRecord: false,
    confidenceScore: Math.max(0.70, avgConf),
    schemaVersion: "1.0",
    tenantId,
    entityLifecycle: "CANDIDATE",
    lifecycleReason: "Document entity auto-promoted to CANDIDATE on creation",
    entityFingerprint: fingerprint,
  };

  return { entity, sourceAttrKeys: docAttrs.map(a => a.field_key) };
}

// ─── Doc relationship type resolver (re-exported for routes.ts) ───────────────
export function resolveDocRelationshipType(sourceAttrKeys: string[], docType: string): string {
  const docTypeLower = docType.toLowerCase();
  const profiles = ADRS_CONFIG.doc_type_profiles[docType] ?? ADRS_CONFIG.doc_type_profiles["OTHER"] ?? ["generic"];

  // Check if any active profile has a richer relationship for these keys
  for (const profileName of profiles) {
    const profile = ADRS_CONFIG.relationship_profiles[profileName] ?? {};
    const keyStr = sourceAttrKeys.join(" ").toLowerCase();

    if (profile.EMPLOYED_BY && (keyStr.includes("employer") || keyStr.includes("employee"))) return "EMPLOYED_BY";
    if (profile.STUDIED_AT && (keyStr.includes("institution") || keyStr.includes("school") || keyStr.includes("university"))) return "STUDIED_AT";
    if (profile.GRADUATED_FROM && keyStr.includes("graduated")) return "GRADUATED_FROM";
    if (profile.PAYEE_IN && keyStr.includes("payee")) return "PAYEE_IN";
    if (profile.PAYER_IN && keyStr.includes("payer")) return "PAYER_IN";
    if (profile.PARTY_TO && (keyStr.includes("party") || keyStr.includes("contractor") || keyStr.includes("client"))) return "PARTY_TO";
  }

  // Fallback to core generic types
  const keyStr = sourceAttrKeys.join(" ").toLowerCase();
  if (keyStr.includes("candidate") || keyStr.includes("applicant")) return "SUBJECT_OF";
  if (keyStr.includes("vendor") || keyStr.includes("supplier") || keyStr.includes("issuer")) return "ISSUED_BY";
  if (keyStr.includes("customer") || keyStr.includes("client") || keyStr.includes("buyer")) return "ISSUED_TO";
  if (keyStr.includes("signatory") || keyStr.includes("witness")) return "SIGNATORY_OF";

  return "MENTIONED_IN";
}
