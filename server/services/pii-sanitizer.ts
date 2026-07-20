/**
 * pii-sanitizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PII Sanitizer Service for AI extraction boundaries.
 * Detects and redacts sensitive PII (emails, phone numbers, national IDs)
 * from raw document text to prevent exposure to external AI services.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Matches standard international and local phone number formats
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
// Matches US SSN style and general 9-digit hyphenated patterns
const NATIONAL_ID_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Detects and redacts sensitive PII from raw document text.
 *
 * @param text The raw document text to sanitize.
 * @returns The sanitized text with redacted placeholders.
 */
export function sanitizePii(text: string): string {
  if (!text) return text;

  let sanitized = text;
  sanitized = sanitized.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  sanitized = sanitized.replace(PHONE_REGEX, "[REDACTED_PHONE]");
  sanitized = sanitized.replace(NATIONAL_ID_REGEX, "[REDACTED_NATIONAL_ID]");

  return sanitized;
}
