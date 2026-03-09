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
};
