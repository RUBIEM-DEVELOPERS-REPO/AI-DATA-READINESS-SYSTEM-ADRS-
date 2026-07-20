import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePii } from "../server/services/pii-sanitizer";

test("sanitizePii redacts email addresses", () => {
  const text = "Contact john.doe@example.com or support@company.org for details.";
  const sanitized = sanitizePii(text);
  assert.equal(sanitized, "Contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for details.");
});

test("sanitizePii redacts phone numbers", () => {
  const text = "Reach us at +1-555-019-2834 or (555) 123-4567.";
  const sanitized = sanitizePii(text);
  assert.equal(sanitized, "Reach us at [REDACTED_PHONE] or [REDACTED_PHONE].");
});

test("sanitizePii redacts national IDs", () => {
  const text = "My SSN is 000-12-3456 and yours is 999-99-9999.";
  const sanitized = sanitizePii(text);
  assert.equal(sanitized, "My SSN is [REDACTED_NATIONAL_ID] and yours is [REDACTED_NATIONAL_ID].");
});

test("sanitizePii handles empty/undefined inputs gracefully", () => {
  assert.equal(sanitizePii(""), "");
  assert.equal(sanitizePii(undefined as any), undefined as any);
});
