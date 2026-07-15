import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFallbackExtractionResult, mergeExtractionResults } from '../server/services/ai-extraction.ts';

test('buildFallbackExtractionResult extracts invoice details from plain text', () => {
  const result = buildFallbackExtractionResult(
    'Invoice No: INV-1001\nVendor: Acme Ltd\nTotal Amount: USD 1250.00\nDue Date: 2026-07-30',
    'invoice.pdf'
  );

  assert.equal(result.docType, 'INVOICE');
  assert.equal(result.fields.invoice_number?.value, 'INV-1001');
  assert.equal(result.fields.total_amount?.value, 'USD 1250.00');
  assert.equal(result.fields.vendor_name?.value, 'Acme Ltd');
  assert.equal(result.fields.due_date?.value, '2026-07-30');
});

test('mergeExtractionResults preserves fallback fields when AI returns no fields', () => {
  const fallback = buildFallbackExtractionResult(
    'Invoice No: INV-1001\nTotal Amount: USD 1250.00',
    'invoice.pdf'
  );
  const merged = mergeExtractionResults(
    { docType: 'OTHER', docTypeConfidence: 0.4, fields: {}, entities: [], summary: '', language: 'en' },
    fallback
  );

  assert.equal(merged.fields.invoice_number?.value, 'INV-1001');
  assert.equal(merged.fields.total_amount?.value, 'USD 1250.00');
});
