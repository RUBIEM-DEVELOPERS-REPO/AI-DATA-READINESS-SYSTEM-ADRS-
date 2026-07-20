import { createHash } from "crypto";
import { jobQueue, type JobRecord } from "../queue";

export function tenantIdFromReq(req: any): string {
  const tenantId = (req.user as any)?.tenantId;
  if (!tenantId) {
    throw Object.assign(new Error("Missing tenantId on authenticated request"), { status: 400 });
  }
  return tenantId;
}

export function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${prefix}-${year}-${rand}`;
}

export function generateHash(input: string): string {
  return "sha256:" + createHash("sha256").update(input + Date.now()).digest("hex");
}

export function resolveDocRelationshipType(sourceAttrKeys: string[], docType: string): string {
  const keys = sourceAttrKeys.map(k => k.toLowerCase());
  if (keys.some(k => ["candidate_name", "applicant_name", "employee_name", "patient_name"].includes(k))) return "SUBJECT_OF";
  if (keys.some(k => k.startsWith("vendor_") || k.startsWith("supplier_") || k.startsWith("issuer_"))) return "ISSUED_BY";
  if (keys.some(k => k.startsWith("customer_") || k.startsWith("client_") || k.startsWith("buyer_") || k.startsWith("recipient_"))) return "ISSUED_TO";
  if (keys.some(k => k.startsWith("signatory_"))) return "SIGNATORY_OF";
  if (keys.some(k => k.startsWith("employee_") || k.startsWith("director_") || k.startsWith("officer_"))) return "AFFILIATED_WITH";
  if (keys.some(k => k.startsWith("guarantor_") || k.startsWith("borrower_") || k.startsWith("surety_"))) return "AFFILIATED_WITH";
  
  const dt = (docType ?? "").toUpperCase();
  if (dt === "CV" || dt === "RESUME") return "SUBJECT_OF";
  if (dt === "INVOICE" || dt === "RECEIPT" || dt === "QUOTATION") return "MENTIONED_IN";
  return "MENTIONED_IN";
}

export function stripText<T extends { rawText?: string | null }>(run: T): T {
  const { rawText, ...rest } = run as any;
  return rest as T;
}

export function waitForJob(jobId: string): Promise<JobRecord> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const job = jobQueue.getJob(jobId);
      if (!job || job.status === "completed" || job.status === "failed") {
        clearInterval(interval);
        resolve(job!);
      }
    }, 50);
  });
}
