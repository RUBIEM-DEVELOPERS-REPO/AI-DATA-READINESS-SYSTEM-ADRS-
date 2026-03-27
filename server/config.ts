// ─── ADRS System Configuration ───────────────────────────────────────────────
// All thresholds and feature flags are centralised here.
// In production these would be loaded from environment variables or a database config table.

export const ADRS_CONFIG = {

  // ─── Feature Flags ─────────────────────────────────────────────────────────
  features: {
    // Auto-create PARTY + Identifier CDM entities from name/email/phone fields
    auto_party_creation: true,
    // Enforce reference_number / invoice_number / contract_number regex
    strict_reference_pattern: true,
    // Block publishing when avg trust score is below publish_trust_block threshold
    publish_trust_blocking: true,
    // Auto-create ValidationTask for CONFLICT deduplications
    auto_validation_task_on_conflict: true,
    // Auto-create ValidationTask when extraction trust score < auto_validation_threshold
    auto_validation_task_on_low_trust: true,
    // Include rawText in GET /api/extractions response by default (false = omit unless ?include_text=true)
    include_text_by_default: false,
  },

  // ─── Auto-Approval Thresholds (per field key, confidence 0–1) ──────────────
  thresholds: {
    auto_approval: {
      email: 0.90,
      phone: 0.90,
      date: 0.85,
      reference_number: 0.88,
      invoice_number: 0.88,
      contract_number: 0.88,
      amount: 0.80,
      name: 0.75,
      person_name: 0.75,
      address: 0.70,
      default: 0.78,
    } as Record<string, number>,

    // Block publishing if ALL extraction runs for the dataset average below this
    publish_trust_block: 0.60,

    // Auto-create ValidationTask if trust score falls below this on any extraction run
    auto_validation_task: 0.70,

    // Minimum confidence to auto-create a PARTY entity from an extracted field
    party_creation_confidence: 0.75,
  },

  // ─── Reference Number Patterns ─────────────────────────────────────────────
  patterns: {
    // Must start alphanumeric, may contain hyphens/slashes, 3–40 chars total
    reference_number: /^[A-Z0-9][A-Z0-9\-\/]{2,39}$/,
    invoice_number:   /^[A-Z0-9][A-Z0-9\-\/]{2,29}$/,
    contract_number:  /^[A-Z0-9][A-Z0-9\-\/]{2,29}$/,
  } as Record<string, RegExp>,

  // ─── Trust Score Weights ────────────────────────────────────────────────────
  trust_weights: {
    ocr:         0.35,
    extraction:  0.25,
    completeness: 0.15,
    consistency:  0.15,
    doc_quality:  0.10,
  },

  // ─── Quality Gate Completeness Requirements ─────────────────────────────────
  required_fields_by_doc_type: {
    INVOICE:       ["invoice_number", "amount", "date", "supplier_name"],
    CONTRACT:      ["contract_number", "parties", "value", "start_date"],
    REPORT:        ["report_title", "organization"],
    IDENTITY:      ["name", "national_id"],
    FINANCIAL:     ["amount", "date"],
    PERMIT:        ["permit_number", "date", "issuing_authority"],
    CORRESPONDENCE:["recipient", "date"],
  } as Record<string, string[]>,

  // ─── Lifecycle & Quarantine Thresholds ───────────────────────────────────────
  lifecycle: {
    // Trust score below this → entity quarantined, not committed to CDM as CANDIDATE
    quarantine_trust_threshold: 0.45,
    // Minimum confidence for a raw-entity party to be created at all
    raw_entity_min_confidence: 0.60,
    // Minimum name token count for a person to be promoted to CANDIDATE (vs DRAFT)
    person_min_name_tokens: 2,
    // Auto-promote singleton entities to GOLDEN (vs leaving in CANDIDATE)
    auto_promote_singletons: true,
    // Quarantine a golden-record merge that is name-only with ≤ 2 name tokens
    quarantine_short_name_only_merge: true,
    // Contact binding: minimum confidence to commit a binding (vs document-level)
    contact_binding_min_confidence: 0.65,
  },

  // ─── Relationship profiles ────────────────────────────────────────────────────
  // Domain-agnostic profile-driven relationship types.
  // Profiles define which relationship types are available for which doc_type.
  // Core relationships (SUBJECT_OF, ISSUED_BY, ISSUED_TO, etc.) are always available.
  // Profile extensions are additive — they do not replace core types.
  relationship_profiles: {
    // Generic profile — active for all doc types
    generic: {
      MENTIONED_IN:     { inverse: "MENTIONS",         confidence_modifier: 0 },
      SUBJECT_OF:       { inverse: "HAS_SUBJECT",      confidence_modifier: 0.05 },
      ISSUED_BY:        { inverse: "ISSUED",            confidence_modifier: 0.05 },
      ISSUED_TO:        { inverse: "RECEIVED_BY",       confidence_modifier: 0.05 },
      SIGNATORY_OF:     { inverse: "SIGNED_BY",         confidence_modifier: 0.10 },
      AFFILIATED_WITH:  { inverse: "HAS_AFFILIATE",     confidence_modifier: 0 },
    },
    // Employment / HR profile — activated when doc_type is CV, PAYSLIP, FORM, CONTRACT
    employment: {
      EMPLOYED_BY:      { inverse: "EMPLOYS",           confidence_modifier: 0.15 },
      WORKED_AT:        { inverse: "EMPLOYED",          confidence_modifier: 0.10 },
      MANAGED_BY:       { inverse: "MANAGES",           confidence_modifier: 0.05 },
      REFERENCED_BY:    { inverse: "REFERENCES",        confidence_modifier: 0.05 },
    },
    // Education profile — activated when doc_type is CV, CERTIFICATE, FORM
    education: {
      STUDIED_AT:       { inverse: "ENROLLED",          confidence_modifier: 0.10 },
      GRADUATED_FROM:   { inverse: "AWARDED_DEGREE_TO", confidence_modifier: 0.10 },
      HAS_CERTIFICATION:{ inverse: "AWARDED_TO",        confidence_modifier: 0.10 },
      HAS_SKILL:        { inverse: "SKILL_HELD_BY",     confidence_modifier: 0.05 },
    },
    // Finance profile — activated when doc_type is INVOICE, RECEIPT, CONTRACT, BANK_STATEMENT
    finance: {
      PARTY_TO:         { inverse: "HAS_PARTY",         confidence_modifier: 0.10 },
      GUARANTOR_FOR:    { inverse: "GUARANTEED_BY",     confidence_modifier: 0.15 },
      PAYEE_IN:         { inverse: "PAYEE",             confidence_modifier: 0.10 },
      PAYER_IN:         { inverse: "PAYER",             confidence_modifier: 0.10 },
    },
    // Legal profile — activated when doc_type is CONTRACT, DEED, AGREEMENT, PERMIT, LICENSE
    legal: {
      PARTY_TO:         { inverse: "HAS_PARTY",         confidence_modifier: 0.10 },
      WITNESS_TO:       { inverse: "WITNESSED_BY",      confidence_modifier: 0.10 },
      BOUND_BY:         { inverse: "BINDS",             confidence_modifier: 0.10 },
    },
  } as Record<string, Record<string, { inverse: string; confidence_modifier: number }>>,

  // ─── Doc type → active profiles mapping ──────────────────────────────────────
  doc_type_profiles: {
    CV:               ["generic", "employment", "education"],
    RESUME:           ["generic", "employment", "education"],
    PAYSLIP:          ["generic", "employment", "finance"],
    CERTIFICATE:      ["generic", "education"],
    LICENSE:          ["generic", "legal"],
    INVOICE:          ["generic", "finance"],
    RECEIPT:          ["generic", "finance"],
    QUOTATION:        ["generic", "finance"],
    PURCHASE_ORDER:   ["generic", "finance"],
    BANK_STATEMENT:   ["generic", "finance"],
    FINANCIAL:        ["generic", "finance"],
    CONTRACT:         ["generic", "finance", "legal", "employment"],
    AGREEMENT:        ["generic", "finance", "legal"],
    DEED:             ["generic", "legal"],
    PERMIT:           ["generic", "legal"],
    FORM:             ["generic", "employment", "education"],
    IDENTITY:         ["generic"],
    REPORT:           ["generic"],
    CORRESPONDENCE:   ["generic"],
    MEMORANDUM:       ["generic"],
    OTHER:            ["generic"],
  } as Record<string, string[]>,
};
