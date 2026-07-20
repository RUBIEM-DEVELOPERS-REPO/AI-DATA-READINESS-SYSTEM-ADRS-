import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { objectStore, resolveLocalPath } from "../services/object-store";
import { assertFileSafe } from "../malware-scan";
import { insertBatchSchema, insertEvidenceSchema } from "@shared/schema";
import { tenantIdFromReq, generateCode, generateHash } from "./utils";
import { uploadMiddleware, computeFileHash, getMimeType, detectCloudSource, downloadFile, UPLOADS_DIR } from "../upload";
import { requireTenantContext, type TenantContext } from "../middleware/tenant-guard";
import path from "path";
import fs from "fs";
import unzipper from "unzipper";
import multer from "multer";

const router = Router();

// Apply auth and tenant context globally to all evidence router endpoints
router.use(requireAuth);
router.use(requireTenantContext);

async function assertBatchCapacity(ctx: TenantContext, batchId: string | undefined | null, slotsNeeded = 1): Promise<void> {
  if (!batchId) return;
  const batch = await storage.getBatch(batchId, ctx);
  if (!batch) throw Object.assign(new Error(`Batch ${batchId} not found`), { status: 404 });
  if (batch.status === "COMPLETED") {
    throw Object.assign(new Error(`Batch ${batch.batchCode} is already completed and cannot accept new files`), { status: 409 });
  }
  if (batch.status === "FAILED") {
    throw Object.assign(new Error(`Batch ${batch.batchCode} has failed and cannot accept new files`), { status: 409 });
  }
  if (batch.expectedDocuments > 0) {
    const remaining = batch.expectedDocuments - batch.scannedDocuments;
    if (remaining <= 0) {
      throw Object.assign(
        new Error(`Batch ${batch.batchCode} is full (${batch.scannedDocuments}/${batch.expectedDocuments} files). Increase the expected document count or create a new batch.`),
        { status: 409 }
      );
    }
    if (slotsNeeded > remaining) {
      throw Object.assign(
        new Error(`Batch ${batch.batchCode} only has room for ${remaining} more file${remaining !== 1 ? "s" : ""}, but ${slotsNeeded} were requested. Increase the expected document count or split the upload.`),
        { status: 409 }
      );
    }
  }
}

// ─── Batches ───────────────────────────────────────────────────────────────
router.get("/batches", async (req: any, res: any) => res.json(await storage.getBatches(req.tenantContext)));

router.post("/batches", requireRole("ANALYST"), async (req: any, res: any) => {
  const parse = insertBatchSchema.safeParse({ ...req.body, tenantId: req.tenantContext.tenantId, batchCode: generateCode("BATCH") });
  if (!parse.success) return res.status(400).json({ error: parse.error });
  const batch = await storage.createBatch(parse.data);
  await storage.createAuditLog({ action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch.id, userId: batch.createdBy, details: { batch_code: batch.batchCode }, tenantId: req.tenantContext.tenantId });
  res.json(batch);
});

router.patch("/batches/:id", requireRole("ANALYST"), async (req: any, res: any) => {
  const batch = await storage.updateBatch(req.params.id, req.body, req.tenantContext);
  if (!batch) return res.status(404).json({ error: "Not found" });
  res.json(batch);
});

// ─── Evidence ──────────────────────────────────────────────────────────────
router.get("/evidence", async (req: any, res: any) => {
  const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

  if (page !== undefined && (isNaN(page) || page < 1)) {
    return res.status(400).json({ error: "Invalid page parameter" });
  }
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return res.status(400).json({ error: "Invalid limit parameter" });
  }

  res.json(await storage.getEvidenceFiles(req.tenantContext, page, limit));
});

// Serve stored file for download/preview
router.get("/evidence/:id/file", async (req: any, res: any) => {
  try {
    const f = await storage.getEvidenceFile(req.params.id, req.tenantContext);
    if (!f) return res.status(404).json({ error: "Not found" });
    const ext = path.extname(f.fileName).slice(1).toLowerCase();
    res.setHeader("Content-Type", getMimeType(ext));
    res.setHeader("Content-Disposition", `inline; filename="${f.fileName}"`);

    if (f.storedUri.startsWith("local://")) {
      const filePath = resolveLocalPath(f.storedUri);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing from disk" });
      res.sendFile(filePath);
    } else {
      const buffer = await objectStore.get(f.storedUri);
      res.send(buffer);
    }
  } catch (err: any) {
    console.error("[Serve File] Failed:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

router.get("/evidence/:id", async (req: any, res: any) => {
  const f = await storage.getEvidenceFile(req.params.id, req.tenantContext);
  if (!f) return res.status(404).json({ error: "Not found" });
  res.json(f);
});

// Real file upload via multipart/form-data
router.post("/evidence/upload", requireRole("ANALYST"), (req: any, res: any) => {
  uploadMiddleware(req, res, async (err: any) => {
    if (err) return res.status(err.status || 400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    try {
      const ext = path.extname(req.file.originalname).slice(1).toLowerCase() || "bin";
      const fileHash = computeFileHash(req.file.path);
      const existingByHash = await storage.getEvidenceFileByHash(fileHash, req.tenantContext);
      if (existingByHash) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(409).json({ error: `Duplicate evidence: this file already exists as "${existingByHash.fileName}" (${existingByHash.evidenceCode}).`, duplicate: true, existingFile: { id: existingByHash.id, fileName: existingByHash.fileName, evidenceCode: existingByHash.evidenceCode } });
      }
      
      // Upload to object store
      const storedUri = await objectStore.put(req.file.filename, fs.readFileSync(req.file.path), getMimeType(ext));
      
      // Clean up local temp file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      const body = {
        ...req.body,
        tenantId: req.tenantContext.tenantId,
        fileName: req.file.originalname,
        fileFormat: ext,
        fileSizeBytes: req.file.size,
        fileHash,
        storedUri,
        evidenceCode: generateCode("EVID"),
        immutabilityStatus: "LOCKED",
        mediaType: req.body.mediaType || (["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO" : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO" : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT"),
        durationSeconds: req.body.durationSeconds ? parseInt(req.body.durationSeconds) : undefined,
        pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : undefined,
        batchId: req.body.batchId || undefined,
      };
      const parse = insertEvidenceSchema.safeParse(body);
      if (!parse.success) {
        // Since we already stored the file in objectStore, we should try to delete it to prevent orphaned files
        await objectStore.delete(storedUri).catch(() => {});
        return res.status(400).json({ error: parse.error });
      }
      await assertBatchCapacity(req.tenantContext, parse.data.batchId);
      const file = await storage.createEvidenceFile(parse.data);
      if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
      await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "file_upload" }, tenantId: req.tenantContext.tenantId });
      res.json(file);
    } catch (e: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      const status = (e as any)?.status ?? 500;
      res.status(status).json({ error: e?.message ?? "Upload failed" });
    }
  });
});

// Import from URL
router.post("/evidence/import-url", requireRole("ANALYST"), async (req: any, res: any) => {
  const { url, uploadedBy, batchId, tags, durationSeconds } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  let tempDiskPath: string | null = null;
  let storedUri: string | null = null;
  try {
    await assertBatchCapacity(req.tenantContext, batchId || undefined);
    const { source, downloadUrl, fileName: detectedName } = detectCloudSource(url);
    const ext = path.extname(detectedName).slice(1).toLowerCase() || "bin";
    const diskName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || "bin"}`;
    tempDiskPath = path.join(UPLOADS_DIR, diskName);
    
    await downloadFile(downloadUrl, tempDiskPath);
    assertFileSafe(tempDiskPath);

    const stats = fs.statSync(tempDiskPath);
    const fileHash = computeFileHash(tempDiskPath);
    const existingByHash = await storage.getEvidenceFileByHash(fileHash, req.tenantContext);
    if (existingByHash) {
      fs.unlinkSync(tempDiskPath);
      return res.status(409).json({ error: `Duplicate evidence: this file already exists as "${existingByHash.fileName}" (${existingByHash.evidenceCode}).`, duplicate: true, existingFile: { id: existingByHash.id, fileName: existingByHash.fileName, evidenceCode: existingByHash.evidenceCode } });
    }
    
    // Upload to object store
    storedUri = await objectStore.put(diskName, fs.readFileSync(tempDiskPath), getMimeType(ext));
    
    // Clean up local temp file
    fs.unlinkSync(tempDiskPath);
    tempDiskPath = null;

    const mediaType = ["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO"
      : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO"
      : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT";
    const body = {
      tenantId: req.tenantContext.tenantId,
      fileName: detectedName,
      fileFormat: ext,
      fileSizeBytes: stats.size,
      fileHash,
      storedUri,
      evidenceCode: generateCode("EVID"),
      immutabilityStatus: "LOCKED",
      sourceType: source,
      sourceReference: url,
      mediaType,
      durationSeconds: durationSeconds ? parseInt(durationSeconds) : undefined,
      uploadedBy: uploadedBy || "operator_001",
      batchId: batchId || undefined,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
    };
    const parse = insertEvidenceSchema.safeParse(body);
    if (!parse.success) {
      if (storedUri) await objectStore.delete(storedUri).catch(() => {});
      return res.status(400).json({ error: parse.error });
    }
    const file = await storage.createEvidenceFile(parse.data);
    if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
    await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "url_import", source_url: url }, tenantId: req.tenantContext.tenantId });
    res.json(file);
  } catch (e: any) {
    if (tempDiskPath && fs.existsSync(tempDiskPath)) fs.unlinkSync(tempDiskPath);
    const status = (e as any)?.status ?? 500;
    res.status(status).json({ error: e?.message ?? "Import failed" });
  }
});

// ZIP Batch Upload
const zipUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req: any, file: any, cb: any) => {
      cb(null, `zip_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".zip" || file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed") {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted on this endpoint"));
    }
  },
}).single("file");

router.post("/evidence/upload-zip", requireRole("ANALYST"), (req: any, res: any) => {
  zipUploadMiddleware(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No ZIP file provided" });

    const { uploadedBy = "operator_001", batchId, tags } = req.body;
    const zipPath = req.file.path;
    const results: any[] = [];
    const errors: string[] = [];

    try {
      const entries: any[] = [];
      const directory = await unzipper.Open.file(zipPath);
      for (const entry of directory.files) {
        if (entry.type === "Directory") continue;
        const baseName = path.basename(entry.path);
        if (baseName.startsWith(".") || baseName.startsWith("__MACOSX") || baseName === "Thumbs.db") continue;
        entries.push(entry);
      }

      try {
        await assertBatchCapacity(req.tenantContext, batchId || undefined, entries.length);
      } catch (capErr: any) {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        return res.status(capErr?.status ?? 409).json({ error: capErr.message });
      }

      for (const entry of entries) {
        let tempDiskPath: string | null = null;
        let storedUri: string | null = null;
        try {
          const baseName = path.basename(entry.path);
          const ext = path.extname(baseName).slice(1).toLowerCase() || "bin";
          const diskName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          tempDiskPath = path.join(UPLOADS_DIR, diskName);
          
          const buffer = await entry.buffer();
          fs.writeFileSync(tempDiskPath, buffer);
          
          // Malware check ZIP entries
          assertFileSafe(tempDiskPath);

          const fileHash = computeFileHash(tempDiskPath);
          const existingByHash = await storage.getEvidenceFileByHash(fileHash, req.tenantContext);
          if (existingByHash) {
            if (fs.existsSync(tempDiskPath)) fs.unlinkSync(tempDiskPath);
            errors.push(`${baseName}: DUPLICATE — already ingested as "${existingByHash.fileName}" (${existingByHash.evidenceCode})`);
            continue;
          }

          // Upload to object store
          storedUri = await objectStore.put(diskName, buffer, getMimeType(ext));
          
          // Clean up temp file
          fs.unlinkSync(tempDiskPath);
          tempDiskPath = null;

          const mediaType = ["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO"
            : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO"
            : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT";
          const body = {
            tenantId: req.tenantContext.tenantId,
            fileName: baseName,
            fileFormat: ext,
            fileSizeBytes: buffer.length,
            fileHash,
            storedUri,
            evidenceCode: generateCode("EVID"),
            immutabilityStatus: "LOCKED",
            mediaType,
            uploadedBy,
            batchId: batchId || undefined,
            tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
            sourceType: "SCAN",
            sourceReference: `ZIP:${req.file.originalname}`,
          };
          const parse = insertEvidenceSchema.safeParse(body);
          if (!parse.success) {
            if (storedUri) await objectStore.delete(storedUri).catch(() => {});
            const firstIssue = parse.error.issues?.[0];
            const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "validation failed";
            errors.push(`${baseName}: ${detail}`);
            continue;
          }
          const file = await storage.createEvidenceFile(parse.data);
          if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
          await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "zip_upload", source_zip: req.file.originalname }, tenantId: req.tenantContext.tenantId });
          results.push(file);
        } catch (entryErr: any) {
          if (tempDiskPath && fs.existsSync(tempDiskPath)) fs.unlinkSync(tempDiskPath);
          errors.push(`${path.basename(entry.path)}: ${entryErr?.message ?? "failed"}`);
        }
      }
    } finally {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    }

    res.json({ ingested: results.length, errors: errors.length, files: results, errorDetails: errors });
  });
});

router.post("/evidence", requireRole("ANALYST"), async (req: any, res: any) => {
  const tenantId = req.tenantContext.tenantId;
  const crypto = await import("crypto");
  const body = { ...req.body, tenantId, evidenceCode: generateCode("EVID"), fileHash: generateHash(req.body.fileName ?? "file"), storedUri: `s3://evidence/${tenantId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}/original.${req.body.fileFormat ?? "pdf"}`, immutabilityStatus: "LOCKED" };
  const parse = insertEvidenceSchema.safeParse(body);
  if (!parse.success) return res.status(400).json({ error: parse.error });
  const file = await storage.createEvidenceFile(parse.data);
  await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash }, tenantId: tenantId });
  res.json(file);
});

router.patch("/evidence/:id", requireRole("ANALYST"), async (req: any, res: any) => {
  const f = await storage.updateEvidenceFile(req.params.id, req.body, req.tenantContext);
  if (!f) return res.status(404).json({ error: "Not found" });
  res.json(f);
});

export default router;
