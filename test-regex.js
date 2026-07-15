const text = `INVOICE

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

// Test invoice number regex
const invoicePattern = /\b(?:invoice|inv|bill|receipt|order|po)\s*(?:no|number)?\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/i;
const match = text.match(invoicePattern);
console.log('Invoice pattern match:', match);

// Test total amount regex
const amountPattern = /\b(?:total(?:\s+amount)?|grand\s+total|amount\s+due|balance\s+due|payable)\s*[:#-]?\s*([A-Z]{3}\s*)?([£$€¥₹]\s*)?([0-9][0-9,\.\s]*)/i;
const amountMatch = text.match(amountPattern);
console.log('Amount pattern match:', amountMatch);

// Test due date
const duePattern = /\b(?:due\s+date|payment\s+due|expiry\s+date|valid\s+until)\s*[:#-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i;
const dueMatch = text.match(duePattern);
console.log('Due date pattern match:', dueMatch);

// Test vendor
const vendorPattern = /\b(?:vendor|supplier|from|issued by|seller)\s*[:#-]?\s*([A-Za-z0-9&.,'() /-]+)/i;
const vendorMatch = text.match(vendorPattern);
console.log('Vendor pattern match:', vendorMatch);

// Test customer
const customerPattern = /\b(?:customer|client|bill\s+to|to)\s*[:#-]?\s*([A-Za-z0-9&.,'() /-]+)/i;
const customerMatch = text.match(customerPattern);
console.log('Customer pattern match:', customerMatch);
