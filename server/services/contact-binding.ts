/**
 * Contact Binding Service
 *
 * Strict attribution of contact signals (email, phone, address) to the correct
 * party entity.  Prevents cross-entity contamination — the root cause of wrong
 * contacts being assigned to candidates/vendors/references in CV and invoice docs.
 *
 * Design:
 *   1. Prefix ownership   — vendor_email belongs to vendor only
 *   2. Cross-entity check — same contact in 2+ groups → quarantine everywhere
 *   3. Raw-entity strict  — raw entity contacts only bind at distance ≤ 2
 *   4. Section isolation  — contacts following a reference person → quarantine
 *   5. Document-level     — unprefixed, un-attributable contacts → doc-level only
 */

import type { NormalizedAttribute } from "@shared/schema";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ContactType = "email" | "phone" | "address";

export type BindingMethod =
  | "prefix_match"        // field key carries an explicit owner prefix
  | "adjacent_entity"     // immediately adjacent in the raw entity list
  | "document_level"      // cannot be attributed to any party
  | "quarantined";        // ambiguous; not committed to any entity

export interface ContactBinding {
  contact_type: ContactType;
  contact_value: string;
  contact_value_raw: string;
  owner_role: string;                       // prefix or "document"
  owner_entity_type: "PERSON" | "ORGANIZATION" | "DOCUMENT";
  confidence: number;
  binding_method: BindingMethod;
  binding_reason: string;
  is_quarantined: boolean;
  quarantine_reason?: string;
  evidence_field_key?: string;              // originating NormalizedAttribute.field_key
}

export interface RoleContacts {
  email?: ContactBinding;
  phone?: ContactBinding;
  address?: ContactBinding;
  quarantined: ContactBinding[];
}

/** Full output of the contact binding pass. */
export interface ContactBindingResult {
  /** Per-role contact set, keyed by party prefix (e.g. "vendor", "candidate") */
  byRole: Map<string, RoleContacts>;
  /** Contacts that belong to the document, not any specific party */
  documentLevel: ContactBinding[];
  /** All quarantined bindings across all roles */
  allQuarantined: ContactBinding[];
  /** Summary counts for observability */
  summary: {
    total_contacts_found: number;
    bound: number;
    quarantined: number;
    document_level: number;
  };
}

// ─── Section header tokens that indicate a reference/employer section ─────────
const REFERENCE_SECTION_TOKENS = new Set([
  "reference", "references", "referee", "referees",
  "character reference", "professional reference",
  "contact for reference",
]);

const EMPLOYER_SECTION_TOKENS = new Set([
  "employer", "employers", "company", "organization", "organisation",
  "workplace", "employer details",
]);

// ─── Ownership prefix map (mirrors PARTY_PREFIX_TYPES in party-inference) ────
const PREFIX_ENTITY_TYPE: Record<string, "PERSON" | "ORGANIZATION"> = {
  vendor: "ORGANIZATION", supplier: "ORGANIZATION", customer: "ORGANIZATION",
  client: "ORGANIZATION", buyer: "ORGANIZATION", company: "ORGANIZATION",
  contractor: "ORGANIZATION", employer: "ORGANIZATION", bank: "ORGANIZATION",
  institution: "ORGANIZATION", lender: "ORGANIZATION", payee: "ORGANIZATION",
  payer: "ORGANIZATION", issuer: "ORGANIZATION",
  borrower: "PERSON", signatory: "PERSON", person: "PERSON",
  employee: "PERSON", director: "PERSON", officer: "PERSON",
  guarantor: "PERSON", surety: "PERSON", witness: "PERSON",
  agent: "PERSON", recipient: "PERSON", candidate: "PERSON",
  applicant: "PERSON",
};

// ─── Helper: check if a raw-entity type is a contact signal ──────────────────
function isContactEntityType(rawType: string): ContactType | null {
  const t = rawType.toUpperCase().trim();
  if (t === "EMAIL") return "email";
  if (t === "PHONE") return "phone";
  if (t === "ADDRESS") return "address";
  return null;
}

// ─── Helper: lightweight email format check ───────────────────────────────────
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// ─── Helper: lightweight phone check (at least 7 digits) ─────────────────────
function looksLikePhone(v: string): boolean {
  return v.replace(/\D/g, "").length >= 7;
}

// ─── Helper: determine if a section label suggests reference/employer context ─
function isReferenceSection(label: string): boolean {
  const l = label.toLowerCase().trim();
  return Array.from(REFERENCE_SECTION_TOKENS).some(t => l.includes(t));
}

function isEmployerSection(label: string): boolean {
  const l = label.toLowerCase().trim();
  return Array.from(EMPLOYER_SECTION_TOKENS).some(t => l === t);
}

// ─── Main contact binding function ───────────────────────────────────────────

/**
 * Builds a ContactBindingResult by applying the strict attribution rules.
 *
 * @param attrs        Deduped normalized attributes from the extraction run
 * @param rawEntities  Raw AI entity list in extraction order
 * @param docType      Document type string (e.g. "CV", "INVOICE")
 */
export function buildContactBindings(
  attrs: NormalizedAttribute[],
  rawEntities: Array<{ entity: string; value: string; confidence: number }>,
  docType: string
): ContactBindingResult {
  const byRole = new Map<string, RoleContacts>();
  const documentLevel: ContactBinding[] = [];
  const allQuarantined: ContactBinding[] = [];

  // ── Step 1: Prefix-based attribution ─────────────────────────────────────────
  // Group all contact-type attributes by their owner prefix.
  // These are the most trustworthy bindings (explicit AI field keys).

  const prefixedContacts = new Map<string, Map<ContactType, ContactBinding[]>>();

  for (const attr of attrs) {
    const key = attr.field_key.toLowerCase();
    let contactType: ContactType | null = null;
    if (key.includes("email")) contactType = "email";
    else if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) contactType = "phone";
    else if (key.includes("address")) contactType = "address";
    if (!contactType) continue;

    // Validate format
    const val = attr.value_normalized.trim();
    if (contactType === "email" && !looksLikeEmail(val)) continue;
    if (contactType === "phone" && !looksLikePhone(val)) continue;
    if (!val || val.length < 4) continue;

    // Determine prefix
    const underscoreIdx = key.indexOf("_");
    const prefix = underscoreIdx > 0 ? key.slice(0, underscoreIdx) : "document";

    if (prefix === "document" || prefix === "email" || prefix === "phone" || prefix === "address") {
      // No prefix → document-level candidate
      const binding: ContactBinding = {
        contact_type: contactType,
        contact_value: val,
        contact_value_raw: attr.value_raw,
        owner_role: "document",
        owner_entity_type: "DOCUMENT",
        confidence: attr.confidence_score * 0.8, // lower confidence for unprefixed
        binding_method: "document_level",
        binding_reason: "No party prefix found on field key; attributed to document",
        is_quarantined: false,
        evidence_field_key: attr.field_key,
      };
      documentLevel.push(binding);
      continue;
    }

    const ownerEntityType = PREFIX_ENTITY_TYPE[prefix] ?? "ORGANIZATION";
    const binding: ContactBinding = {
      contact_type: contactType,
      contact_value: val,
      contact_value_raw: attr.value_raw,
      owner_role: prefix,
      owner_entity_type: ownerEntityType,
      confidence: attr.confidence_score,
      binding_method: "prefix_match",
      binding_reason: `Field key "${attr.field_key}" explicitly names owner prefix "${prefix}"`,
      is_quarantined: false,
      evidence_field_key: attr.field_key,
    };

    if (!prefixedContacts.has(prefix)) prefixedContacts.set(prefix, new Map());
    const byType = prefixedContacts.get(prefix)!;
    if (!byType.has(contactType)) byType.set(contactType, []);
    byType.get(contactType)!.push(binding);
  }

  // ── Step 2: Cross-entity contamination check ──────────────────────────────────
  // If the same contact value appears attributed to 2+ distinct party prefixes,
  // quarantine ALL bindings of that contact (it's probably a company-wide contact
  // placed in the document header and incorrectly matched to multiple parties).

  const contactValueToRoles = new Map<string, Set<string>>();
  for (const [prefix, byType] of prefixedContacts) {
    for (const [, bindings] of byType) {
      for (const b of bindings) {
        const valKey = `${b.contact_type}::${b.contact_value.toLowerCase()}`;
        if (!contactValueToRoles.has(valKey)) contactValueToRoles.set(valKey, new Set());
        contactValueToRoles.get(valKey)!.add(prefix);
      }
    }
  }

  const contaminatedValues = new Set<string>();
  for (const [valKey, roles] of contactValueToRoles) {
    if (roles.size > 1) contaminatedValues.add(valKey);
  }

  // ── Step 3: Commit prefix bindings (skip contaminated ones) ──────────────────
  for (const [prefix, byType] of prefixedContacts) {
    const roleContacts: RoleContacts = { quarantined: [] };

    for (const [contactType, bindings] of byType) {
      // Pick highest-confidence binding for this type
      const best = bindings.sort((a, b) => b.confidence - a.confidence)[0];
      const valKey = `${best.contact_type}::${best.contact_value.toLowerCase()}`;

      if (contaminatedValues.has(valKey)) {
        const quarantined: ContactBinding = {
          ...best,
          is_quarantined: true,
          quarantine_reason: `Contact value "${best.contact_value}" appears under multiple party prefixes — cross-entity contamination. Attributed to document-level only.`,
          binding_method: "quarantined",
        };
        roleContacts.quarantined.push(quarantined);
        allQuarantined.push(quarantined);

        // Promote to document-level instead
        documentLevel.push({ ...quarantined, is_quarantined: false, binding_method: "document_level", owner_role: "document", owner_entity_type: "DOCUMENT" });
      } else {
        (roleContacts as any)[contactType] = best;
      }
    }

    byRole.set(prefix, roleContacts);
  }

  // ── Step 4: Raw-entity adjacent binding (strict distance ≤ 2) ────────────────
  // For parties found only in the raw entity list (no prefixed fields),
  // try to attribute nearby contacts.  Rules:
  //   - Maximum distance 2 positions in the entity list
  //   - Skip if the contact is already attributed via a prefixed field
  //   - Skip if the person appears after a "REFERENCES:" label (reference section)
  //   - Skip if binding would create a cross-entity contamination

  const prefixedContactValues = new Set<string>();
  for (const [, byType] of prefixedContacts) {
    for (const [, bindings] of byType) {
      for (const b of bindings) {
        prefixedContactValues.add(`${b.contact_type}::${b.contact_value.toLowerCase()}`);
      }
    }
  }

  // Track section state as we walk the entity list
  let inReferenceSection = false;
  let inEmployerSection  = false;

  for (let i = 0; i < rawEntities.length; i++) {
    const ent = rawEntities[i];
    const rawType = String(ent.entity ?? "").toUpperCase().trim();

    // Update section state
    if (rawType === "SECTION" || rawType === "LABEL" || rawType === "HEADING") {
      const label = String(ent.value ?? "");
      inReferenceSection = isReferenceSection(label);
      inEmployerSection  = isEmployerSection(label);
    }

    if (rawType !== "PERSON" && rawType !== "ORGANIZATION") continue;
    const name = String(ent.value ?? "").trim();
    if (!name || name.length < 2) continue;

    // Skip persons in the reference section — don't bind contacts to them
    // (reference persons' contacts should not flow to the candidate)
    if (inReferenceSection) continue;

    // Look in a tight window of ±2 for contact signals
    const windowStart = Math.max(0, i - 2);
    const windowEnd   = Math.min(rawEntities.length - 1, i + 2);

    for (let j = windowStart; j <= windowEnd; j++) {
      if (j === i) continue;
      const contact = rawEntities[j];
      const cType = isContactEntityType(String(contact.entity ?? ""));
      if (!cType) continue;

      const cVal = String(contact.value ?? "").trim();
      if (!cVal || cVal.length < 4) continue;
      if (cType === "email" && !looksLikeEmail(cVal)) continue;
      if (cType === "phone" && !looksLikePhone(cVal)) continue;

      const valKey = `${cType}::${cVal.toLowerCase()}`;

      // Skip if already attributed via a prefixed field
      if (prefixedContactValues.has(valKey)) continue;
      // Skip if contaminated
      if (contaminatedValues.has(valKey)) continue;

      // The role for raw-entity parties is auto-generated; they don't have prefixes.
      // We only bind adjacent contacts for raw-entity persons/orgs if confidence is high.
      const distance = Math.abs(j - i);
      const bindingConf = Math.min(0.80, (ent.confidence ?? 0.75) * (distance === 1 ? 1.0 : 0.85));

      // Quarantine employer section contacts (don't bind org contacts to candidate)
      if (inEmployerSection && rawType === "PERSON") {
        const qBinding: ContactBinding = {
          contact_type: cType,
          contact_value: cVal,
          contact_value_raw: cVal,
          owner_role: "raw_entity",
          owner_entity_type: "PERSON",
          confidence: bindingConf,
          binding_method: "quarantined",
          binding_reason: "Contact found in employer section; would pollute candidate entity",
          is_quarantined: true,
          quarantine_reason: "Employer section contact must not be attributed to a person entity",
        };
        allQuarantined.push(qBinding);
        continue;
      }

      const ownerEntityType: "PERSON" | "ORGANIZATION" =
        rawType === "PERSON" ? "PERSON" : "ORGANIZATION";

      // Use a synthetic role key for raw-entity parties
      const roleKey = `raw_entity_${i}`;
      if (!byRole.has(roleKey)) byRole.set(roleKey, { quarantined: [] });
      const rc = byRole.get(roleKey)!;

      // Only bind one contact per type per role (highest-confidence wins)
      const existing = (rc as any)[cType] as ContactBinding | undefined;
      if (!existing || bindingConf > existing.confidence) {
        (rc as any)[cType] = {
          contact_type: cType,
          contact_value: cVal,
          contact_value_raw: cVal,
          owner_role: roleKey,
          owner_entity_type: ownerEntityType,
          confidence: bindingConf,
          binding_method: "adjacent_entity",
          binding_reason: `Contact is ${distance} position(s) from "${name}" in entity list`,
          is_quarantined: false,
        } satisfies ContactBinding;
      }
    }
  }

  // ── Step 5: Summary ──────────────────────────────────────────────────────────
  let bound = 0;
  for (const [, rc] of byRole) {
    if (rc.email) bound++;
    if (rc.phone) bound++;
    if (rc.address) bound++;
  }

  const summary = {
    total_contacts_found: bound + allQuarantined.length + documentLevel.length,
    bound,
    quarantined: allQuarantined.length,
    document_level: documentLevel.length,
  };

  return { byRole, documentLevel, allQuarantined, summary };
}

/**
 * Apply contact bindings to a party entity's existing identifiers.
 * Replaces any identifiers that were set from the raw entity window (adjacent_entity)
 * with only those that have strict prefix-based attribution.
 *
 * Called from party-inference.ts after buildContactBindings().
 */
export function applyContactBindingsToParty(
  rolePrefix: string,
  result: ContactBindingResult
): Array<{ id_type_label: string; id_value: string; id_value_raw: string; is_verified: boolean; confidence: number; binding_method: BindingMethod }> {
  const rc = result.byRole.get(rolePrefix);
  const identifiers: ReturnType<typeof applyContactBindingsToParty> = [];

  if (!rc) return identifiers;

  if (rc.email) {
    identifiers.push({
      id_type_label: "Email",
      id_value: rc.email.contact_value,
      id_value_raw: rc.email.contact_value_raw,
      is_verified: rc.email.binding_method === "prefix_match",
      confidence: rc.email.confidence,
      binding_method: rc.email.binding_method,
    });
  }
  if (rc.phone) {
    identifiers.push({
      id_type_label: "Phone",
      id_value: rc.phone.contact_value,
      id_value_raw: rc.phone.contact_value_raw,
      is_verified: rc.phone.binding_method === "prefix_match",
      confidence: rc.phone.confidence,
      binding_method: rc.phone.binding_method,
    });
  }
  if (rc.address) {
    identifiers.push({
      id_type_label: "Address",
      id_value: rc.address.contact_value,
      id_value_raw: rc.address.contact_value_raw,
      is_verified: rc.address.binding_method === "prefix_match",
      confidence: rc.address.confidence,
      binding_method: rc.address.binding_method,
    });
  }

  return identifiers;
}
