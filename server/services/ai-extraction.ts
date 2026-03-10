import OpenAI, { toFile } from "openai";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "../upload";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── AI Field Extraction ─────────────────────────────────────────────────────

export interface AiExtractedField {
  value: string;
  confidence: number;
  source: "ai";
}

export interface AiExtractionResult {
  docType: string;
  docTypeConfidence: number;
  fields: Record<string, AiExtractedField>;
  entities: Array<{ entity: string; value: string; confidence: number }>;
  summary: string;
  language: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert document intelligence engine for an African financial data platform (ADRS).
Your task is to extract ALL structured information from documents — invoices, receipts, contracts, reports, permits, identity documents, correspondence, and more.

Return ONLY a valid JSON object with EXACTLY this structure (no markdown, no preamble):
{
  "doc_type": "INVOICE|RECEIPT|CONTRACT|REPORT|PERMIT|IDENTITY|FINANCIAL|CORRESPONDENCE|OTHER",
  "doc_type_confidence": 0.0-1.0,
  "language": "en|fr|pt|sw|zu|xh|other",
  "summary": "one sentence describing this document",
  "fields": {
    "field_key": { "value": "...", "confidence": 0.0-1.0 }
  },
  "entities": [
    { "type": "ORGANIZATION|PERSON|EMAIL|PHONE|MONEY|DATE|LOCATION|REFERENCE|ADDRESS", "value": "...", "confidence": 0.0-1.0 }
  ]
}

FIELDS to extract (include ALL that appear in the document):
- document_date: The main date of the document
- due_date: Payment due date or expiry date
- reference_number: Invoice/receipt/contract/order/PO number
- invoice_number: Specific invoice number
- contract_number: Contract or agreement number
- total_amount: Total/grand total/amount due (include currency)
- subtotal: Subtotal before tax
- tax_amount: VAT/GST/tax amount
- discount_amount: Any discount applied
- currency: Currency code (USD/ZWL/ZAR/KES/GHS/NGN/EUR/GBP)
- vendor_name: Seller/supplier/issuer organization name
- vendor_address: Seller/supplier address
- vendor_email: Seller/supplier email
- vendor_phone: Seller/supplier phone
- vendor_registration: Company registration number of seller
- vendor_tax_number: Tax/VAT number of seller
- customer_name: Buyer/client/recipient name
- customer_address: Buyer/client address
- customer_email: Buyer/client email
- customer_phone: Buyer/client phone
- customer_id: Customer/account ID or number
- signatory_name: Name of person who signed
- bank_name: Bank name for payment
- bank_account: Bank account number
- bank_branch: Bank branch name/code
- swift_code: SWIFT/BIC code
- line_items: JSON array of {description, quantity, unit_price, total} for each line item
- payment_terms: Payment terms (e.g. "Net 30", "Immediate")
- payment_method: How payment is made (EFT/Cash/Cheque/etc)
- description: Main description or purpose of the document
- subject: Subject line or document title
- permit_number: Permit or license number
- national_id: National ID number
- passport_number: Passport number
- date_of_birth: Date of birth
- organization_type: Type of organization (NGO, Government, Private, etc.)
- industry: Industry sector
- contract_value: Total contract value
- contract_start_date: Contract start date
- contract_end_date: Contract end date

ENTITY TYPES to extract:
- ORGANIZATION: Any company, institution, government body
- PERSON: Any person's name
- EMAIL: Email addresses
- PHONE: Phone/mobile numbers
- MONEY: Monetary amounts with currency
- DATE: Any dates found
- LOCATION: Cities, countries, regions
- REFERENCE: Reference numbers, IDs, codes
- ADDRESS: Full postal addresses

CONFIDENCE RULES:
- 0.95-1.0: Explicitly labeled in document (e.g., "Invoice No: ABC123")
- 0.80-0.94: Clearly present but inferred from context
- 0.65-0.79: Present but ambiguous or partially matching
- 0.50-0.64: Uncertain, possible match

IMPORTANT:
- Extract EVERYTHING visible — be exhaustive
- For amounts, always include the currency symbol or code
- For line items, format as a JSON string: "[{...}, {...}]"
- Normalize phone numbers but preserve original format too
- If a field is not found, omit it from the response entirely
- Return confidence 0.0-1.0 as a decimal number`;

export async function aiExtractDocumentFields(
  text: string,
  fileName: string
): Promise<AiExtractionResult> {
  if (!text || text.length < 10 || text.startsWith("[")) {
    return {
      docType: "OTHER",
      docTypeConfidence: 0.45,
      fields: {},
      entities: [],
      summary: `Document: ${fileName}`,
      language: "en",
    };
  }

  const truncatedText = text.slice(0, 12000);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract all structured information from this document.\n\nFilename: ${fileName}\n\nDocument text:\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const fields: Record<string, AiExtractedField> = {};
    for (const [key, val] of Object.entries(parsed.fields ?? {})) {
      const v = val as { value: string; confidence: number };
      if (v?.value != null && String(v.value).trim() !== "") {
        fields[key] = {
          value: String(v.value).trim(),
          confidence: Math.min(1, Math.max(0, Number(v.confidence) || 0.75)),
          source: "ai",
        };
      }
    }

    const entities: Array<{ entity: string; value: string; confidence: number }> = [];
    for (const ent of parsed.entities ?? []) {
      if (ent?.type && ent?.value) {
        entities.push({
          entity: String(ent.type),
          value: String(ent.value).trim(),
          confidence: Math.min(1, Math.max(0, Number(ent.confidence) || 0.80)),
        });
      }
    }

    return {
      docType: normalizeDocType(parsed.doc_type),
      docTypeConfidence: Math.min(1, Math.max(0.4, Number(parsed.doc_type_confidence) || 0.75)),
      fields,
      entities,
      summary: String(parsed.summary ?? "").slice(0, 300),
      language: String(parsed.language ?? "en").slice(0, 10),
    };
  } catch (err: any) {
    console.error("[AI Extraction] Error:", err?.message ?? err);
    return {
      docType: "OTHER",
      docTypeConfidence: 0.45,
      fields: {},
      entities: [],
      summary: `${fileName} — AI extraction failed`,
      language: "en",
    };
  }
}

// ─── AI Audio Transcription ─────────────────────────────────────────────────

export async function aiTranscribeAudio(storedUri: string, fileName: string): Promise<string> {
  if (!storedUri.startsWith("local://")) return "";
  const filePath = path.join(UPLOADS_DIR, storedUri.slice(8));
  if (!fs.existsSync(filePath)) return "[Audio file not found]";

  try {
    const ext = path.extname(fileName).slice(1).toLowerCase() || "mp3";
    const supportedFormats = ["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"];
    const fileExt = supportedFormats.includes(ext) ? ext : "mp3";

    const fileStream = fs.createReadStream(filePath);
    const audioFile = await toFile(fileStream, `audio.${fileExt}`, { type: `audio/${fileExt}` });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      response_format: "text",
    });

    const result = typeof transcription === "string" ? transcription : (transcription as any).text ?? "";
    return result.trim() || "[Transcription returned empty]";
  } catch (err: any) {
    console.error("[AI Transcription] Error:", err?.message ?? err);
    return `[Audio transcription failed: ${err?.message ?? "unknown error"}]`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDocType(raw: string): string {
  const map: Record<string, string> = {
    INVOICE: "INVOICE",
    RECEIPT: "FINANCIAL",
    CONTRACT: "CONTRACT",
    REPORT: "REPORT",
    PERMIT: "PERMIT",
    IDENTITY: "IDENTITY",
    FINANCIAL: "FINANCIAL",
    CORRESPONDENCE: "CORRESPONDENCE",
    LETTER: "CORRESPONDENCE",
    QUOTATION: "INVOICE",
    QUOTE: "INVOICE",
    PURCHASE_ORDER: "INVOICE",
    OTHER: "OTHER",
  };
  const upper = String(raw ?? "").toUpperCase().trim();
  return map[upper] ?? "OTHER";
}

export function scoreAiExtraction(fieldCount: number, docType: string): {
  ocrConfidence: number;
  extractionConfidence: number;
  consistencyScore: number;
  docQualityScore: number;
} {
  const expected: Record<string, number> = {
    INVOICE: 7, FINANCIAL: 5, CONTRACT: 5, REPORT: 3,
    PERMIT: 4, IDENTITY: 5, CORRESPONDENCE: 3, OTHER: 2,
  };
  const exp = expected[docType] ?? 3;
  const coverage = Math.min(1.0, fieldCount / exp);

  const ocrConfidence = 0.88 + (coverage * 0.10);
  const extractionConfidence = 0.75 + (coverage * 0.22);
  const consistencyScore = 0.82 + (coverage * 0.12);
  const docQualityScore = 0.80 + (coverage * 0.15);

  return {
    ocrConfidence: Math.min(0.98, ocrConfidence),
    extractionConfidence: Math.min(0.97, extractionConfidence),
    consistencyScore: Math.min(0.97, consistencyScore),
    docQualityScore: Math.min(0.98, docQualityScore),
  };
}
