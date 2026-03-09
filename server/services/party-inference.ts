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

// ─── Party inference from normalized attributes ───────────────────────────────
export function inferParties(
  attrs: NormalizedAttribute[],
  evidenceId: string,
  docType: string,
  runId: string
): InferredParty[] {
  if (!ADRS_CONFIG.features.auto_party_creation) return [];

  const threshold = ADRS_CONFIG.thresholds.party_creation_confidence;
  const parties: InferredParty[] = [];

  // Group PARTY attributes by potential "person cluster" vs "org cluster"
  const partyAttrs = attrs.filter(
    a => a.subject_type === "PARTY" &&
      (a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED") &&
      a.confidence_score >= threshold
  );

  if (partyAttrs.length === 0) return [];

  // Build a single inferred party per extraction run (merge all PARTY fields into one entity)
  // Determine PERSON vs ORGANIZATION by field keys
  const nameAttr      = partyAttrs.find(a => a.field_key.includes("person_name") || a.field_key === "name");
  const orgNameAttr   = partyAttrs.find(a => a.field_key.includes("organization") || a.field_key.includes("company") || a.field_key.includes("vendor") || a.field_key.includes("supplier"));
  const emailAttr     = partyAttrs.find(a => a.field_key.includes("email"));
  const phoneAttr     = partyAttrs.find(a => a.field_key.includes("phone") || a.field_key.includes("mobile"));
  const addressAttr   = partyAttrs.find(a => a.field_key.includes("address"));
  const nationalIdAttr = partyAttrs.find(a => a.field_key.includes("national_id") || a.field_key.includes("id_number"));

  // Only create a party if we have at least a name, email, or phone
  if (!nameAttr && !orgNameAttr && !emailAttr && !phoneAttr) return [];

  const isOrg = !!orgNameAttr && !nameAttr;
  const entityType = isOrg ? "ORGANIZATION" : "PERSON";
  const displayName = (orgNameAttr ?? nameAttr)!.value_normalized;
  const entityCode  = `AUTO-${entityType.slice(0, 3)}-${runId.slice(0, 8).toUpperCase()}`;

  const canonicalFields: Record<string, any> = {};
  if (nameAttr)     canonicalFields.name    = nameAttr.value_normalized;
  if (orgNameAttr)  canonicalFields.org_name = orgNameAttr.value_normalized;
  if (emailAttr)    canonicalFields.email   = emailAttr.value_normalized;
  if (phoneAttr)    canonicalFields.phone   = phoneAttr.value_normalized;
  if (addressAttr)  canonicalFields.address = addressAttr.value_normalized;
  if (nationalIdAttr) canonicalFields.national_id = nationalIdAttr.value_normalized;

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

  const sourceAttrKeys = partyAttrs.map(a => a.field_key);

  // Will add MENTIONED_IN relationship to document entity at route level (once doc entity is known)
  const relationships: InferredParty["relationships"] = [];

  const entity: InsertCdmEntity = {
    entityCode,
    entityType,
    displayName,
    canonicalFields,
    identifiers,
    relationships,
    sourceEvidenceIds: [evidenceId],
    isGoldenRecord: false,
    confidenceScore: Math.max(...partyAttrs.map(a => a.confidence_score)),
    schemaVersion: "1.0",
    tenantId: "TENANT-001",
  };

  parties.push({ entity, sourceAttrKeys, identifiers, relationships });
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
    a => a.subject_type === "DOCUMENT" &&
      (a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED")
  );
  if (docAttrs.length === 0) return null;

  const titleAttr  = docAttrs.find(a => a.field_key.includes("title") || a.field_key.includes("report_title"));
  const numberAttr = docAttrs.find(a => a.field_key.includes("number") || a.field_key.includes("ref") || a.field_key.includes("code"));
  const dateAttr   = docAttrs.find(a => a.field_key.includes("date"));

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
    confidenceScore: docAttrs.length ? docAttrs.reduce((s, a) => s + a.confidence_score, 0) / docAttrs.length : 0,
    schemaVersion: "1.0",
    tenantId: "TENANT-001",
  };

  return { entity, sourceAttrKeys: docAttrs.map(a => a.field_key) };
}
