import { buildFallbackExtractionResult } from './server/services/ai-extraction.ts';

const invoiceText = `INVOICE

Invoice No: INV-2026-00145
Date: 2026-07-14
Due Date: 2026-08-14

FROM:
ABC Supplies Ltd
123 Business Street
Johannesburg, ZA 2000
Email: billing@abcsupplies.co.za
Phone: +27 11 555 0123

BILL TO:
Tech Solutions Inc
456 Corporate Road
Cape Town, ZA 8000

DESCRIPTION OF SERVICES
Professional consulting services - Q3 2026

AMOUNT: USD 5,500.00
TAX (15%): USD 825.00
TOTAL DUE: USD 6,325.00

PAYMENT TERMS: Net 30
Bank Account: 1234567890
SWIFT: ABCZAZAJOHX`;

const result = buildFallbackExtractionResult(invoiceText, 'test-invoice.txt');

console.log('Extraction Result:');
console.log(JSON.stringify(result, null, 2));

console.log('\n\nExtracted Fields Count:', Object.keys(result.fields).length);
console.log('Fields Found:');
Object.entries(result.fields).forEach(([key, field]) => {
  console.log(`  ${key}: "${field.value}" (confidence: ${field.confidence})`);
});

console.log('\n\nEntities Found:', result.entities.length);
result.entities.forEach(entity => {
  console.log(`  ${entity.entity}: "${entity.value}" (confidence: ${entity.confidence})`);
});
