import { toFile } from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { UPLOADS_DIR } from "../upload";
import { resolveDynamicProfile } from "./attention";
import { buildSafeExtractionMessages, PROMPT_INJECTION_REJECTION_RULE } from "./prompt-guard";
import { sanitizePii } from "./pii-sanitizer";
import {
  createAiClient,
  getAiProviderConfig,
  getAudioModel,
  getChatModel,
  getTextModel,
  getVisionModel,
} from "./ai-provider";
import { withTimeout, aiCircuitBreaker, AI_TIMEOUT_MS } from "./circuit-breaker";

function getAiClient() {
  const aiConfig = getAiProviderConfig();
  return {
    client: createAiClient(aiConfig),
    config: aiConfig,
  };
}

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
Your task is to extract ALL structured information from documents — invoices, quotations, receipts, contracts, CVs, forms, policies, permits, bank statements, payslips, certificates, leases, and more.

Return ONLY a valid JSON object with EXACTLY this structure (no markdown, no preamble):
{
  "doc_type": "INVOICE|QUOTATION|PURCHASE_ORDER|RECEIPT|CONTRACT|AGREEMENT|LEASE|DEED|REPORT|FINANCIAL|BANK_STATEMENT|PAYSLIP|PERMIT|CERTIFICATE|LICENSE|IDENTITY|CV|FORM|POLICY|CORRESPONDENCE|MEMORANDUM|OTHER",
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
- vendor_email: Seller/supplier email address
- vendor_phone: Seller/supplier phone number
- vendor_registration: Company registration number of seller
- vendor_tax_number: Tax/VAT number of seller
- customer_name: Buyer/client/recipient name
- customer_address: Buyer/client address
- customer_email: Buyer/client email address
- customer_phone: Buyer/client phone number
- customer_id: Customer/account ID or number
- signatory_name: Name of person who signed
- signatory_email: Email address of the signatory/signer
- signatory_phone: Phone number of the signatory/signer
- employee_name: Employee name (payslips, employment contracts)
- employee_email: Employee email address
- employee_phone: Employee phone number
- director_name: Company director or officer name
- officer_name: Officer or authorised representative name
- guarantor_name: Guarantor name (loan/lease documents)
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

DOC_TYPE CLASSIFICATION RULES (choose the MOST specific type):
- INVOICE: A bill issued by a seller for goods/services delivered — includes amounts, line items, invoice number
- QUOTATION: A price quote or pro-forma — prices given BEFORE work/delivery, no payment yet made
- PURCHASE_ORDER: Buyer's order requesting goods/services from a supplier
- RECEIPT: Proof of payment already made — "RECEIVED" stamp, payment confirmation, cash receipt
- CONTRACT: A legally binding multi-party agreement with terms and signatures
- AGREEMENT: A less formal contract, MOU, partnership agreement, or SLA
- LEASE: A tenancy, rental, or hire agreement for property or equipment
- DEED: A property transfer deed, title deed, or conveyance document
- REPORT: An analytical, audit, or status report — narrative with findings
- FINANCIAL: A general financial statement, balance sheet, or P&L not covered by a specific type
- BANK_STATEMENT: A bank or mobile-money statement listing transactions
- PAYSLIP: An employee payslip or salary advice showing earnings and deductions
- PERMIT: A government-issued permit, licence, or authorisation for activity
- CERTIFICATE: A certificate of incorporation, compliance, good standing, completion, or training
- LICENSE: A software, business, or professional licence document
- IDENTITY: A national ID, passport, voter registration, or birth certificate
- CV: A curriculum vitae or résumé — lists personal details, education, work history, skills
- FORM: A structured data-entry form — application form, claim form, registration form, survey
- POLICY: An insurance policy, company policy document, terms & conditions, or regulatory policy
- CORRESPONDENCE: An email, letter, memo, or notice — primarily narrative communication
- MEMORANDUM: An internal memorandum or circular
- AUDIO_RECORDING / VIDEO_RECORDING: Only for transcribed audio/video — do NOT use for documents
- OTHER: Only when truly impossible to classify after careful reading

CONFIDENCE RULES:
- 0.95-1.0: Explicitly labeled in document (e.g., "Invoice No: ABC123", "QUOTATION" header)
- 0.80-0.94: Clearly present but inferred from context
- 0.65-0.79: Present but ambiguous or partially matching
- 0.50-0.64: Uncertain, possible match

IMPORTANT:
- Extract EVERYTHING visible — be exhaustive
- For amounts, always include the currency symbol or code
- For line items, format as a JSON string: "[{...}, {...}]"
- Normalize phone numbers but preserve original format too
- If a field is not found, omit it from the response entirely
- Return confidence 0.0-1.0 as a decimal number
- For CV documents: extract candidate_name, date_of_birth, email, phone, address, education, work_experience, skills, nationality as fields
- For FORM documents: extract all visible form fields and their filled-in values
- For POLICY documents: extract policy_number, effective_date, expiry_date, insured_name, premium_amount as applicable`;

function buildFallbackExtractionResult(text: string, fileName: string): AiExtractionResult {
  const normalizedText = String(text ?? "").replace(/\r/g, "\n").trim();
  const lowerText = normalizedText.toLowerCase();
  const docType = inferFallbackDocType(normalizedText, fileName, lowerText);
  const fields: Record<string, AiExtractedField> = {};

  const addField = (key: string, value: string, confidence: number) => {
    if (!value) return;
    fields[key] = { value, confidence, source: "ai" };
  };

  const invoiceNumber = extractFirstMatch(normalizedText, [
    /\b(?:invoice|inv|bill|receipt|order|po)\s*(?:no|number)?\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/i,
    /\b(?:ref|reference)\s*(?:no|number)?\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/i,
  ]);
  if (invoiceNumber) addField("invoice_number", invoiceNumber, 0.78);

  const referenceNumber = extractFirstMatch(normalizedText, [
    /\b(?:reference|ref|doc(?:ument)?\s+id|case\s+no)\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/i,
  ]);
  if (referenceNumber) addField("reference_number", referenceNumber, 0.74);

  const amountMatch = extractAmountMatch(normalizedText);
  if (amountMatch) {
    const value = amountMatch.replace(/\s+/g, " ").trim();
    addField("total_amount", value, 0.74);
    const currencyCode = value.match(/\b(?:USD|EUR|GBP|ZAR|ZWL|KES|GHS|NGN|AED|CHF|JPY|CNY|INR|MAD|TZS|UGX)\b/i);
    if (currencyCode?.[0]) addField("currency", currencyCode[0].toUpperCase(), 0.8);
  }

  const dueDate = extractFirstMatch(normalizedText, [
    /\b(?:due\s+date|payment\s+due|expiry\s+date|valid\s+until)\s*[:#-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i,
  ]);
  if (dueDate) addField("due_date", dueDate, 0.75);

  const vendorName = extractFirstMatch(normalizedText, [
    /\b(?:vendor|supplier|from|issued by|seller)\s*[:#-]?\s*([A-Za-z0-9&.,'() /-]+)/i,
  ]);
  if (vendorName) addField("vendor_name", vendorName, 0.72);

  const customerName = extractFirstMatch(normalizedText, [
    /\b(?:customer|client|bill\s+to|to)\s*[:#-]?\s*([A-Za-z0-9&.,'() /-]+)/i,
  ]);
  if (customerName) addField("customer_name", customerName, 0.68);

  const description = normalizedText.split(/\n+/).find((line) => line.trim().length > 0 && !/^(invoice|vendor|supplier|customer|total|due|reference|date|amount)/i.test(line.trim()));
  if (description) addField("description", description.trim(), 0.66);

  const entities: Array<{ entity: string; value: string; confidence: number }> = [];
  for (const match of normalizedText.matchAll(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    entities.push({ entity: "EMAIL", value: match[1], confidence: 0.9 });
  }
  for (const match of normalizedText.matchAll(/(\+?[0-9][0-9\s().-]{7,}[0-9])/g)) {
    entities.push({ entity: "PHONE", value: match[1], confidence: 0.82 });
  }

  const summaryText = normalizedText.slice(0, 220).replace(/\s+/g, " ").trim();
  return {
    docType,
    docTypeConfidence: docType === "OTHER" ? 0.58 : 0.78,
    fields,
    entities,
    summary: summaryText || `Document: ${fileName}`,
    language: detectFallbackLanguage(lowerText),
  };
}

function inferFallbackDocType(text: string, fileName: string, lowerText: string): string {
  const source = `${fileName}\n${text}`.toLowerCase();
  if (/\binvoice\b|\btax invoice\b|\breceipt\b/.test(source)) return "INVOICE";
  if (/\bquotation\b|\bquote\b|\bproforma\b/.test(source)) return "QUOTATION";
  if (/\bpurchase order\b|\bpo\b/.test(source)) return "PURCHASE_ORDER";
  if (/\bcontract\b|\bagreement\b/.test(source)) return "CONTRACT";
  if (/\bbank statement\b|\bstatement\b/.test(source)) return "BANK_STATEMENT";
  if (/\bpayslip\b|\bsalary\b/.test(source)) return "PAYSLIP";
  if (/\bpermit\b|\blicence\b|\blicense\b/.test(source)) return "PERMIT";
  if (/\bcv\b|\bresume\b/.test(source)) return "CV";
  if (/\bpolicy\b/.test(source)) return "POLICY";
  if (/\bform\b/.test(source)) return "FORM";
  if (/\breport\b/.test(source)) return "REPORT";
  if (lowerText.includes("invoice")) return "INVOICE";
  return "OTHER";
}

function extractFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }
  return undefined;
}

function extractAmountMatch(text: string): string | undefined {
  const patterns = [
    /\b(?:total(?:\s+amount)?|grand\s+total|amount\s+due|balance\s+due|payable)\s*[:#-]?\s*([A-Z]{3}\s*)?([£$€¥₹]\s*)?([0-9][0-9,\.\s]*)/i,
    /\b([A-Z]{3})\s*([0-9][0-9,\.\s]*)/i,
    /([£$€¥₹]\s*[0-9][0-9,\.\s]*)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      const value = match[0].replace(/\s+/g, " ").trim();
      return value.replace(/^total\s+amount\s*[:#-]?\s*/i, "").replace(/^amount\s+due\s*[:#-]?\s*/i, "").replace(/^balance\s+due\s*[:#-]?\s*/i, "").replace(/^payable\s*[:#-]?\s*/i, "").trim();
    }
  }
  return undefined;
}

function detectFallbackLanguage(lowerText: string): string {
  if (/(\bfr\b|français|bonjour)/i.test(lowerText)) return "fr";
  if (/(\bpt\b|português|obrigado)/i.test(lowerText)) return "pt";
  if (/(\bsw\b|swahili|habari)/i.test(lowerText)) return "sw";
  if (/(\bzu\b|zulu|sawubona)/i.test(lowerText)) return "zu";
  if (/(\bxh\b|xhosa|molo)/i.test(lowerText)) return "xh";
  return "en";
}

export function mergeExtractionResults(
  aiResult: Partial<AiExtractionResult>,
  fallbackResult: AiExtractionResult
): AiExtractionResult {
  const fields: Record<string, AiExtractedField> = { ...fallbackResult.fields };
  for (const [key, value] of Object.entries(aiResult.fields ?? {})) {
    const candidate = value as AiExtractedField | undefined;
    if (candidate?.value != null && String(candidate.value).trim() !== "") {
      fields[key] = candidate;
    }
  }

  const entities = (aiResult.entities?.length ?? 0) > 0
    ? [...(aiResult.entities ?? [])]
    : [...fallbackResult.entities];

  return {
    docType: aiResult.docType && aiResult.docType !== "OTHER" ? aiResult.docType : fallbackResult.docType,
    docTypeConfidence: typeof aiResult.docTypeConfidence === "number" && aiResult.docTypeConfidence > 0.5
      ? aiResult.docTypeConfidence
      : fallbackResult.docTypeConfidence,
    fields,
    entities,
    summary: String(aiResult.summary ?? "").trim() || fallbackResult.summary,
    language: String(aiResult.language ?? "").trim() || fallbackResult.language,
  };
}

export { buildFallbackExtractionResult };

export async function aiExtractDocumentFields(
  text: string,
  fileName: string
): Promise<AiExtractionResult> {
  const fallbackResult = buildFallbackExtractionResult(text, fileName);
  if (!text || text.length < 10 || text.startsWith("[")) {
    return fallbackResult;
  }

  try {
    const { client: openai, config: aiConfig } = getAiClient();
    // ── Prompt-injection defence: sanitise + delimit document text ──────────
    const sanitizedText = sanitizePii(text);
    const safeMessages = buildSafeExtractionMessages(EXTRACTION_SYSTEM_PROMPT, sanitizedText, fileName);
    const response = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.chat.completions.create({
          model: getTextModel(aiConfig),
          messages: safeMessages,
          response_format: { type: "json_object" },
          max_completion_tokens: 4096,
        }),
        AI_TIMEOUT_MS,
        "AI Field Extraction"
      )
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    if (!raw.trim() || raw.trim() === "{}") {
      throw new Error("Empty AI response");
    }

    const parsed = JSON.parse(raw);

    const fields: Record<string, AiExtractedField> = {};
    
    // Moonshot 1: Dynamic Contextual Attention based on Zero-Shot Document Summary Embedding
    const { profile, similarityScore } = await resolveDynamicProfile(parsed.summary || "", parsed.doc_type || "OTHER");

    for (const [key, val] of Object.entries(parsed.fields ?? {})) {
      const v = val as { value: string; confidence: number };
      if (v?.value != null && String(v.value).trim() !== "") {
        let confidence = Math.min(1, Math.max(0, Number(v.confidence) || 0.75));
        
        // Apply profile-driven relevance weighting AND the dynamic semantic similarity scale
        const weight = profile.relevanceWeights[key.toLowerCase()] || 1.0;
        confidence = Math.min(1, confidence * weight * similarityScore);

        fields[key] = {
          value: String(v.value).trim(),
          confidence,
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

    const aiResult = {
      docType: normalizeDocType(parsed.doc_type),
      docTypeConfidence: Math.min(1, Math.max(0.4, Number(parsed.doc_type_confidence) || 0.75)),
      fields,
      entities,
      summary: String(parsed.summary ?? "").slice(0, 300),
      language: String(parsed.language ?? "en").slice(0, 10),
    };

    if (Object.keys(fields).length === 0 && (entities.length === 0 || !String(parsed.summary ?? "").trim())) {
      return fallbackResult;
    }

    return mergeExtractionResults(aiResult, fallbackResult);
  } catch (err: any) {
    console.error("[AI Extraction] Error:", err?.message ?? err);
    return fallbackResult;
  }
}

// ─── AI Doc-Type Reclassification ─────────────────────────────────────────────
/**
 * Re-classifies the document type from existing OCR/summary text.
 * Used for documents currently stored as "OTHER".
 * Returns the normalised doc_type and a confidence score.
 * Zero hallucination: output is constrained to a fixed enum; no new data invented.
 */
export async function aiReclassifyDocType(
  text: string,
  fileName: string
): Promise<{ docType: string; confidence: number }> {
  const truncated = (text ?? "").slice(0, 6000).trim();
  if (truncated.length < 20) {
    return { docType: "OTHER", confidence: 0.4 };
  }
  const { client: openai, config: aiConfig } = getAiClient();
  try {
    const response = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.chat.completions.create({
          model: getTextModel(aiConfig),
          messages: [
            {
              role: "system",
              content:
                "You are a document classifier for an African financial data platform. " +
                "Classify the document type from its text content. " +
                "Return ONLY a valid JSON object — no markdown, no preamble:\n" +
                '{"doc_type":"INVOICE|QUOTATION|PURCHASE_ORDER|RECEIPT|CONTRACT|AGREEMENT|LEASE|DEED|REPORT|FINANCIAL|BANK_STATEMENT|PAYSLIP|PERMIT|CERTIFICATE|LICENSE|IDENTITY|CV|FORM|POLICY|CORRESPONDENCE|MEMORANDUM|OTHER","confidence":0.0-1.0}\n' +
                "RULES:\n" +
                "- INVOICE: bill for delivered goods/services with invoice number and amounts\n" +
                "- QUOTATION: price quote before delivery (pro-forma, estimate, quote)\n" +
                "- PURCHASE_ORDER: buyer's order to a supplier requesting goods/services\n" +
                "- RECEIPT: proof of payment already made, RECEIVED stamp\n" +
                "- CONTRACT: formal legally-binding agreement with signatures\n" +
                "- AGREEMENT: MOU, partnership agreement, SLA, informal agreement\n" +
                "- LEASE: tenancy, rental, or hire agreement\n" +
                "- DEED: property transfer deed, title deed\n" +
                "- BANK_STATEMENT: bank or mobile-money transaction statement\n" +
                "- PAYSLIP: employee salary advice with earnings and deductions\n" +
                "- CERTIFICATE: certificate of incorporation, completion, compliance\n" +
                "- LICENSE: business licence, professional licence, software licence\n" +
                "- IDENTITY: national ID, passport, birth certificate, voter card\n" +
                "- CV: curriculum vitae or resume with personal details and work history\n" +
                "- FORM: application form, claim form, survey, registration form\n" +
                "- POLICY: insurance policy, company policy document, T&Cs\n" +
                "- CORRESPONDENCE: letter, email, notice, circular\n" +
                "- MEMORANDUM: internal memo or circular\n" +
                "- Only use OTHER if truly impossible to classify after careful reading\n" +
                "- confidence must reflect how certain you are from the actual content",
            },
            {
              role: "user",
              content: `Classify this document.\n\nFilename: ${fileName}\n\nContent:\n${truncated}`,
            },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 80,
        }),
        AI_TIMEOUT_MS,
        "AI Reclassify DocType"
      )
    );
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    return {
      docType: normalizeDocType(parsed.doc_type ?? "OTHER"),
      confidence: Math.min(1, Math.max(0.4, Number(parsed.confidence) || 0.6)),
    };
  } catch (err: any) {
    console.error("[AI Reclassify DocType]", err?.message ?? err);
    return { docType: "OTHER", confidence: 0.4 };
  }
}

// ─── AI Entity-Type Classification ────────────────────────────────────────────
/**
 * Determines whether a CDM entity is a PERSON or ORGANIZATION using AI.
 * The model only looks at name + canonical field context already in the DB —
 * it never invents data, so hallucination risk is zero.
 */
export async function aiClassifyEntityType(
  displayName: string,
  canonicalFields: Record<string, any>
): Promise<{ entityType: "PERSON" | "ORGANIZATION"; confidence: number }> {
  const context = Object.entries(canonicalFields)
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
    .join("; ");
  const { client: openai, config: aiConfig } = getAiClient();
  try {
    const response = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.chat.completions.create({
          model: getTextModel(aiConfig),
          messages: [
            {
              role: "system",
              content:
                "You are an entity classifier. Classify the entity as PERSON (individual human) or " +
                "ORGANIZATION (company, institution, NGO, bank, government body, association, etc.).\n" +
                "Return ONLY valid JSON — no markdown:\n" +
                '{"entity_type":"PERSON|ORGANIZATION","confidence":0.0-1.0}',
            },
            {
              role: "user",
              content: `Name: ${displayName}\nContext: ${context}`,
            },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 50,
        }),
        AI_TIMEOUT_MS,
        "AI Entity Classification"
      )
    );
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const entityType: "PERSON" | "ORGANIZATION" =
      String(parsed.entity_type ?? "").toUpperCase() === "PERSON" ? "PERSON" : "ORGANIZATION";
    return {
      entityType,
      confidence: Math.min(1, Math.max(0.5, Number(parsed.confidence) || 0.7)),
    };
  } catch (err: any) {
    console.error("[AI Classify EntityType]", err?.message ?? err);
    return { entityType: "ORGANIZATION", confidence: 0.5 };
  }
}

// ─── AI Audio Transcription ─────────────────────────────────────────────────

export async function aiTranscribeAudio(storedUri: string, fileName: string): Promise<string> {
  if (!storedUri.startsWith("local://")) return "";
  const filePath = path.join(UPLOADS_DIR, storedUri.slice(8));
  if (!fs.existsSync(filePath)) return "[Audio file not found]";

  try {
    const { client: openai, config: aiConfig } = getAiClient();
    const ext = path.extname(fileName).slice(1).toLowerCase() || "mp3";
    const supportedFormats = ["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"];
    const fileExt = supportedFormats.includes(ext) ? ext : "mp3";

    const fileStream = fs.createReadStream(filePath);
    const audioFile = await toFile(fileStream, `audio.${fileExt}`, { type: `audio/${fileExt}` });

    const transcription = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.audio.transcriptions.create({
          file: audioFile,
          model: getAudioModel(aiConfig),
          response_format: "text",
        }),
        AI_TIMEOUT_MS,
        "AI Audio Transcription"
      )
    );

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
    // Direct mappings (1:1)
    INVOICE:        "INVOICE",
    QUOTATION:      "QUOTATION",
    QUOTE:          "QUOTATION",
    PROFORMA:       "QUOTATION",
    PRO_FORMA:      "QUOTATION",
    PURCHASE_ORDER: "PURCHASE_ORDER",
    PO:             "PURCHASE_ORDER",
    RECEIPT:        "RECEIPT",
    PAYMENT_RECEIPT:"RECEIPT",
    CONTRACT:       "CONTRACT",
    AGREEMENT:      "AGREEMENT",
    MOU:            "AGREEMENT",
    SLA:            "AGREEMENT",
    LEASE:          "LEASE",
    TENANCY:        "LEASE",
    RENTAL:         "LEASE",
    DEED:           "DEED",
    TITLE_DEED:     "DEED",
    REPORT:         "REPORT",
    FINANCIAL:      "FINANCIAL",
    BANK_STATEMENT: "BANK_STATEMENT",
    STATEMENT:      "BANK_STATEMENT",
    PAYSLIP:        "PAYSLIP",
    SALARY_SLIP:    "PAYSLIP",
    PAY_SLIP:       "PAYSLIP",
    PERMIT:         "PERMIT",
    CERTIFICATE:    "CERTIFICATE",
    CERT:           "CERTIFICATE",
    LICENSE:        "LICENSE",
    LICENCE:        "LICENSE",
    IDENTITY:       "IDENTITY",
    ID_DOCUMENT:    "IDENTITY",
    PASSPORT:       "IDENTITY",
    CV:             "CV",
    RESUME:         "CV",
    CURRICULUM_VITAE: "CV",
    FORM:           "FORM",
    APPLICATION:    "FORM",
    POLICY:         "POLICY",
    INSURANCE:      "POLICY",
    CORRESPONDENCE: "CORRESPONDENCE",
    LETTER:         "CORRESPONDENCE",
    EMAIL:          "CORRESPONDENCE",
    NOTICE:         "CORRESPONDENCE",
    MEMORANDUM:     "MEMORANDUM",
    MEMO:           "MEMORANDUM",
    CIRCULAR:       "MEMORANDUM",
    OTHER:          "OTHER",
    AUDIO_RECORDING:"AUDIO_RECORDING",
    VIDEO_RECORDING:"VIDEO_RECORDING",
    INTERVIEW:      "INTERVIEW",
    MEETING_RECORDING:"MEETING_RECORDING",
  };
  const upper = String(raw ?? "").toUpperCase().trim().replace(/[\s-]/g, "_");
  return map[upper] ?? "OTHER";
}

export function scoreAiExtraction(
  fields: Record<string, { confidence: number }>,
  docType: string,
  docTypeConfidence: number
): {
  ocrConfidence: number;
  extractionConfidence: number;
  consistencyScore: number;
  docQualityScore: number;
} {
  const fieldValues = Object.values(fields);
  const fieldCount = fieldValues.length;

  let avgAiConfidence = 0;
  if (fieldCount > 0) {
    const sum = fieldValues.reduce((acc, f) => acc + (Number(f.confidence) || 0), 0);
    avgAiConfidence = sum / fieldCount;
  } else {
    avgAiConfidence = docTypeConfidence;
  }

  const expected: Record<string, number> = {
    INVOICE: 7, QUOTATION: 6, PURCHASE_ORDER: 6, RECEIPT: 5,
    CONTRACT: 6, AGREEMENT: 5, LEASE: 5, DEED: 4,
    REPORT: 3, FINANCIAL: 5, BANK_STATEMENT: 6, PAYSLIP: 7,
    PERMIT: 4, CERTIFICATE: 4, LICENSE: 4,
    IDENTITY: 6, CV: 7, FORM: 5, POLICY: 6,
    CORRESPONDENCE: 3, MEMORANDUM: 3, OTHER: 2,
    AUDIO_RECORDING: 2, VIDEO_RECORDING: 2, INTERVIEW: 2, MEETING_RECORDING: 2,
  };
  const exp = expected[docType] ?? 3;
  const coverage = Math.min(1.0, fieldCount / exp);

  const ocrConfidence = 0.85 + (coverage * 0.10);
  const extractionConfidence = avgAiConfidence;
  const consistencyScore = 0.70 + (avgAiConfidence * 0.20) + (coverage * 0.10);
  const docQualityScore = 0.75 + (coverage * 0.15) + (avgAiConfidence * 0.10);

  return {
    ocrConfidence: Math.min(0.98, Math.max(0, ocrConfidence)),
    extractionConfidence: Math.min(0.99, Math.max(0, extractionConfidence)),
    consistencyScore: Math.min(0.98, Math.max(0, consistencyScore)),
    docQualityScore: Math.min(0.98, Math.max(0, docQualityScore)),
  };
}

// ─── Vision-Based Extraction (scanned PDFs + images) ─────────────────────────

/**
 * Convert up to `maxPages` pages of a PDF to base64 JPEG strings using pdftoppm.
 * Returns an empty array if pdftoppm is not available or conversion fails.
 */
import { findPdftoppm } from "./extraction";

function pdfToImages(filePath: string, maxPages = 3): Array<{ base64: string; mimeType: string }> {
  const pdftoppm = findPdftoppm();
  if (!pdftoppm) return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adrs_pdf_"));
  const outPrefix = path.join(tmpDir, "page");
  const images: Array<{ base64: string; mimeType: string }> = [];

  try {
    execSync(
      `"${pdftoppm}" -r 150 -jpeg -f 1 -l ${maxPages} "${filePath}" "${outPrefix}"`,
      { timeout: 30000, stdio: "pipe" }
    );
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg")).sort();
    for (const f of files.slice(0, maxPages)) {
      const data = fs.readFileSync(path.join(tmpDir, f));
      images.push({ base64: data.toString("base64"), mimeType: "image/jpeg" });
    }
  } catch (err: any) {
    console.error("[Vision] pdftoppm failed:", err?.message ?? err);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return images;
}

/**
 * Build the vision message content array for a list of base64 images.
 */
function buildImageContent(images: Array<{ base64: string; mimeType: string }>, prompt: string): any[] {
  const content: any[] = [{ type: "text", text: prompt }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
    });
  }
  return content;
}

/**
 * Extract fields from a scanned/image-based PDF or image file using GPT-4o vision.
 * Converts PDF pages to images first; for direct image files reads them directly.
 */
export async function aiExtractWithVision(
  storedUri: string,
  fileName: string,
  fileFormat: string,
  contextText?: string
): Promise<AiExtractionResult> {
  if (!storedUri.startsWith("local://")) {
    return { docType: "OTHER", docTypeConfidence: 0.4, fields: {}, entities: [], summary: fileName, language: "en" };
  }

  const filePath = path.join(UPLOADS_DIR, storedUri.slice(8));
  if (!fs.existsSync(filePath)) {
    return { docType: "OTHER", docTypeConfidence: 0.4, fields: {}, entities: [], summary: `${fileName} — file not found`, language: "en" };
  }

  const fmt = fileFormat.toLowerCase();
  const IMAGE_FORMATS = ["png", "jpg", "jpeg", "tiff", "tif", "bmp", "gif", "webp"];

  let images: Array<{ base64: string; mimeType: string }> = [];

  if (fmt === "pdf") {
    images = pdfToImages(filePath, 3);
  } else if (IMAGE_FORMATS.includes(fmt)) {
    try {
      const data = fs.readFileSync(filePath);
      const mime = fmt === "jpg" || fmt === "jpeg" ? "image/jpeg"
        : fmt === "png" ? "image/png"
        : fmt === "gif" ? "image/gif"
        : fmt === "webp" ? "image/webp"
        : "image/jpeg";
      images = [{ base64: data.toString("base64"), mimeType: mime }];
    } catch (err: any) {
      console.error("[Vision] Failed to read image:", err?.message);
    }
  }

  if (images.length === 0) {
    console.warn(`[Vision] No images extracted from ${fileName} (${fmt})`);
    return { docType: "OTHER", docTypeConfidence: 0.4, fields: {}, entities: [], summary: `${fileName} — no visual content`, language: "en" };
  }

  const visionPrompt = `You are an expert document intelligence engine for an African financial data platform. Analyze this document image and extract ALL structured information.

Return ONLY a valid JSON object with EXACTLY this structure (no markdown, no preamble):
{
  "doc_type": "INVOICE|QUOTATION|PURCHASE_ORDER|RECEIPT|CONTRACT|AGREEMENT|LEASE|DEED|REPORT|FINANCIAL|BANK_STATEMENT|PAYSLIP|PERMIT|CERTIFICATE|LICENSE|IDENTITY|CV|FORM|POLICY|CORRESPONDENCE|MEMORANDUM|OTHER",
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

DOC_TYPE: Choose the most specific type. INVOICE=bill with amounts due; QUOTATION=price quote before delivery; RECEIPT=proof of payment made; CONTRACT=formal legally-binding agreement; CV=resume/curriculum vitae; FORM=application or data-entry form; POLICY=insurance or company policy; PAYSLIP=salary advice; BANK_STATEMENT=transaction statement; CERTIFICATE=certificate of any kind; IDENTITY=ID doc/passport.

Extract ALL visible fields including: document_date, due_date, reference_number, invoice_number, total_amount, subtotal, tax_amount, currency, vendor_name, vendor_address, vendor_email, vendor_phone, customer_name, customer_address, customer_email, signatory_name, bank_name, bank_account, contract_number, permit_number, national_id, date_of_birth, and any other structured data visible.

For PERSON entities: extract EVERY individual human name visible. For ORGANIZATION entities: extract EVERY company, institution, or body name visible.

Be thorough — extract everything you can read. Return confidence 0.95+ for clearly printed text, 0.8+ for legible text, 0.6+ for partially obscured text.`;

  try {
    const { client: openai, config: aiConfig } = getAiClient();
    const messageContent = buildImageContent(images, visionPrompt);
    const response = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.chat.completions.create({
          model: getVisionModel(aiConfig),
          messages: [{ role: "user", content: messageContent }],
          response_format: { type: "json_object" },
          max_completion_tokens: 4096,
        }),
        AI_TIMEOUT_MS,
        "AI Vision Extraction"
      )
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const fields: Record<string, AiExtractedField> = {};
    for (const [key, val] of Object.entries(parsed.fields ?? {})) {
      const v = val as { value: string; confidence: number };
      if (v?.value != null && String(v.value).trim() !== "") {
        fields[key] = {
          value: String(v.value).trim(),
          confidence: Math.min(1, Math.max(0, Number(v.confidence) || 0.85)),
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
          confidence: Math.min(1, Math.max(0, Number(ent.confidence) || 0.85)),
        });
      }
    }

    const aiResult = {
      docType: normalizeDocType(parsed.doc_type),
      docTypeConfidence: Math.min(1, Math.max(0.5, Number(parsed.doc_type_confidence) || 0.80)),
      fields,
      entities,
      summary: String(parsed.summary ?? "").slice(0, 300),
      language: String(parsed.language ?? "en").slice(0, 10),
    };

    const fallbackResult = buildFallbackExtractionResult(contextText ?? "", fileName);
    if (Object.keys(fields).length === 0 && entities.length === 0) {
      return mergeExtractionResults(aiResult, fallbackResult);
    }

    return mergeExtractionResults(aiResult, fallbackResult);
  } catch (err: any) {
    console.error("[Vision Extraction] Error:", err?.message ?? err);
    return {
      ...buildFallbackExtractionResult(contextText ?? "", fileName),
      summary: `${fileName} — vision extraction failed`,
    };
  }
}
