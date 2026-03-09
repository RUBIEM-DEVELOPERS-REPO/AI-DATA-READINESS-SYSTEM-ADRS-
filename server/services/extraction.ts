import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { UPLOADS_DIR } from "../upload";

// ─── PDF Text Extraction ─────────────────────────────────────────────────────

const PDFTOTEXT_BIN = "/nix/store/cyw93fls51n8b27z7a49jl40l3xdwdms-replit-runtime-path/bin/pdftotext";

function isPdfValid(filePath: string): boolean {
  try {
    const header = Buffer.alloc(5);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, header, 0, 5, 0);
    fs.closeSync(fd);
    return header.toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

function extractPdfText(filePath: string): string {
  if (!isPdfValid(filePath)) {
    return "[PDF is not a valid PDF file or is corrupted]";
  }
  // Try pdftotext (poppler) first — most reliable for text-based PDFs
  try {
    if (fs.existsSync(PDFTOTEXT_BIN)) {
      const text = execSync(`"${PDFTOTEXT_BIN}" -q "${filePath}" -`, {
        timeout: 20000,
        maxBuffer: 10 * 1024 * 1024,
      })
        .toString("utf-8")
        .trim();
      if (text.length > 10) {
        return text.slice(0, 50000);
      }
    }
  } catch {
    // fall through to regex parser
  }
  // Fallback: regex-based parser for simple uncompressed PDFs
  try {
    const raw = fs.readFileSync(filePath);
    const content = raw.toString("binary");
    const texts: string[] = [];
    const btEtPattern = /BT\s([\s\S]*?)ET/g;
    let btMatch;
    while ((btMatch = btEtPattern.exec(content)) !== null) {
      const block = btMatch[1];
      const tjPattern = /\(([^)]*(?:\)[^)]*)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]*)>\s*(?:Tj|'|")/g;
      let tjMatch;
      while ((tjMatch = tjPattern.exec(block)) !== null) {
        const decoded = tjMatch[1] !== undefined
          ? tjMatch[1].replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\\(/g, "(").replace(/\\\)/g, ")")
          : "";
        if (decoded.trim().length > 0) texts.push(decoded.trim());
      }
      const tjArrayPattern = /\[(.*?)\]\s*TJ/gs;
      let tjArrMatch;
      while ((tjArrMatch = tjArrayPattern.exec(block)) !== null) {
        const strPattern = /\(([^)]*(?:\)[^)]*)*)\)/g;
        let strMatch;
        while ((strMatch = strPattern.exec(tjArrMatch[1])) !== null) {
          if (strMatch[1].trim().length > 0) texts.push(strMatch[1].trim());
        }
      }
    }
    const result = texts.join(" ").replace(/\s+/g, " ").trim();
    return result.slice(0, 50000);
  } catch {
    return "";
  }
}

// ─── Text Extraction ────────────────────────────────────────────────────────

export async function extractTextFromFile(storedUri: string, fileFormat: string): Promise<string> {
  if (!storedUri.startsWith("local://")) {
    return "";
  }
  const filePath = path.join(UPLOADS_DIR, storedUri.slice(8));
  if (!fs.existsSync(filePath)) return "";

  const fmt = fileFormat.toLowerCase();

  if (["txt", "csv", "json", "md", "log", "xml", "html"].includes(fmt)) {
    return fs.readFileSync(filePath, "utf-8").slice(0, 50000);
  }

  if (fmt === "pdf") {
    return extractPdfText(filePath);
  }

  // For images, audio, video — return empty (simulated later)
  return "";
}

// ─── Doc Type Detection ──────────────────────────────────────────────────────

type DocType = "INVOICE" | "CONTRACT" | "REPORT" | "PERMIT" | "IDENTITY" | "FINANCIAL" | "CORRESPONDENCE" | "AUDIO_RECORDING" | "VIDEO_RECORDING" | "INTERVIEW" | "MEETING_RECORDING" | "OTHER";

export function detectDocType(text: string, fileFormat: string, mediaType: string): { docType: DocType; confidence: number } {
  const fmt = fileFormat.toLowerCase();

  if (["mp3", "wav", "aac", "flac", "ogg", "m4a"].includes(fmt)) {
    return { docType: "AUDIO_RECORDING", confidence: 0.95 };
  }
  if (["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(fmt)) {
    return { docType: "VIDEO_RECORDING", confidence: 0.95 };
  }
  if (["png", "jpg", "jpeg", "tiff", "bmp", "gif"].includes(fmt)) {
    return { docType: "OTHER", confidence: 0.60 };
  }

  if (!text) return { docType: "OTHER", confidence: 0.45 };

  const lower = text.toLowerCase();
  const scores: Partial<Record<DocType, number>> = {};

  const rules: [DocType, string[]][] = [
    ["INVOICE",       ["invoice", "bill to", "invoice no", "invoice number", "payment due", "subtotal", "total due", "amount due", "vat", "tax invoice"]],
    ["FINANCIAL",     ["receipt", "payment receipt", "transaction", "paid", "balance", "debit", "credit", "bank statement", "statement of account", "remittance"]],
    ["CONTRACT",      ["agreement", "contract", "parties agree", "terms and conditions", "hereby agree", "obligations", "clause", "witnesseth", "indemnity", "liability"]],
    ["REPORT",        ["report", "analysis", "findings", "executive summary", "recommendation", "conclusion", "appendix", "methodology", "overview", "assessment"]],
    ["PERMIT",        ["permit", "licence", "license", "certificate", "hereby certify", "authorized to", "registration no", "expiry date", "valid until", "issued by"]],
    ["IDENTITY",      ["national id", "passport", "date of birth", "id number", "national insurance", "citizenship", "nationality", "id card", "photo id", "biometric"]],
    ["CORRESPONDENCE",["dear", "sincerely", "regards", "to whom it may concern", "pursuant to", "further to", "reference to your", "please find enclosed", "kindly"]],
    ["INTERVIEW",     ["interview", "question", "answer", "candidate", "interviewer", "interviewee", "discussed", "experience", "position"]],
    ["MEETING_RECORDING", ["meeting", "agenda", "minutes", "attendees", "action items", "discussed", "resolved", "motioned", "seconded"]],
  ];

  for (const [type, keywords] of rules) {
    const hits = keywords.filter(k => lower.includes(k)).length;
    if (hits > 0) scores[type] = (scores[type] ?? 0) + hits;
  }

  const best = (Object.entries(scores) as [DocType, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return { docType: "OTHER", confidence: 0.45 };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = Math.min(0.97, 0.55 + (best[1] / total) * 0.40);
  return { docType: best[0], confidence };
}

// ─── Field Extraction ────────────────────────────────────────────────────────

interface ExtractedField {
  value: string;
  confidence: number;
  source: string;
}

function findFirst(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1]?.trim() ?? m[0]?.trim();
  }
  return null;
}

function findAll(text: string, patterns: RegExp[]): string[] {
  const results: string[] = [];
  for (const re of patterns) {
    const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
    for (const m of matches) {
      const v = (m[1] ?? m[0]).trim();
      if (v && !results.includes(v)) results.push(v);
    }
  }
  return results;
}

export function extractFieldsFromText(text: string, docType: string): Record<string, ExtractedField> {
  const fields: Record<string, ExtractedField> = {};
  if (!text) return fields;

  // Dates
  const datePatterns = [
    /(?:date|dated|issued?(?:\s+on)?|issued?\s*:)\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:date|dated|issued?(?:\s+on)?|issued?\s*:)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ];
  const date = findFirst(text, datePatterns);
  if (date) fields.document_date = { value: date, confidence: 0.82, source: "regex:date_pattern" };

  // Monetary amounts
  const amountPatterns = [
    /(?:total|amount\s+due|total\s+due|grand\s+total|balance\s+due|net\s+amount)\s*[:\.]?\s*([A-Z]{0,3}[\$£€¢]\s*[\d,]+(?:\.\d{2})?)/gi,
    /(?:total|amount\s+due|total\s+due|grand\s+total)\s*[:\.]?\s*([\d,]+(?:\.\d{2})?)\s*(?:USD|GHS|KES|NGN|ZAR|EUR|GBP)?/gi,
  ];
  const amounts = findAll(text, amountPatterns);
  if (amounts.length > 0) {
    fields.total_amount = { value: amounts[0], confidence: 0.85, source: "regex:currency_pattern" };
    if (amounts.length > 1) fields.subtotal = { value: amounts[1], confidence: 0.75, source: "regex:currency_pattern" };
  }

  // Invoice / reference numbers
  const refPatterns = [
    /(?:invoice\s*(?:no|num|number|#)\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
    /(?:receipt\s*(?:no|num|number|#)\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
    /(?:reference\s*(?:no|num|number|#)?\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
    /(?:order\s*(?:no|num|number|#)\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
    /(?:PO\s*(?:no|num|number|#)?\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
    /(?:contract\s*(?:no|num|number|#)\s*[:\.]?\s*)([A-Z0-9\-\/]+)/i,
  ];
  const ref = findFirst(text, refPatterns);
  if (ref) fields.reference_number = { value: ref, confidence: 0.88, source: "regex:reference_pattern" };

  // Party names — vendor / supplier
  const vendorPatterns = [
    /(?:from|vendor|supplier|sold\s+by|billed?\s+(?:from|by)|company\s+name|service\s+provider)\s*[:\.]?\s*([A-Z][A-Za-z\s&,.'()\-]{2,50}?)(?:\n|$|,)/im,
  ];
  const vendor = findFirst(text, vendorPatterns);
  if (vendor && vendor.length > 2 && vendor.length < 80) {
    fields.vendor_name = { value: vendor.trim(), confidence: 0.72, source: "regex:party_name" };
  }

  // Party — customer / buyer
  const customerPatterns = [
    /(?:to|bill\s+to|ship\s+to|sold\s+to|customer|client|buyer)\s*[:\.]?\s*([A-Z][A-Za-z\s&,.'()\-]{2,50}?)(?:\n|$|,)/im,
  ];
  const customer = findFirst(text, customerPatterns);
  if (customer && customer.length > 2 && customer.length < 80 && customer !== vendor) {
    fields.customer_name = { value: customer.trim(), confidence: 0.70, source: "regex:party_name" };
  }

  // Email addresses
  const emails = findAll(text, [/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/]);
  if (emails.length > 0) fields.email = { value: emails[0], confidence: 0.95, source: "regex:email" };
  if (emails.length > 1) fields.email_secondary = { value: emails[1], confidence: 0.90, source: "regex:email" };

  // Phone numbers
  const phones = findAll(text, [
    /(?:tel|phone|mobile|fax|call)\s*[:\.]?\s*([\+\d][\d\s\-\(\)]{7,20})/gi,
    /\b(\+?[\d][\d\s\-]{8,18}\d)\b/g,
  ]);
  if (phones.length > 0) fields.phone_number = { value: phones[0], confidence: 0.80, source: "regex:phone" };

  // Due date / expiry
  const dueDatePatterns = [
    /(?:due\s+(?:date|by)|payment\s+due|pay\s+by|expiry\s+date|valid\s+until|expires?)\s*[:\.]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  ];
  const dueDate = findFirst(text, dueDatePatterns);
  if (dueDate) fields.due_date = { value: dueDate, confidence: 0.80, source: "regex:date_pattern" };

  // Currency / tax
  const taxPatterns = [
    /(?:vat|tax|gst|hst)\s*[:\.]?\s*([A-Z]{0,3}[\$£€]?\s*[\d,]+(?:\.\d{2})?)/gi,
  ];
  const tax = findFirst(text, taxPatterns);
  if (tax) fields.tax_amount = { value: tax, confidence: 0.78, source: "regex:currency_pattern" };

  // Description / subject for non-financial docs
  if (!["INVOICE", "FINANCIAL"].includes(docType)) {
    const subjPatterns = [
      /(?:subject|re|regarding|title|matter)\s*[:\.]?\s*(.{5,120}?)(?:\n|$)/im,
    ];
    const subj = findFirst(text, subjPatterns);
    if (subj) fields.subject = { value: subj.trim(), confidence: 0.68, source: "regex:subject_pattern" };
  }

  return fields;
}

// ─── Entity Extraction ───────────────────────────────────────────────────────

export function extractEntitiesFromText(text: string, extractedFields: Record<string, ExtractedField>): Array<{ entity: string; value: string; confidence: number; evidence_pointer?: string }> {
  const entities: Array<{ entity: string; value: string; confidence: number; evidence_pointer?: string }> = [];

  const orgKeywords = [
    "Limited", "Ltd", "Inc", "LLC", "Corp", "PLC", "Company", "Co.", "Group",
    "Association", "Foundation", "Bank", "Services", "Solutions", "Technologies", "Institute",
  ];
  const orgPattern = new RegExp(`([A-Z][A-Za-z\\s]{1,40}(?:${orgKeywords.join("|")})(?:\\.)?(?:\\s+[A-Z][A-Za-z]{1,20})?)[\\s,]`, "g");
  const orgMatches = [...text.matchAll(orgPattern)].slice(0, 5);
  for (const m of orgMatches) {
    const v = m[1].trim();
    if (v.length > 3 && v.length < 80) {
      entities.push({ entity: "ORGANIZATION", value: v, confidence: 0.75 });
    }
  }

  // Monetary values
  const moneyMatches = [...text.matchAll(/(?:[\$£€GH₦])\s*([\d,]+(?:\.\d{2})?)/g)].slice(0, 4);
  for (const m of moneyMatches) {
    entities.push({ entity: "MONEY", value: m[0].trim(), confidence: 0.85 });
  }

  // Dates
  const dateMatches = [...text.matchAll(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g)].slice(0, 3);
  for (const m of dateMatches) {
    entities.push({ entity: "DATE", value: m[0], confidence: 0.80 });
  }

  // Emails
  if (extractedFields.email) {
    entities.push({ entity: "EMAIL", value: extractedFields.email.value, confidence: 0.95 });
  }

  return entities.slice(0, 15);
}

// ─── Confidence Scoring ──────────────────────────────────────────────────────

export function computeExtractionScores(text: string, fieldCount: number, docType: string, mediaType: string): {
  ocrConfidence: number;
  extractionConfidence: number;
  completenessScore: number;
  consistencyScore: number;
  docQualityScore: number;
  processingTimeMs: number;
} {
  const isAV = ["AUDIO", "VIDEO"].includes(mediaType);
  const hasRealText = text.length > 100;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const ocrConfidence = isAV
    ? 0.72 + Math.random() * 0.20
    : hasRealText
      ? Math.min(0.98, 0.70 + (wordCount / 500) * 0.20 + Math.random() * 0.08)
      : 0.45 + Math.random() * 0.25;

  const extractionConfidence = fieldCount > 5
    ? 0.78 + Math.random() * 0.15
    : fieldCount > 2
      ? 0.60 + Math.random() * 0.20
      : 0.35 + Math.random() * 0.25;

  const expectedFields: Record<string, number> = {
    INVOICE: 6, FINANCIAL: 5, CONTRACT: 4, REPORT: 3, PERMIT: 4,
    IDENTITY: 5, CORRESPONDENCE: 3, AUDIO_RECORDING: 2, VIDEO_RECORDING: 2, OTHER: 2,
  };
  const expected = expectedFields[docType] ?? 3;
  const completenessScore = Math.min(1.0, fieldCount / expected);

  const consistencyScore = hasRealText
    ? 0.72 + Math.random() * 0.22
    : 0.40 + Math.random() * 0.30;

  const docQualityScore = hasRealText
    ? Math.min(0.98, 0.65 + (Math.min(wordCount, 1000) / 1000) * 0.25 + Math.random() * 0.08)
    : 0.35 + Math.random() * 0.35;

  const processingTimeMs = 800 + Math.floor(Math.random() * 2200);

  return {
    ocrConfidence: Math.round(ocrConfidence * 1000) / 1000,
    extractionConfidence: Math.round(extractionConfidence * 1000) / 1000,
    completenessScore: Math.round(completenessScore * 1000) / 1000,
    consistencyScore: Math.round(consistencyScore * 1000) / 1000,
    docQualityScore: Math.round(docQualityScore * 1000) / 1000,
    processingTimeMs,
  };
}

// ─── AV Simulation ──────────────────────────────────────────────────────────

export function simulateTranscript(fileName: string, durationSeconds?: number): string {
  const dur = durationSeconds ?? 120;
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return `[Auto-generated transcript for: ${name}]\n\n` +
    `[00:00:00] Speaker 1: Good morning, this recording covers the topic of ${name}.\n` +
    `[00:00:15] Speaker 2: Thank you. I would like to begin by discussing the key objectives.\n` +
    `[00:01:00] Speaker 1: Agreed. The primary goals include documentation, review, and next steps.\n` +
    `[00:02:30] Speaker 2: We should also note the action items for follow-up.\n` +
    (dur > 180 ? `[00:04:00] Speaker 1: Let us review the documents shared prior to this session.\n` : "") +
    `[${String(Math.floor(dur / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}:00] [End of recording]`;
}
