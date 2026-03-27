import type { NormalizedAttribute } from "@shared/schema";
import { ADRS_CONFIG } from "../config";

// Re-export thresholds from config for backward compat
export const AUTO_APPROVAL_THRESHOLDS = ADRS_CONFIG.thresholds.auto_approval;

// Generic/weak values that should never be auto-approved
const WEAK_VALUE_PATTERNS = [
  /^(foundation|note|address|text|value|unknown|n\/a|na|none|null|undefined|tbd|placeholder|sample|test|example|foo|bar|baz)$/i,
  /^[.\s\-_]+$/, // Only punctuation/whitespace/underscore
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
    // If has time component, normalize to UTC ISO datetime
    if (clean.includes("T")) {
      const dt = new Date(clean);
      if (!isNaN(dt.getTime())) return { normalized: dt.toISOString(), type: "datetime", ok: true };
    }
    return { normalized: clean.slice(0, 10), type: "date", ok: true };
  }
  // DD/MM/YYYY or MM/DD/YYYY heuristic
  const slashMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const month = parseInt(a) > 12 ? b.padStart(2, "0") : a.padStart(2, "0");
    const day   = parseInt(a) > 12 ? a.padStart(2, "0") : b.padStart(2, "0");
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

// ─── Phone normalization (E.164) ───────────────────────────────────────────────
function normalizePhone(raw: string): { normalized: string; ok: boolean } {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return { normalized: raw, ok: false };
  if (digits.startsWith("+") && digits.length >= 10) return { normalized: digits, ok: true };
  if (digits.length === 10) return { normalized: `+1${digits}`, ok: true };    // US default
  if (digits.length === 12 && digits.startsWith("254")) return { normalized: `+${digits}`, ok: true }; // Kenya
  if (digits.length === 12 && digits.startsWith("256")) return { normalized: `+${digits}`, ok: true }; // Uganda
  if (digits.length === 12 && digits.startsWith("255")) return { normalized: `+${digits}`, ok: true }; // Tanzania
  if (digits.length === 11) return { normalized: `+${digits}`, ok: true };
  return { normalized: raw, ok: false };
}

// ─── Currency normalization ────────────────────────────────────────────────────
function normalizeCurrency(raw: string): { normalized: string; numeric: number | null; currency: string | null; ok: boolean } {
  const m = raw.match(/(KES|USD|EUR|GBP|KSH|UGX|TZS|RWF|ETB|NGN)?\s*([0-9,. ]+)\s*(KES|USD|EUR|GBP|KSH|UGX|TZS|RWF|ETB|NGN)?/i);
  if (!m) return { normalized: raw, numeric: null, currency: null, ok: false };
  const currency = (m[1] || m[3] || "").toUpperCase() || null;
  const numStr   = m[2].replace(/[, ]/g, "");
  const numeric  = parseFloat(numStr);
  if (isNaN(numeric)) return { normalized: raw, numeric: null, currency, ok: false };
  const normalized = currency ? `${currency} ${numeric.toFixed(2)}` : `${numeric.toFixed(2)}`;
  return { normalized, numeric, currency, ok: true };
}

// ─── Reference number pattern validation ─────────────────────────────────────
function validateReferencePattern(fieldKey: string, value: string): { ok: boolean; error?: string } {
  if (!ADRS_CONFIG.features.strict_reference_pattern) return { ok: true };
  const pattern = ADRS_CONFIG.patterns[fieldKey] ?? ADRS_CONFIG.patterns.reference_number;
  if (!pattern.test(value)) {
    return { ok: false, error: `"${value}" does not match expected reference pattern ${pattern}` };
  }
  return { ok: true };
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
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse to E.164 format"; }
    } else if (key.includes("date") || key.includes("_at") || key.endsWith("_on")) {
      const result = normalizeDate(valueRaw);
      normalized = result.normalized;
      type = result.type;
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse to ISO-8601 date"; }
    } else if (key.includes("amount") || (key.includes("value") && !key.includes("normalized")) || key.includes("price") || key.includes("total") || key.includes("cost") || key.includes("salary")) {
      const result = normalizeCurrency(valueRaw);
      normalized = result.normalized;
      type = "currency";
      if (!result.ok) { normStatus = "FAILED"; normError = "Could not parse currency amount"; }
    } else if (key === "reference_number" || key.includes("invoice_number") || key.includes("ref_no") || key.includes("contract_number") || key.includes("permit_number")) {
      normalized = valueRaw.trim().toUpperCase().replace(/\s+/g, "-");
      type = "string";
      const patCheck = validateReferencePattern(key, normalized);
      if (!patCheck.ok) { normStatus = "FAILED"; normError = patCheck.error; }
    } else if (key.includes("name") || key.includes("address")) {
      // Whitespace normalization only, preserve casing
      normalized = valueRaw.replace(/\s+/g, " ").trim();
      type = "string";
    } else {
      normalized = valueRaw.replace(/\s+/g, " ").trim();
      type = "string";
    }
  } catch (e) {
    normStatus = "FAILED";
    normError = String(e);
    normalized = valueRaw;
  }

  // ─── AutoApprovalPolicy ──────────────────────────────────────────────────
  const threshold = ADRS_CONFIG.thresholds.auto_approval[key] ?? ADRS_CONFIG.thresholds.auto_approval.default;
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
    policyReason = `Confidence ${(confidence * 100).toFixed(0)}% is below threshold ${(threshold * 100).toFixed(0)}% for field "${key}".`;
  } else if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    validationState = "PENDING";
    policyRule = "INVALID_EMAIL";
    policyReason = "Email does not match RFC-5322 basic format.";
  } else if (type === "phone" && normalized.length < 7) {
    validationState = "PENDING";
    policyRule = "INVALID_PHONE";
    policyReason = "Phone number is too short to be valid.";
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
  if (["name", "email", "phone", "address", "national_id", "person_name", "signature_name", "org_name", "organization", "company", "vendor", "supplier",
       "speaker", "interviewer", "interviewee", "chairperson", "presenter"].some(k => key.includes(k))) {
    return "PARTY";
  }
  if (["document_date", "title", "report_title", "doc_type", "classification", "document_number", "permit_number",
       "topic", "agenda", "meeting_title", "interview_date", "meeting_date", "language", "duration"].some(k => key.includes(k))) {
    return "DOCUMENT";
  }
  if (["amount", "total", "payment", "price", "salary", "cost", "transaction"].some(k => key.includes(k))) {
    return "OBJECT";
  }
  if (["timestamp", "start_time", "end_time", "segment", "transcript"].some(k => key.includes(k))) {
    return "EVENT";
  }
  if (["audio_quality", "video_resolution", "frame_rate", "bitrate", "sample_rate", "channel_count", "codec", "speaker_count"].some(k => key.includes(k))) {
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

  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    // AiExtractedField: { value: string, confidence: number, source: "ai" }
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      if (typeof value.value === "string" && typeof value.confidence === "number") {
        const strVal = value.value.trim();
        if (!strVal) continue;
        attrs.push(normalizeValue(key, strVal, value.confidence, undefined, "DOCUMENT"));
        continue;
      }
      // Skip other complex nested objects/arrays (e.g. transcript_segments)
      continue;
    }
    attrs.push(normalizeValue(key, String(value), 0.85, undefined, "DOCUMENT"));
  }

  for (const entity of entities) {
    const key = entity.entity.toLowerCase().replace(/\s+/g, "_");
    const subjectType: NormalizedAttribute["subject_type"] =
      ["person", "name", "email", "phone"].includes(key) ? "PARTY" :
      ["organization", "company", "vendor", "supplier", "merchant"].includes(key) ? "PARTY" : "OBJECT";
    attrs.push(normalizeValue(key, entity.value, entity.confidence, entity.evidence_pointer, subjectType));
  }

  return attrs;
}

// ─── Dedup — returns { deduped, conflicts } ───────────────────────────────────
export interface DedupResult {
  deduped: NormalizedAttribute[];
  /** Keys where conflicting normalized values were found */
  conflictKeys: string[];
  /** Full candidate sets for each conflict — drives human resolution UI */
  conflictDetails: Array<{
    field_key: string;
    options: Array<{ value: string; confidence: number; source_field: string }>;
    chosen_value: string;
  }>;
}

export function dedupAttributes(attrs: NormalizedAttribute[]): DedupResult {
  const map = new Map<string, NormalizedAttribute>();
  const conflictKeys: string[] = [];
  // Track ALL candidate values seen per map key (for conflict resolution UI)
  const candidateMap = new Map<string, Array<{ value: string; confidence: number; source_field: string }>>();

  for (const attr of attrs) {
    const mapKey = `${attr.subject_type}:${attr.field_key}`;
    const existing = map.get(mapKey);

    // Accumulate candidates
    const candidates = candidateMap.get(mapKey) ?? [];
    const alreadySeen = candidates.find(c => c.value === attr.value_normalized);
    if (!alreadySeen) {
      candidates.push({ value: attr.value_normalized, confidence: attr.confidence_score, source_field: attr.field_key });
    } else if (attr.confidence_score > alreadySeen.confidence) {
      alreadySeen.confidence = attr.confidence_score;
    }
    candidateMap.set(mapKey, candidates);

    if (!existing) {
      map.set(mapKey, attr);
    } else {
      if (existing.value_normalized === attr.value_normalized) {
        if (attr.confidence_score > existing.confidence_score) map.set(mapKey, attr);
      } else {
        // Conflicting values — keep both, mark PENDING, record conflict
        if (!conflictKeys.includes(mapKey)) conflictKeys.push(mapKey);
        const conflictAttr: NormalizedAttribute = {
          ...attr,
          validation_state: "PENDING",
          approval_policy_rule: "CONFLICT",
          approval_policy_reason: `Conflicting value "${attr.value_normalized}" vs existing "${existing.value_normalized}". Manual dedup required.`,
        };
        map.set(`${mapKey}:conflict`, conflictAttr);
        if (existing.validation_state === "AUTO_APPROVED") {
          map.set(mapKey, {
            ...existing,
            validation_state: "PENDING",
            approval_policy_rule: "CONFLICT",
            approval_policy_reason: `Conflicting value detected — original value "${existing.value_normalized}" requires review.`,
          });
        }
      }
    }
  }

  // Build conflict details from accumulated candidates
  const conflictDetails = conflictKeys.map(mapKey => {
    const winner = map.get(mapKey);
    const options = (candidateMap.get(mapKey) ?? []).sort((a, b) => b.confidence - a.confidence);
    return {
      field_key: winner?.field_key ?? mapKey.split(":").slice(1).join(":"),
      options,
      chosen_value: winner?.value_normalized ?? (options[0]?.value ?? ""),
    };
  });

  return { deduped: Array.from(map.values()), conflictKeys, conflictDetails };
}

// ─── Quality gate checks ──────────────────────────────────────────────────────
export interface QualityGateResult {
  passed: boolean;
  checks: Array<{ rule: string; passed: boolean; detail: string }>;
  pendingCount: number;
  approvedCount: number;
  completenessScore: number;
}

export function runQualityGates(
  docType: string,
  attrs: NormalizedAttribute[],
  ocrConfidence: number
): QualityGateResult {
  const checks: QualityGateResult["checks"] = [];
  const attrKeys = new Set(attrs.map(a => a.field_key.toLowerCase()));

  checks.push({ rule: "OCR_QUALITY", passed: ocrConfidence >= 0.70, detail: `OCR confidence: ${(ocrConfidence * 100).toFixed(0)}% (min 70%)` });

  const required = ADRS_CONFIG.required_fields_by_doc_type[docType] ?? [];
  const missing = required.filter(f => !attrKeys.has(f));
  checks.push({ rule: "COMPLETENESS", passed: missing.length === 0, detail: missing.length === 0 ? "All required fields present" : `Missing: ${missing.join(", ")}` });

  const pendingCount   = attrs.filter(a => a.validation_state === "PENDING").length;
  const approvedCount  = attrs.filter(a => a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED").length;
  checks.push({ rule: "MIN_APPROVED", passed: approvedCount > 0, detail: `${approvedCount} approved, ${pendingCount} pending` });

  const keyFails = attrs.filter(a => a.normalization_status === "FAILED" && ["date", "email", "phone", "currency"].includes(a.normalized_value_type));
  checks.push({ rule: "NORMALIZATION", passed: keyFails.length === 0, detail: keyFails.length === 0 ? "All key fields normalized" : `${keyFails.length} key field(s) failed normalization` });

  const conflictCount = attrs.filter(a => a.approval_policy_rule === "CONFLICT").length;
  checks.push({ rule: "NO_CONFLICTS", passed: conflictCount === 0, detail: conflictCount === 0 ? "No conflicting field values" : `${conflictCount} conflicting attribute(s) pending dedup` });

  const passed = checks.every(c => c.passed);
  const completenessScore = required.length === 0 ? 1.0 : (required.length - missing.length) / required.length;

  return { passed, checks, pendingCount, approvedCount, completenessScore };
}

// ─── Compute trust score ──────────────────────────────────────────────────────
export function computeTrustScore(
  ocrConfidence: number,
  extractionConfidence: number,
  completenessScore: number,
  consistencyScore: number,
  docQualityScore: number
): number {
  const w = ADRS_CONFIG.trust_weights;
  return w.ocr * ocrConfidence + w.extraction * extractionConfidence + w.completeness * completenessScore + w.consistency * consistencyScore + w.doc_quality * docQualityScore;
}
