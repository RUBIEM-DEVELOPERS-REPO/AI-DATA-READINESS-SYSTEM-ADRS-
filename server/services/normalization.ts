import type { NormalizedAttribute } from "@shared/schema";

// ─── Thresholds (configurable defaults) ──────────────────────────────────────
export const AUTO_APPROVAL_THRESHOLDS: Record<string, number> = {
  email: 0.90,
  phone: 0.90,
  date: 0.85,
  reference_number: 0.88,
  amount: 0.80,
  name: 0.75,
  address: 0.70,
  default: 0.78,
};

// Generic/weak values that should never be auto-approved
const WEAK_VALUE_PATTERNS = [
  /^(foundation|note|address|text|value|unknown|n\/a|na|none|null|undefined|tbd|placeholder)$/i,
  /^[.\s-]+$/, // Only punctuation/whitespace
];

function isWeakValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return true;
  return WEAK_VALUE_PATTERNS.some((re) => re.test(trimmed));
}

// ─── Date normalization ───────────────────────────────────────────────────────
function normalizeDate(raw: string): { normalized: string; type: "date" | "datetime"; ok: boolean } {
  const clean = raw.trim();
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(clean)) {
    return { normalized: clean.slice(0, 10), type: "date", ok: true };
  }
  // DD/MM/YYYY or MM/DD/YYYY heuristic
  const slashMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const month = parseInt(a) > 12 ? b.padStart(2, "0") : a.padStart(2, "0");
    const day = parseInt(a) > 12 ? a.padStart(2, "0") : b.padStart(2, "0");
    return { normalized: `${year}-${month}-${day}`, type: "date", ok: true };
  }
  // Month name: "15 January 2026" or "January 15, 2026"
  const months: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
  const namedMatch = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})|([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (namedMatch) {
    if (namedMatch[1]) {
      const m = months[namedMatch[2].toLowerCase()];
      if (m) return { normalized: `${namedMatch[3]}-${m}-${namedMatch[1].padStart(2, "0")}`, type: "date", ok: true };
    } else {
      const m = months[namedMatch[4].toLowerCase()];
      if (m) return { normalized: `${namedMatch[6]}-${m}-${namedMatch[5].padStart(2, "0")}`, type: "date", ok: true };
    }
  }
  return { normalized: clean, type: "date", ok: false };
}

// ─── Phone normalization (basic E.164-style) ──────────────────────────────────
function normalizePhone(raw: string): { normalized: string; ok: boolean } {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return { normalized: raw, ok: false };
  if (digits.startsWith("+") && digits.length >= 10) return { normalized: digits, ok: true };
  if (digits.length === 10) return { normalized: `+1${digits}`, ok: true }; // Assume US
  if (digits.length === 12 && digits.startsWith("254")) return { normalized: `+${digits}`, ok: true }; // Kenya
  if (digits.length === 11) return { normalized: `+${digits}`, ok: true };
  return { normalized: raw, ok: false };
}

// ─── Currency normalization ────────────────────────────────────────────────────
function normalizeCurrency(raw: string): { normalized: string; numeric: number | null; currency: string | null; ok: boolean } {
  const m = raw.match(/(KES|USD|EUR|GBP|KSH|UGX|TZS)?\s*([0-9,. ]+)\s*(KES|USD|EUR|GBP|KSH|UGX|TZS)?/i);
  if (!m) return { normalized: raw, numeric: null, currency: null, ok: false };
  const currency = (m[1] || m[3] || "").toUpperCase() || null;
  const numStr = m[2].replace(/[, ]/g, "");
  const numeric = parseFloat(numStr);
  if (isNaN(numeric)) return { normalized: raw, numeric: null, currency, ok: false };
  const normalized = currency ? `${currency} ${numeric.toFixed(2)}` : `${numeric.toFixed(2)}`;
  return { normalized, numeric, currency, ok: true };
}

// ─── ValueNormalizationService ────────────────────────────────────────────────
export function normalizeValue(
  fieldKey: string,
  valueRaw: string,
  confidence: number,
  evidencePointer?: string,
  subjectType: NormalizedAttribute["subject_type"] = "DOCUMENT"
): NormalizedAttribute {
  const key = fieldKey.toLowerCase();
  let normalized = valueRaw.trim();
  let type: NormalizedAttribute["normalized_value_type"] = "string";
  let normStatus: NormalizedAttribute["normalization_status"] = "SUCCESS";
  let normError: string | undefined;

  try {
    if (key.includes("email")) {
      normalized = valueRaw.trim().toLowerCase();
      type = "email";
    } else if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) {
      const result = normalizePhone(valueRaw);
      normalized = result.normalized;
      type = "phone";
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse to E.164"; }
    } else if (key.includes("date") || key.includes("_at") || key.endsWith("_on")) {
      const result = normalizeDate(valueRaw);
      normalized = result.normalized;
      type = result.type;
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse to ISO-8601"; }
    } else if (key.includes("amount") || key.includes("value") || key.includes("price") || key.includes("total") || key.includes("cost") || key.includes("salary")) {
      const result = normalizeCurrency(valueRaw);
      normalized = result.normalized;
      type = "currency";
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse currency amount"; }
    } else if (key === "reference_number" || key.includes("invoice_number") || key.includes("ref_no") || key.includes("contract_number")) {
      normalized = valueRaw.trim().toUpperCase();
      type = "string";
    } else {
      // Default: trim whitespace
      normalized = valueRaw.replace(/\s+/g, " ").trim();
      type = "string";
    }
  } catch (e) {
    normStatus = "FAILED";
    normError = String(e);
    normalized = valueRaw;
  }

  // ─── AutoApprovalPolicy ──────────────────────────────────────────────────
  const threshold = AUTO_APPROVAL_THRESHOLDS[key] ?? AUTO_APPROVAL_THRESHOLDS.default;
  let validationState: NormalizedAttribute["validation_state"] = "AUTO_APPROVED";
  let policyRule: string | undefined;
  let policyReason: string | undefined;

  if (isWeakValue(normalized)) {
    validationState = "PENDING";
    policyRule = "WEAK_VALUE";
    policyReason = `Value "${normalized}" is too generic and requires human review.`;
  } else if (normStatus === "FAILED") {
    validationState = "PENDING";
    policyRule = "NORMALIZATION_FAILED";
    policyReason = normError ?? "Value failed normalization for its type.";
  } else if (confidence < threshold) {
    validationState = "PENDING";
    policyRule = "LOW_CONFIDENCE";
    policyReason = `Confidence ${(confidence * 100).toFixed(0)}% is below threshold ${(threshold * 100).toFixed(0)}% for field type "${key}".`;
  } else if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    validationState = "PENDING";
    policyRule = "INVALID_EMAIL";
    policyReason = "Email does not match expected format.";
  } else if (type === "phone" && normalized.length < 7) {
    validationState = "PENDING";
    policyRule = "INVALID_PHONE";
    policyReason = "Phone number is too short.";
  }

  return {
    field_key: fieldKey,
    subject_type: inferSubjectType(key, subjectType),
    value_raw: valueRaw,
    value_normalized: normalized,
    normalized_value_type: type,
    normalization_status: normStatus,
    normalization_error: normError,
    confidence_score: confidence,
    validation_state: validationState,
    approval_policy_rule: policyRule,
    approval_policy_reason: policyReason,
    evidence_pointer: evidencePointer,
  };
}

function inferSubjectType(key: string, defaultType: NormalizedAttribute["subject_type"]): NormalizedAttribute["subject_type"] {
  if (["name", "email", "phone", "address", "national_id", "person_name", "signature_name"].some(k => key.includes(k))) {
    return "PARTY";
  }
  if (["document_date", "title", "doc_type", "classification", "document_number"].some(k => key.includes(k))) {
    return "DOCUMENT";
  }
  if (["amount", "total", "payment", "price", "salary", "cost", "transaction"].some(k => key.includes(k))) {
    return "OBJECT";
  }
  return defaultType;
}

// ─── Normalize all fields from an extraction run ─────────────────────────────
export function normalizeExtractedFields(
  fields: Record<string, any>,
  entities: Array<{ entity: string; value: string; confidence: number; evidence_pointer?: string }> = []
): NormalizedAttribute[] {
  const attrs: NormalizedAttribute[] = [];

  // Normalize structured fields
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    attrs.push(normalizeValue(key, String(value), 0.85, undefined, "DOCUMENT"));
  }

  // Normalize entities (assign to PARTY or OBJECT based on type)
  for (const entity of entities) {
    const key = entity.entity.toLowerCase().replace(/\s+/g, "_");
    const subjectType: NormalizedAttribute["subject_type"] =
      ["person", "name", "email", "phone"].includes(key) ? "PARTY" :
        ["organization", "company", "vendor", "supplier", "merchant"].includes(key) ? "PARTY" : "OBJECT";
    attrs.push(normalizeValue(key, entity.value, entity.confidence, entity.evidence_pointer, subjectType));
  }

  return attrs;
}

// ─── Dedup attributes (same subject + key, keep highest confidence) ───────────
export function dedupAttributes(attrs: NormalizedAttribute[]): NormalizedAttribute[] {
  const map = new Map<string, NormalizedAttribute>();
  const conflicts: string[] = [];

  for (const attr of attrs) {
    const mapKey = `${attr.subject_type}:${attr.field_key}`;
    const existing = map.get(mapKey);
    if (!existing) {
      map.set(mapKey, attr);
    } else {
      if (existing.value_normalized === attr.value_normalized) {
        // Same value — keep higher confidence
        if (attr.confidence_score > existing.confidence_score) {
          map.set(mapKey, attr);
        }
      } else {
        // Conflicting — keep both and mark as PENDING
        conflicts.push(mapKey);
        const conflictAttr = { ...attr, validation_state: "PENDING" as const, approval_policy_rule: "CONFLICT", approval_policy_reason: `Conflicting value "${attr.value_normalized}" vs existing "${existing.value_normalized}".` };
        map.set(`${mapKey}:conflict`, conflictAttr);
        if (existing.validation_state === "AUTO_APPROVED") {
          map.set(mapKey, { ...existing, validation_state: "PENDING", approval_policy_rule: "CONFLICT", approval_policy_reason: `Conflicting value detected.` });
        }
      }
    }
  }

  return Array.from(map.values());
}

// ─── Quality gate checks ──────────────────────────────────────────────────────
export interface QualityGateResult {
  passed: boolean;
  checks: Array<{ rule: string; passed: boolean; detail: string }>;
  pendingCount: number;
  approvedCount: number;
  completenessScore: number;
}

const REQUIRED_FIELDS_BY_DOC_TYPE: Record<string, string[]> = {
  INVOICE: ["invoice_number", "amount", "date", "supplier_name"],
  CONTRACT: ["contract_number", "parties", "value", "start_date"],
  REPORT: ["report_title", "organization"],
  IDENTITY: ["name", "national_id"],
  FINANCIAL: ["amount", "date"],
};

export function runQualityGates(
  docType: string,
  attrs: NormalizedAttribute[],
  ocrConfidence: number
): QualityGateResult {
  const checks: QualityGateResult["checks"] = [];
  const attrKeys = new Set(attrs.map(a => a.field_key.toLowerCase()));

  // 1. OCR quality
  checks.push({ rule: "OCR_QUALITY", passed: ocrConfidence >= 0.70, detail: `OCR confidence: ${(ocrConfidence * 100).toFixed(0)}% (min 70%)` });

  // 2. Completeness for doc type
  const required = REQUIRED_FIELDS_BY_DOC_TYPE[docType] ?? [];
  const missing = required.filter(f => !attrKeys.has(f));
  checks.push({ rule: "COMPLETENESS", passed: missing.length === 0, detail: missing.length === 0 ? "All required fields present" : `Missing: ${missing.join(", ")}` });

  // 3. No all-pending (can't publish with all unvalidated)
  const pendingCount = attrs.filter(a => a.validation_state === "PENDING").length;
  const approvedCount = attrs.filter(a => a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED").length;
  checks.push({ rule: "MIN_APPROVED", passed: approvedCount > 0, detail: `${approvedCount} approved, ${pendingCount} pending` });

  // 4. No normalization failures on key fields
  const keyFails = attrs.filter(a => a.normalization_status === "FAILED" && ["date", "email", "phone", "amount"].includes(a.normalized_value_type));
  checks.push({ rule: "NORMALIZATION", passed: keyFails.length === 0, detail: keyFails.length === 0 ? "All key fields normalized" : `${keyFails.length} key fields failed normalization` });

  const passed = checks.every(c => c.passed);
  const completenessScore = required.length === 0 ? 1.0 : (required.length - missing.length) / required.length;

  return { passed, checks, pendingCount, approvedCount, completenessScore };
}
