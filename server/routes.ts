import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  insertBatchSchema, insertEvidenceSchema, insertExtractionRunSchema,
  insertValidationTaskSchema, insertCdmEntitySchema, insertDatasetSchema,
  registerSchema, loginSchema
} from "@shared/schema";
import { sendAccessApprovedEmail, sendAccessRejectedEmail, testSmtpConnection, resetEmailTransport } from "./services/email";
import { createHash, randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { passport, hashPassword, requireAuth, requireRole } from "./auth";
import { normalizeExtractedFields, dedupAttributes, runQualityGates, computeTrustScore, type DedupResult } from "./services/normalization";
import { buildArtifactContents, buildArtifactUris, checkPublishTrustThreshold, generateMlCsv, generateBundleZip } from "./services/publishing";
import { inferParties, inferDocument, inferPartiesFromRawEntities } from "./services/party-inference";
import { ADRS_CONFIG } from "./config";
import { uploadMiddleware, computeFileHash, getMimeType, detectCloudSource, downloadFile, UPLOADS_DIR } from "./upload";
import { extractTextFromFile, detectDocType, isTextExtractionFailure } from "./services/extraction";
import { aiExtractDocumentFields, aiTranscribeAudio, aiExtractWithVision, scoreAiExtraction, aiReclassifyDocType, aiClassifyEntityType } from "./services/ai-extraction";
import { groupEntitiesForMerge } from "./services/golden-records";
import unzipper from "unzipper";
import multer from "multer";

function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${prefix}-${year}-${rand}`;
}

function generateHash(input: string): string {
  return "sha256:" + createHash("sha256").update(input + Date.now()).digest("hex");
}

function stripText<T extends { rawText?: string | null }>(run: T): T {
  const { rawText, ...rest } = run as any;
  return rest as T;
}

/**
 * Throws a structured error if the batch cannot accept `slotsNeeded` more files.
 * Returns silently (no-op) when batchId is falsy or expectedDocuments is 0 (unlimited).
 */
async function assertBatchCapacity(batchId: string | undefined | null, slotsNeeded = 1): Promise<void> {
  if (!batchId) return;
  const batch = await storage.getBatch(batchId);
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

// ─── Seed default admin user ────────────────────────────────────────────────
async function seedAdminUser() {
  const existing = await storage.getUserByUsername("admin");
  if (existing) return;
  const hashed = await hashPassword("Admin@12345!");
  await storage.createUser({
    username: "admin",
    email: "admin@aiinstituteafrica.org",
    password: hashed,
    firstName: "System",
    lastName: "Admin",
    role: "SUPER_ADMIN",
    tenantId: "TENANT-001",
    isActive: true,
  });
  console.log("[ADRS] Default admin user created — username: admin, password: Admin@12345!");
}

export async function registerRoutes(httpServer: any, app: Express): Promise<any> {

  await seedAdminUser();

  // ─── Auth routes ────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req: any, res: any, next: any) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: "Invalid input", issues: parse.error.issues });

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message ?? "Invalid credentials" });
      req.logIn(user, (loginErr: any) => {
        if (loginErr) return next(loginErr);
        const { password: _, ...safeUser } = user;
        return res.json({ user: safeUser, message: "Login successful" });
      });
    })(req, res, next);
  });

  app.post("/api/auth/register", async (req: any, res: any) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });

    const { confirmPassword, ...data } = parse.data;

    const [existingUsername, existingEmail] = await Promise.all([
      storage.getUserByUsername(data.username),
      storage.getUserByEmail(data.email),
    ]);
    if (existingUsername) return res.status(409).json({ error: "Username already taken", field: "username" });
    if (existingEmail) return res.status(409).json({ error: "Email already registered", field: "email" });

    const hashed = await hashPassword(data.password);
    const user = await storage.createUser({ ...data, password: hashed, tenantId: "TENANT-001" });

    await storage.createAuditLog({
      action: "USER_REGISTERED",
      resourceType: "USER",
      resourceId: user.id,
      userId: user.id,
      details: { username: user.username, role: user.role },
      tenantId: "TENANT-001",
    });

    const { password: _, ...safeUser } = user;
    return res.status(201).json({ user: safeUser, message: "Account created successfully" });
  });

  app.post("/api/auth/logout", (req: any, res: any, next: any) => {
    req.logout((err: any) => {
      if (err) return next(err);
      req.session.destroy((destroyErr: any) => {
        if (destroyErr) console.error("Session destroy error:", destroyErr);
        res.clearCookie("adrs.sid");
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  app.get("/api/auth/me", (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    res.json({ user: req.user });
  });

  app.get("/api/auth/users", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
    const users = await storage.listUsers();
    res.json(users.map(({ password: _, ...u }) => u));
  });

  // Lightweight user list for operator dropdowns — available to all authenticated users
  app.get("/api/users", requireAuth, async (_req: any, res: any) => {
    const users = await storage.listUsers();
    res.json(
      users
        .filter(u => u.isActive)
        .map(({ password: _, ...u }) => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role }))
    );
  });

  app.patch("/api/auth/users/:id", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    const allowed = ["isActive", "role", "firstName", "lastName"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const user = await storage.updateUser(req.params.id, updates as any);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // ─── Access Requests ────────────────────────────────────────────────────────
  // Public: submit a new access request (no auth required)
  app.post("/api/access-requests", async (req: any, res: any) => {
    const { firstName, lastName, email, organisation, requestedRole, reason } = req.body;
    if (!firstName || !lastName || !email || !organisation || !requestedRole || !reason) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const validRoles = ["SUPER_ADMIN", "ADMIN", "ANALYST", "REVIEWER", "VIEWER"];
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    const accessReq = await storage.createAccessRequest({
      firstName, lastName, email, organisation,
      requestedRole, reason, tenantId: "TENANT-001",
    });
    await storage.createAuditLog({
      action: "ACCESS_REQUEST_SUBMITTED",
      resourceType: "ACCESS_REQUEST",
      resourceId: accessReq.id,
      userId: "anonymous",
      details: { firstName, lastName, email, organisation, requestedRole },
      tenantId: "TENANT-001",
    });
    res.status(201).json({ id: accessReq.id, message: "Access request submitted successfully" });
  });

  // Admin: list all access requests
  app.get("/api/access-requests", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
    const reqs = await storage.getAccessRequests();
    res.json(reqs);
  });

  // Admin: approve an access request
  app.post("/api/access-requests/:id/approve", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    const accessReq = await storage.getAccessRequest(req.params.id);
    if (!accessReq) return res.status(404).json({ error: "Request not found" });
    if (accessReq.status !== "PENDING") return res.status(409).json({ error: "Request already reviewed" });

    const existing = await storage.getUserByEmail(accessReq.email);
    if (existing) return res.status(409).json({ error: "User with this email already exists" });

    // Generate username from name
    const baseUsername = `${accessReq.firstName.toLowerCase().replace(/\s+/g, "")}.${accessReq.lastName.toLowerCase().replace(/\s+/g, "")}`;
    let username = baseUsername;
    let suffix = 1;
    while (await storage.getUserByUsername(username)) {
      username = `${baseUsername}${suffix++}`;
    }

    // Generate a secure temporary password
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    let tempPassword = "";
    const crypto = await import("crypto");
    for (let i = 0; i < 12; i++) {
      tempPassword += chars[crypto.randomInt(0, chars.length)];
    }
    // Ensure it meets password requirements
    tempPassword = `Adrs${tempPassword.slice(4)}!2`;

    const hashed = await hashPassword(tempPassword);
    const user = await storage.createUser({
      username,
      email: accessReq.email,
      password: hashed,
      firstName: accessReq.firstName,
      lastName: accessReq.lastName,
      role: accessReq.requestedRole,
      tenantId: accessReq.tenantId,
      isActive: true,
    });

    await storage.updateAccessRequest(req.params.id, {
      status: "APPROVED",
      reviewedBy: (req.user as any)?.id,
      reviewedAt: new Date(),
      tempPassword,
      createdUserId: user.id,
    });

    await storage.createAuditLog({
      action: "ACCESS_REQUEST_APPROVED",
      resourceType: "ACCESS_REQUEST",
      resourceId: accessReq.id,
      userId: (req.user as any)?.id ?? "system",
      details: { email: accessReq.email, username, role: accessReq.requestedRole, newUserId: user.id },
      tenantId: "TENANT-001",
    });

    const { previewUrl: approvePreviewUrl } = await sendAccessApprovedEmail({
      to: accessReq.email,
      firstName: accessReq.firstName,
      username,
      tempPassword,
      role: accessReq.requestedRole,
    });

    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, username, tempPassword, emailPreviewUrl: approvePreviewUrl ?? null, message: "Request approved and account created" });
  });

  // Admin: reject an access request
  app.post("/api/access-requests/:id/reject", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    const accessReq = await storage.getAccessRequest(req.params.id);
    if (!accessReq) return res.status(404).json({ error: "Request not found" });
    if (accessReq.status !== "PENDING") return res.status(409).json({ error: "Request already reviewed" });

    const { rejectionReason } = req.body;
    await storage.updateAccessRequest(req.params.id, {
      status: "REJECTED",
      rejectionReason: rejectionReason ?? null,
      reviewedBy: (req.user as any)?.id,
      reviewedAt: new Date(),
    });

    await storage.createAuditLog({
      action: "ACCESS_REQUEST_REJECTED",
      resourceType: "ACCESS_REQUEST",
      resourceId: accessReq.id,
      userId: (req.user as any)?.id ?? "system",
      details: { email: accessReq.email, rejectionReason: rejectionReason ?? null },
      tenantId: "TENANT-001",
    });

    const { previewUrl: rejectPreviewUrl } = await sendAccessRejectedEmail({
      to: accessReq.email,
      firstName: accessReq.firstName,
      rejectionReason,
    });

    res.json({ message: "Request rejected", emailPreviewUrl: rejectPreviewUrl ?? null });
  });

  // ─── SMTP / Email Settings ─────────────────────────────────────────────────
  app.get("/api/settings/smtp", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
    try {
      const cfg = await storage.getAllSystemConfig();
      res.json({
        smtpHost: cfg["smtp_host"] ?? "smtp.gmail.com",
        smtpPort: cfg["smtp_port"] ?? "587",
        smtpUser: cfg["smtp_user"] ?? "",
        smtpPassSet: !!(cfg["smtp_pass"]),
        fromEmail: cfg["smtp_from_email"] ?? "",
        fromName: cfg["smtp_from_name"] ?? "ADRS Platform – AI Institute Africa",
        usingEnvVars: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  app.post("/api/settings/smtp", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = req.body;
    const userId = (req.user as any)?.id ?? "system";
    const updates: { key: string; value: string }[] = [
      { key: "smtp_host", value: smtpHost ?? "smtp.gmail.com" },
      { key: "smtp_port", value: smtpPort ?? "587" },
      { key: "smtp_user", value: smtpUser ?? "" },
      { key: "smtp_from_email", value: fromEmail ?? smtpUser ?? "" },
      { key: "smtp_from_name", value: fromName ?? "ADRS Platform – AI Institute Africa" },
    ];
    if (smtpPass) updates.push({ key: "smtp_pass", value: smtpPass });
    for (const u of updates) await storage.setSystemConfig(u.key, u.value, userId);
    resetEmailTransport();
    res.json({ message: "SMTP settings saved" });
  });

  app.post("/api/settings/smtp/test", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
    resetEmailTransport();
    const result = await testSmtpConnection();
    res.json(result);
  });

  // ─── Config endpoint (read-only feature flags) ─────────────────────────────
  app.get("/api/config", requireAuth, (_req: any, res: any) => {
    res.json({ features: ADRS_CONFIG.features, thresholds: { auto_validation_task: ADRS_CONFIG.thresholds.auto_validation_task, publish_trust_block: ADRS_CONFIG.thresholds.publish_trust_block, party_creation_confidence: ADRS_CONFIG.thresholds.party_creation_confidence }, trust_weights: ADRS_CONFIG.trust_weights });
  });

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", requireAuth, async (_req: any, res: any) => {
    try { res.json(await storage.getDashboardStats()); } catch { res.status(500).json({ error: "Failed" }); }
  });

  // ─── Batches ───────────────────────────────────────────────────────────────
  app.get("/api/batches", requireAuth, async (_req: any, res: any) => res.json(await storage.getBatches()));
  app.post("/api/batches", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const parse = insertBatchSchema.safeParse({ ...req.body, batchCode: generateCode("BATCH") });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const batch = await storage.createBatch(parse.data);
    await storage.createAuditLog({ action: "BATCH_CREATED", resourceType: "BATCH", resourceId: batch.id, userId: batch.createdBy, details: { batch_code: batch.batchCode }, tenantId: "TENANT-001" });
    res.json(batch);
  });
  app.patch("/api/batches/:id", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const batch = await storage.updateBatch(req.params.id, req.body);
    if (!batch) return res.status(404).json({ error: "Not found" });
    res.json(batch);
  });

  // ─── Evidence ──────────────────────────────────────────────────────────────
  app.get("/api/evidence", requireAuth, async (_req: any, res: any) => res.json(await storage.getEvidenceFiles()));

  // Serve stored file for download/preview
  app.get("/api/evidence/:id/file", requireAuth, async (req: any, res: any) => {
    try {
      const f = await storage.getEvidenceFile(req.params.id);
      if (!f) return res.status(404).json({ error: "Not found" });
      if (!f.storedUri.startsWith("local://")) return res.status(404).json({ error: "File not stored locally" });
      const filePath = path.join(UPLOADS_DIR, f.storedUri.slice(8));
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing from disk" });
      const ext = path.extname(f.fileName).slice(1).toLowerCase();
      res.setHeader("Content-Type", getMimeType(ext));
      res.setHeader("Content-Disposition", `inline; filename="${f.fileName}"`);
      res.sendFile(filePath);
    } catch { res.status(500).json({ error: "Failed to serve file" }); }
  });

  // Metadata-only ingest (legacy/fallback)
  app.get("/api/evidence/:id", requireAuth, async (req: any, res: any) => {
    const f = await storage.getEvidenceFile(req.params.id);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  // Real file upload via multipart/form-data
  app.post("/api/evidence/upload", requireAuth, requireRole("ANALYST"), (req: any, res: any) => {
    uploadMiddleware(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      try {
        const ext = path.extname(req.file.originalname).slice(1).toLowerCase() || "bin";
        const fileHash = computeFileHash(req.file.path);
        const existingByHash = await storage.getEvidenceFileByHash(fileHash);
        if (existingByHash) {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(409).json({ error: `Duplicate evidence: this file already exists as "${existingByHash.fileName}" (${existingByHash.evidenceCode}).`, duplicate: true, existingFile: { id: existingByHash.id, fileName: existingByHash.fileName, evidenceCode: existingByHash.evidenceCode } });
        }
        const storedUri = `local://${req.file.filename}`;
        const body = {
          ...req.body,
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
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: parse.error });
        }
        await assertBatchCapacity(parse.data.batchId);
        const file = await storage.createEvidenceFile(parse.data);
        if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
        await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "file_upload" }, tenantId: "TENANT-001" });
        res.json(file);
      } catch (e: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const status = (e as any)?.status ?? 500;
        res.status(status).json({ error: e?.message ?? "Upload failed" });
      }
    });
  });

  // Import from URL (Google Drive shared links, Dropbox, OneDrive, HTTP)
  app.post("/api/evidence/import-url", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const { url, uploadedBy, batchId, tags, durationSeconds } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    try {
      await assertBatchCapacity(batchId || undefined);
      const { source, downloadUrl, fileName: detectedName } = detectCloudSource(url);
      const ext = path.extname(detectedName).slice(1).toLowerCase() || "bin";
      const diskName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || "bin"}`;
      const diskPath = path.join(UPLOADS_DIR, diskName);
      await downloadFile(downloadUrl, diskPath);
      const stats = fs.statSync(diskPath);
      const fileHash = computeFileHash(diskPath);
      const existingByHash = await storage.getEvidenceFileByHash(fileHash);
      if (existingByHash) {
        fs.unlinkSync(diskPath);
        return res.status(409).json({ error: `Duplicate evidence: this file already exists as "${existingByHash.fileName}" (${existingByHash.evidenceCode}).`, duplicate: true, existingFile: { id: existingByHash.id, fileName: existingByHash.fileName, evidenceCode: existingByHash.evidenceCode } });
      }
      const mediaType = ["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO"
        : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO"
        : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT";
      const body = {
        fileName: detectedName,
        fileFormat: ext,
        fileSizeBytes: stats.size,
        fileHash,
        storedUri: `local://${diskName}`,
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
        fs.unlinkSync(diskPath);
        return res.status(400).json({ error: parse.error });
      }
      const file = await storage.createEvidenceFile(parse.data);
      if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
      await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "url_import", source_url: url }, tenantId: "TENANT-001" });
      res.json(file);
    } catch (e: any) {
      const status = (e as any)?.status ?? 500;
      res.status(status).json({ error: e?.message ?? "Import failed" });
    }
  });

  // ─── ZIP Batch Upload ──────────────────────────────────────────────────────
  // Accepts a single .zip, extracts all files, ingests each as an evidence item
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

  app.post("/api/evidence/upload-zip", requireAuth, requireRole("ANALYST"), (req: any, res: any) => {
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

        // Check batch capacity for ALL files in the ZIP before extracting any
        try {
          await assertBatchCapacity(batchId || undefined, entries.length);
        } catch (capErr: any) {
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          return res.status(capErr?.status ?? 409).json({ error: capErr.message });
        }

        for (const entry of entries) {
          try {
            const baseName = path.basename(entry.path);
            const ext = path.extname(baseName).slice(1).toLowerCase() || "bin";
            const diskName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const diskPath = path.join(UPLOADS_DIR, diskName);
            const buffer = await entry.buffer();
            fs.writeFileSync(diskPath, buffer);
            const fileHash = computeFileHash(diskPath);
            const existingByHash = await storage.getEvidenceFileByHash(fileHash);
            if (existingByHash) {
              if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
              errors.push(`${baseName}: DUPLICATE — already ingested as "${existingByHash.fileName}" (${existingByHash.evidenceCode})`);
              continue;
            }
            const mediaType = ["mp3","wav","aac","flac","ogg","m4a"].includes(ext) ? "AUDIO"
              : ["mp4","mov","webm","avi","mkv","m4v"].includes(ext) ? "VIDEO"
              : ["png","tiff","jpeg","jpg","bmp","gif"].includes(ext) ? "IMAGE" : "DOCUMENT";
            const body = {
              fileName: baseName,
              fileFormat: ext,
              fileSizeBytes: buffer.length,
              fileHash,
              storedUri: `local://${diskName}`,
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
              const firstIssue = parse.error.issues?.[0];
              const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "validation failed";
              console.error(`[ZIP Upload] Schema error for ${baseName}:`, parse.error.issues);
              errors.push(`${baseName}: ${detail}`);
              continue;
            }
            const file = await storage.createEvidenceFile(parse.data);
            if (file.batchId) await storage.incrementBatchScannedDocuments(file.batchId);
            await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: uploadedBy, details: { file_name: file.fileName, hash: file.fileHash, method: "zip_upload", source_zip: req.file.originalname }, tenantId: "TENANT-001" });
            results.push(file);
          } catch (entryErr: any) {
            errors.push(`${path.basename(entry.path)}: ${entryErr?.message ?? "failed"}`);
          }
        }
      } finally {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      }

      res.json({ ingested: results.length, errors: errors.length, files: results, errorDetails: errors });
    });
  });

  app.post("/api/evidence", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const body = { ...req.body, evidenceCode: generateCode("EVID"), fileHash: generateHash(req.body.fileName ?? "file"), storedUri: `s3://evidence/tenant-001/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${randomUUID()}/original.${req.body.fileFormat ?? "pdf"}`, immutabilityStatus: "LOCKED" };
    const parse = insertEvidenceSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const file = await storage.createEvidenceFile(parse.data);
    await storage.createAuditLog({ action: "EVIDENCE_INGESTED", resourceType: "EVIDENCE", resourceId: file.id, userId: file.uploadedBy, details: { file_name: file.fileName, hash: file.fileHash }, tenantId: "TENANT-001" });
    res.json(file);
  });
  app.patch("/api/evidence/:id", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const f = await storage.updateEvidenceFile(req.params.id, req.body);
    if (!f) return res.status(404).json({ error: "Not found" });
    res.json(f);
  });

  // ─── One-click file extraction ──────────────────────────────────────────────
  app.post("/api/evidence/:id/extract", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const evidenceFile = await storage.getEvidenceFile(req.params.id);
    if (!evidenceFile) return res.status(404).json({ error: "Evidence file not found" });

    try {
      // 1. Update status to PROCESSING
      await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSING" } as any);

      const isAV = ["AUDIO", "VIDEO"].includes(evidenceFile.mediaType ?? "DOCUMENT");
      const startTime = Date.now();

      // 2. Extract raw text (PDF/text) or transcribe audio with AI
      let rawText = "";
      if (isAV) {
        rawText = await aiTranscribeAudio(evidenceFile.storedUri, evidenceFile.fileName);
      } else {
        rawText = await extractTextFromFile(evidenceFile.storedUri, evidenceFile.fileFormat);
      }

      // 3. AI-powered document intelligence: doc type + all fields + entities
      //    If text extraction failed (scanned PDF or image), fall back to GPT-4o Vision
      const VISION_FORMATS = ["pdf", "png", "jpg", "jpeg", "tiff", "tif", "bmp", "gif", "webp"];
      const useVision = !isAV && isTextExtractionFailure(rawText) && VISION_FORMATS.includes(evidenceFile.fileFormat.toLowerCase());
      const aiResult = useVision
        ? await aiExtractWithVision(evidenceFile.storedUri, evidenceFile.fileName, evidenceFile.fileFormat)
        : await aiExtractDocumentFields(rawText, evidenceFile.fileName);
      const docType = aiResult.docType;
      const docTypeConfidence = aiResult.docTypeConfidence;
      const fieldCount = Object.keys(aiResult.fields).length;

      // 4. AI-based scores (deterministic from field coverage)
      const scores = scoreAiExtraction(fieldCount, docType);

      // 5. Convert AI fields to plain string map for normalization pipeline
      const plainFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(aiResult.fields)) {
        if (v?.value != null && String(v.value).trim() !== "") {
          plainFields[k] = String(v.value).trim();
        }
      }

      // 6. Normalize + dedup (existing pipeline, now fed with AI-extracted data)
      const rawAttrs = normalizeExtractedFields(plainFields, aiResult.entities);
      const { deduped: dedupedAttrs, conflictKeys, conflictDetails } = dedupAttributes(rawAttrs);
      const qgResult = runQualityGates(docType, dedupedAttrs, scores.ocrConfidence);
      const trustScore = computeTrustScore(scores.ocrConfidence, scores.extractionConfidence, qgResult.completenessScore, scores.consistencyScore, scores.docQualityScore);

      // 7. Build the extraction run payload
      const runPayload = {
        evidenceId: evidenceFile.id,
        docType,
        docTypeConfidence,
        ocrConfidence: scores.ocrConfidence,
        extractionConfidence: scores.extractionConfidence,
        completenessScore: qgResult.completenessScore,
        consistencyScore: scores.consistencyScore,
        docQualityScore: scores.docQualityScore,
        trustScore,
        trustScoreBreakdown: { ocr: scores.ocrConfidence, extraction: scores.extractionConfidence, completeness: qgResult.completenessScore, consistency: scores.consistencyScore, doc_quality: scores.docQualityScore },
        extractedFields: plainFields,
        extractedEntities: aiResult.entities,
        extractedAttributes: dedupedAttrs,
        qualityGatesPassed: qgResult.passed,
        qualityGatesReport: qgResult,
        rawText: useVision ? `[Vision extraction used — ${aiResult.summary}]` : (rawText || null),
        modelVersion: useVision ? "adrs-vision-v1.0" : "adrs-ai-v2.0",
        processingTimeMs: Date.now() - startTime,
      };

      const parse = insertExtractionRunSchema.safeParse(runPayload);
      if (!parse.success) {
        await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any);
        return res.status(400).json({ error: parse.error });
      }

      const run = await storage.createExtractionRun(parse.data);

      // 8. Store text
      if (rawText) {
        const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
        await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
      }

      // 9. Audit + field events
      await storage.createAuditLog({ action: "EXTRACTION_RUN_CREATED", resourceType: "EXTRACTION", resourceId: run.id, userId: req.body?.operatorId || "system", details: { doc_type: docType, trust_score: trustScore, field_count: fieldCount, method: "auto_extract" }, tenantId: "TENANT-001" });
      for (const attr of dedupedAttrs) {
        await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", confidence: attr.confidence_score }, tenantId: "TENANT-001" });
      }

      // 10. Auto-create validation task — fires on field conflicts OR trust < 70% (one task per run)
      const hasConflicts10 = conflictKeys.length > 0;
      const isLowTrust10   = trustScore < ADRS_CONFIG.thresholds.auto_validation_task;
      if (hasConflicts10 || isLowTrust10) {
        const conflictFieldKeys = conflictKeys.map(k => k.split(":").slice(1).join(":"));
        const pendingFieldKeys  = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
        const allFields = [...new Set([...conflictFieldKeys, ...pendingFieldKeys])];
        const reasons: string[] = [];
        if (hasConflicts10) reasons.push(`${conflictKeys.length} field conflict(s) require resolution`);
        if (isLowTrust10) reasons.push(`trust score ${(trustScore * 100).toFixed(0)}% is below the ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}% threshold`);
        const rule = hasConflicts10 ? "CONFLICT" : "LOW_TRUST";
        await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: allFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: rule, approvalPolicyReason: `Requires human review: ${reasons.join("; ")}.`, weakFields: hasConflicts10 ? conflictKeys : undefined, conflictDetails: hasConflicts10 ? conflictDetails : undefined } as any);
        await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: rule, has_conflicts: hasConflicts10, conflict_count: conflictKeys.length, trust_score: trustScore, threshold: ADRS_CONFIG.thresholds.auto_validation_task }, tenantId: "TENANT-001" });
      }

      // 11. Party inference — field-based + raw-entity-based
      if (ADRS_CONFIG.features.auto_party_creation) {
        const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id);
        const inferredDoc = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id);
        let docEntityCode: string | null = null;
        if (inferredDoc) {
          const docEntity = await storage.createCdmEntity(inferredDoc.entity);
          docEntityCode = docEntity.entityCode;
        }

        // Collect normalised display names from field-based inference to avoid duplicates
        const fieldInferredNames = new Set<string>(
          inferredParties.map(p =>
            p.entity.displayName.toLowerCase().split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ")
          )
        );

        // Promote PERSON + ORGANIZATION entities from the raw AI entity list
        const rawEntityParties = inferPartiesFromRawEntities(aiResult.entities, run.evidenceId, run.id, fieldInferredNames);

        for (const inf of [...inferredParties, ...rawEntityParties]) {
          if (docEntityCode) inf.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: "MENTIONED_IN", confidence: inf.entity.confidenceScore }];
          const party = await storage.createCdmEntity(inf.entity);
          await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: party.entityCode, userId: "system", details: { display_name: party.displayName, entity_type: party.entityType, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
        }
      }

      // 12. Update evidence status to PROCESSED
      await storage.updateEvidenceFile(evidenceFile.id, { status: "PROCESSED" } as any);

      res.json({ run, trustScore, docType, fieldCount });
    } catch (e: any) {
      await storage.updateEvidenceFile(evidenceFile.id, { status: "FAILED" } as any).catch(() => {});
      res.status(500).json({ error: e?.message ?? "Extraction failed" });
    }
  });

  // ─── Extractions (include_text=true strips rawText by default) ─────────────
  app.get("/api/extractions", requireAuth, async (req: any, res: any) => {
    const runs = await storage.getExtractionRuns();
    const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
    res.json(includeText ? runs : runs.map(stripText));
  });

  app.get("/api/extractions/:id", requireAuth, async (req: any, res: any) => {
    const run = await storage.getExtractionRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    const includeText = req.query.include_text === "true" || ADRS_CONFIG.features.include_text_by_default;
    res.json(includeText ? run : stripText(run));
  });

  // Dedicated text endpoint
  app.get("/api/extractions/:id/text", requireAuth, async (req: any, res: any) => {
    const run = await storage.getExtractionRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    if (run.extractionTextId) {
      const txt = await storage.getExtractionText(run.extractionTextId);
      if (txt) return res.json({ extraction_text_id: txt.id, evidence_id: txt.evidenceId, text: txt.text, char_count: txt.charCount, page_number: txt.pageNumber });
    }
    // Fallback: rawText on run
    res.json({ extraction_text_id: null, evidence_id: run.evidenceId, text: run.rawText ?? "", char_count: (run.rawText ?? "").length });
  });

  app.post("/api/extractions", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const { extractedFields = {}, extractedEntities = [], ocrConfidence = 0, docType = "OTHER", rawText = "", ...rest } = req.body;

    // 1. Normalize + dedup
    const rawAttrs = normalizeExtractedFields(extractedFields, extractedEntities);
    const { deduped: dedupedAttrs, conflictKeys, conflictDetails } = dedupAttributes(rawAttrs);
    const qgResult  = runQualityGates(docType, dedupedAttrs, ocrConfidence);
    const { extractionConfidence = 0, consistencyScore = 0, docQualityScore = 0 } = rest;
    const trustScore = computeTrustScore(ocrConfidence, extractionConfidence, qgResult.completenessScore, consistencyScore, docQualityScore);

    const parse = insertExtractionRunSchema.safeParse({
      ...rest, extractedFields, extractedEntities, ocrConfidence, docType, rawText,
      trustScore, trustScoreBreakdown: { ocr: ocrConfidence, extraction: extractionConfidence, completeness: qgResult.completenessScore, consistency: consistencyScore, doc_quality: docQualityScore },
      extractedAttributes: dedupedAttrs, qualityGatesPassed: qgResult.passed, qualityGatesReport: qgResult,
    });
    if (!parse.success) return res.status(400).json({ error: parse.error });

    // 2. Create extraction run
    const run = await storage.createExtractionRun(parse.data);

    // 3. Store text in deduplicated extraction_texts table
    if (rawText) {
      const etxt = await storage.createExtractionText({ evidenceId: run.evidenceId, extractionRunId: run.id, text: rawText, charCount: rawText.length });
      await storage.updateExtractionRun(run.id, { extractionTextId: etxt.id } as any);
    }

    // 4. Field-level audit events (APPROVE_FIELD / REVIEW_FIELD)
    for (const attr of dedupedAttrs) {
      await storage.createAuditLog({ action: attr.validation_state === "AUTO_APPROVED" ? "APPROVE_FIELD" : "REVIEW_FIELD", resourceType: "ATTRIBUTE", resourceId: run.id, userId: "system", details: { field_key: attr.field_key, policy_rule: attr.approval_policy_rule ?? "PASSED", value_normalized: attr.value_normalized, confidence: attr.confidence_score }, tenantId: "TENANT-001" });
    }

    // 5 & 6. Auto-create validation task — fires on conflicts OR trust < 70% (one task per run)
    const hasConflicts56 = conflictKeys.length > 0;
    const isLowTrust56   = trustScore < ADRS_CONFIG.thresholds.auto_validation_task;
    if (hasConflicts56 || isLowTrust56) {
      const conflictFieldKeys = conflictKeys.map(k => k.split(":").slice(1).join(":"));
      const pendingFieldKeys  = dedupedAttrs.filter(a => a.validation_state === "PENDING").map(a => a.field_key);
      const allFields = [...new Set([...conflictFieldKeys, ...pendingFieldKeys])];
      const reasons: string[] = [];
      if (hasConflicts56) reasons.push(`${conflictKeys.length} field conflict(s) require resolution`);
      if (isLowTrust56) reasons.push(`trust score ${(trustScore * 100).toFixed(0)}% is below the ${(ADRS_CONFIG.thresholds.auto_validation_task * 100).toFixed(0)}% threshold`);
      const rule = hasConflicts56 ? "CONFLICT" : "LOW_TRUST";
      await storage.createValidationTask({ taskCode: generateCode("VAL"), extractionRunId: run.id, evidenceId: run.evidenceId, status: "PENDING_VALIDATION", fieldsToValidate: allFields, trustScore, approvalStage: 1, maxApprovalStages: 1, approvalPolicyRule: rule, approvalPolicyReason: `Requires human review: ${reasons.join("; ")}.`, weakFields: hasConflicts56 ? conflictKeys : undefined, conflictDetails: hasConflicts56 ? conflictDetails : undefined } as any);
      await storage.createAuditLog({ action: "VALIDATION_TASK_AUTO_CREATED", resourceType: "VALIDATION", resourceId: run.id, userId: "system", details: { reason: rule, has_conflicts: hasConflicts56, conflict_count: conflictKeys.length, trust_score: trustScore, threshold: ADRS_CONFIG.thresholds.auto_validation_task }, tenantId: "TENANT-001" });
    }

    // 7. Party inference — field-based + raw-entity-based
    if (ADRS_CONFIG.features.auto_party_creation) {
      const inferredParties = inferParties(dedupedAttrs, run.evidenceId, docType, run.id);
      const inferredDoc     = inferDocument(dedupedAttrs, run.evidenceId, docType, run.id);
      let docEntityCode: string | null = null;

      if (inferredDoc) {
        const docEntity = await storage.createCdmEntity(inferredDoc.entity);
        docEntityCode = docEntity.entityCode;
        await storage.createAuditLog({ action: "AUTO_DOC_INFERRED", resourceType: "CDM", resourceId: docEntity.entityCode, userId: "system", details: { display_name: docEntity.displayName, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
      }

      const fieldInferredNames = new Set<string>(
        inferredParties.map(p =>
          p.entity.displayName.toLowerCase().split(/[\s,.\-&/]+/).filter(Boolean).sort().join(" ")
        )
      );
      const rawEntityParties = inferPartiesFromRawEntities(extractedEntities, run.evidenceId, run.id, fieldInferredNames);

      for (const inferred of [...inferredParties, ...rawEntityParties]) {
        if (docEntityCode) {
          inferred.entity.relationships = [{ target_entity_id: docEntityCode, relationship_type: "MENTIONED_IN", confidence: inferred.entity.confidenceScore }];
        }
        const partyEntity = await storage.createCdmEntity(inferred.entity);
        await storage.createAuditLog({ action: "AUTO_PARTY_INFERRED", resourceType: "CDM", resourceId: partyEntity.entityCode, userId: "system", details: { entity_type: partyEntity.entityType, display_name: partyEntity.displayName, identifiers: inferred.identifiers.length, evidence_id: run.evidenceId }, tenantId: "TENANT-001" });
      }
    }

    await storage.createAuditLog({ action: "EXTRACTION_COMPLETED", resourceType: "EXTRACTION", resourceId: run.id, userId: "system", details: { doc_type: run.docType, trust_score: run.trustScore, quality_gates_passed: run.qualityGatesPassed, attrs_total: dedupedAttrs.length, attrs_pending: dedupedAttrs.filter(a => a.validation_state === "PENDING").length }, tenantId: "TENANT-001" });

    res.json(ADRS_CONFIG.features.include_text_by_default ? run : stripText(run));
  });

  // ─── Validation ────────────────────────────────────────────────────────────
  app.get("/api/validation", requireAuth, async (_req: any, res: any) => res.json(await storage.getValidationTasks()));
  app.get("/api/validation/:id", requireAuth, async (req: any, res: any) => {
    const t = await storage.getValidationTask(req.params.id);
    if (!t) return res.status(404).json({ error: "Not found" });
    res.json(t);
  });
  app.post("/api/validation", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const parse = insertValidationTaskSchema.safeParse({ ...req.body, taskCode: generateCode("VAL") });
    if (!parse.success) return res.status(400).json({ error: parse.error });
    res.json(await storage.createValidationTask(parse.data));
  });
  app.patch("/api/validation/:id", requireAuth, requireRole("REVIEWER"), async (req: any, res: any) => {
    const existing = await storage.getValidationTask(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: any = { ...req.body };
    if (req.body.status && req.body.status !== existing.status) updates.validatedAt = new Date();
    const task = await storage.updateValidationTask(req.params.id, updates);
    const action = req.body.status === "APPROVED" ? "VALIDATION_APPROVED" : req.body.status === "REJECTED" ? "VALIDATION_REJECTED" : "VALIDATION_UPDATED";
    await storage.createAuditLog({ action, resourceType: "VALIDATION", resourceId: task?.taskCode, userId: req.body.validator ?? "validator", details: { status: req.body.status, notes: req.body.validatorNotes, policy_rule: existing.approvalPolicyRule }, tenantId: "TENANT-001" });
    res.json(task);
  });

  // ─── Conflict resolution — human picks winning value for each conflicting field ──
  app.post("/api/validation/:id/resolve-conflict", requireAuth, requireRole("REVIEWER"), async (req: any, res: any) => {
    const task = await storage.getValidationTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Validation task not found" });

    const { resolutions, resolved_by } = req.body as {
      resolutions: Array<{ field_key: string; chosen_value: string; source: "option_a" | "option_b" | "custom" }>;
      resolved_by?: string;
    };
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ error: "resolutions array is required" });
    }

    const resolvedBy = resolved_by ?? (req.user as any)?.username ?? "validator";
    const resolvedAt = new Date().toISOString();

    // Fetch linked extraction run
    const run = await storage.getExtractionRun(task.extractionRunId);
    if (!run) return res.status(404).json({ error: "Extraction run not found" });

    // Build mutable copies of run's extractedFields and extractedAttributes
    const updatedFields: Record<string, any>  = { ...(run.extractedFields as Record<string, any> ?? {}) };
    const updatedAttrs: any[] = JSON.parse(JSON.stringify(run.extractedAttributes ?? []));

    const auditEntries: string[] = [];

    for (const resolution of resolutions) {
      const { field_key, chosen_value, source } = resolution;

      // Record old value(s) for audit
      const oldValues = updatedAttrs
        .filter((a: any) => a.field_key === field_key)
        .map((a: any) => ({ value: a.value_normalized, confidence: a.confidence_score, validation_state: a.validation_state }));

      // Apply chosen value to extractedFields
      updatedFields[field_key] = chosen_value;

      // Update extractedAttributes: remove :conflict variant, update winner
      const winnerIdx = updatedAttrs.findIndex((a: any) => a.field_key === field_key && !a.approval_policy_rule?.includes("CONFLICT"));
      const conflictIdx = updatedAttrs.findIndex((a: any) => a.field_key === field_key && a.approval_policy_rule === "CONFLICT");

      if (winnerIdx !== -1) {
        updatedAttrs[winnerIdx].value_normalized = chosen_value;
        updatedAttrs[winnerIdx].validation_state = "HUMAN_APPROVED";
        updatedAttrs[winnerIdx].approval_policy_rule = "HUMAN_RESOLVED";
        updatedAttrs[winnerIdx].approval_policy_reason = `Conflict resolved by ${resolvedBy}: selected "${chosen_value}" (source: ${source}).`;
      }
      // Remove the duplicate conflict variant
      if (conflictIdx !== -1 && conflictIdx !== winnerIdx) {
        updatedAttrs.splice(conflictIdx, 1);
      }

      // Create per-field audit log
      const auditEntry = await storage.createAuditLog({
        action: "CONFLICT_RESOLVED",
        resourceType: "VALIDATION",
        resourceId: task.taskCode,
        userId: resolvedBy,
        details: {
          field_key,
          chosen_value,
          source,
          old_values: oldValues,
          evidence_id: task.evidenceId,
          extraction_run_id: task.extractionRunId,
          resolved_at: resolvedAt,
        },
        tenantId: "TENANT-001",
      });
      auditEntries.push(auditEntry.id);
    }

    // Persist updated extraction run
    await storage.updateExtractionRun(run.id, {
      extractedFields: updatedFields,
      extractedAttributes: updatedAttrs,
    } as any);

    // Update conflict details on the task to mark resolved fields
    const existingDetails = (task.conflictDetails as any[]) ?? [];
    const resolvedFieldKeys = new Set(resolutions.map(r => r.field_key));
    const updatedDetails = existingDetails.map((d: any) => {
      if (!resolvedFieldKeys.has(d.field_key)) return d;
      const res = resolutions.find(r => r.field_key === d.field_key)!;
      return { ...d, resolved: true, resolved_value: res.chosen_value, resolved_source: res.source, resolved_by: resolvedBy, resolved_at: resolvedAt };
    });

    // Check if ALL conflicts are now resolved
    const allResolved = updatedDetails.every((d: any) => d.resolved);
    const taskUpdate: any = { conflictDetails: updatedDetails, updatedAt: new Date() };
    if (allResolved && task.approvalPolicyRule === "CONFLICT") {
      taskUpdate.approvalPolicyReason = `All ${resolutions.length} field conflict(s) resolved by ${resolvedBy}.`;
    }
    await storage.updateValidationTask(task.id, taskUpdate);

    // Audit summary
    await storage.createAuditLog({
      action: "CONFLICTS_RESOLVED_BATCH",
      resourceType: "VALIDATION",
      resourceId: task.taskCode,
      userId: resolvedBy,
      details: { resolved_count: resolutions.length, all_conflicts_cleared: allResolved, audit_entry_ids: auditEntries },
      tenantId: "TENANT-001",
    });

    res.json({ resolved: resolutions.length, all_conflicts_cleared: allResolved, task_id: task.id });
  });

  // ─── CDM ───────────────────────────────────────────────────────────────────
  app.get("/api/cdm", requireAuth, async (_req: any, res: any) => res.json(await storage.getCdmEntities()));
  // Golden-records summary — must be BEFORE /api/cdm/:id to avoid param capture
  app.get("/api/cdm/golden-records", requireAuth, async (_req: any, res: any) => {
    const entities = await storage.getCdmEntities();
    const golden   = entities.filter(e => e.isGoldenRecord);
    const summary  = golden.map(g => ({
      ...g,
      absorbedCount: entities.filter(e => e.goldenRecordId === g.id).length,
      absorbed: entities.filter(e => e.goldenRecordId === g.id).map(e => ({
        id: e.id, displayName: e.displayName, entityCode: e.entityCode, entityType: e.entityType,
      })),
    }));
    res.json(summary);
  });
  app.get("/api/cdm/:id", requireAuth, async (req: any, res: any) => {
    const e = await storage.getCdmEntity(req.params.id);
    if (!e) return res.status(404).json({ error: "Not found" });
    res.json(e);
  });
  app.post("/api/cdm", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const body = { ...req.body, entityCode: req.body.entityCode ?? generateCode(req.body.entityType ?? "ENT") };
    const parse = insertCdmEntitySchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const entity = await storage.createCdmEntity(parse.data);
    await storage.createAuditLog({ action: "ENTITY_CREATED", resourceType: "CDM", resourceId: entity.entityCode, userId: "system", details: { entity_type: entity.entityType, name: entity.displayName }, tenantId: "TENANT-001" });
    res.json(entity);
  });
  app.patch("/api/cdm/:id", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const entity = await storage.updateCdmEntity(req.params.id, req.body);
    if (!entity) return res.status(404).json({ error: "Not found" });
    res.json(entity);
  });

  // ─── CDM: AI-powered reclassification ─────────────────────────────────────
  // Fixes two problems in one pass:
  //   1. PERSON/ORGANIZATION mismatches on existing CDM entities
  //   2. Extraction runs whose doc_type is "OTHER"
  app.post("/api/cdm/reclassify", requireAuth, requireRole("ANALYST"), async (_req: any, res: any) => {
    const results = {
      entitiesScanned: 0,
      entitiesReclassified: 0,
      docTypesScanned: 0,
      docTypesReclassified: 0,
      details: [] as Array<{ id: string; field: string; from: string; to: string }>,
    };

    // ── 1. Fix entity type mismatches (PERSON ↔ ORGANIZATION) ───────────────
    const entities = await storage.getCdmEntities();
    const partyEntities = entities.filter(
      e => e.entityType === "PERSON" || e.entityType === "ORGANIZATION"
    );
    results.entitiesScanned = partyEntities.length;

    for (const entity of partyEntities) {
      const fields = entity.canonicalFields as Record<string, any>;
      const { entityType: aiType, confidence } = await aiClassifyEntityType(
        entity.displayName,
        fields
      );
      if (aiType !== entity.entityType && confidence >= 0.75) {
        await storage.updateCdmEntity(entity.id, { entityType: aiType } as any);
        await storage.createAuditLog({
          action: "ENTITY_RECLASSIFIED",
          resourceType: "CDM",
          resourceId: entity.entityCode,
          userId: "system",
          details: { from: entity.entityType, to: aiType, confidence, display_name: entity.displayName },
          tenantId: "TENANT-001",
        });
        results.entitiesReclassified++;
        results.details.push({ id: entity.id, field: "entityType", from: entity.entityType, to: aiType });
      }
    }

    // ── 2. Fix doc_type = "OTHER" on extraction runs ────────────────────────
    const runs = await storage.getExtractionRuns();
    const otherRuns = runs.filter(r => r.docType === "OTHER");
    results.docTypesScanned = otherRuns.length;

    for (const run of otherRuns) {
      let text = run.rawText ?? "";
      if (!text && run.extractionTextId) {
        const etxt = await storage.getExtractionText(run.extractionTextId);
        if (etxt) text = etxt.text;
      }
      // Use evidence file name as context
      const evid = await storage.getEvidenceFile(run.evidenceId);
      const fileName = evid?.fileName ?? "document";
      const { docType: newType, confidence } = await aiReclassifyDocType(text, fileName);
      if (newType !== "OTHER" && confidence >= 0.65) {
        await storage.updateExtractionRun(run.id, { docType: newType } as any);
        // Also update the DOCUMENT CDM entity linked to this run if present
        const linkedDoc = entities.find(
          e => e.entityType === "DOCUMENT" && e.sourceEvidenceIds?.includes(run.evidenceId)
        );
        if (linkedDoc) {
          const updatedFields = { ...(linkedDoc.canonicalFields as Record<string, any>), doc_type: newType };
          await storage.updateCdmEntity(linkedDoc.id, { canonicalFields: updatedFields } as any);
        }
        await storage.createAuditLog({
          action: "DOC_TYPE_RECLASSIFIED",
          resourceType: "EXTRACTION",
          resourceId: run.id,
          userId: "system",
          details: { from: "OTHER", to: newType, confidence, file_name: fileName },
          tenantId: "TENANT-001",
        });
        results.docTypesReclassified++;
        results.details.push({ id: run.id, field: "docType", from: "OTHER", to: newType });
      }
    }

    res.json(results);
  });

  // ─── CDM: Golden records — deterministic entity resolution ────────────────
  // Groups entities that share name / email / phone and designates the highest-
  // confidence record as the golden record.  Zero hallucination: only existing
  // field values are compared; the AI is not asked to invent anything.
  app.post("/api/cdm/golden-records/compute", requireAuth, requireRole("ANALYST"), async (_req: any, res: any) => {
    const entities = await storage.getCdmEntities();
    const groups   = groupEntitiesForMerge(entities);

    let promoted  = 0;
    let merged    = 0;
    const detail: Array<{ golden: string; absorbed: string[]; reasons: string[] }> = [];

    for (const group of groups) {
      // Promote golden record
      await storage.updateCdmEntity(group.goldenEntityId, {
        isGoldenRecord: true,
        goldenRecordId: null,
      } as any);
      promoted++;

      // Point absorbed entities to the golden record
      for (const absorbedId of group.mergedEntityIds) {
        await storage.updateCdmEntity(absorbedId, {
          isGoldenRecord: false,
          goldenRecordId: group.goldenEntityId,
        } as any);
        merged++;
      }

      await storage.createAuditLog({
        action: "GOLDEN_RECORD_COMPUTED",
        resourceType: "CDM",
        resourceId: group.goldenEntityId,
        userId: "system",
        details: {
          golden_name:    group.goldenDisplayName,
          merged_count:   group.mergedEntityIds.length,
          match_reasons:  group.matchReasons,
          confidence:     group.confidence,
        },
        tenantId: "TENANT-001",
      });

      detail.push({ golden: group.goldenDisplayName, absorbed: group.mergedEntityIds, reasons: group.matchReasons });
    }

    res.json({ goldenGroupsFound: groups.length, entitiesPromoted: promoted, entitiesMerged: merged, detail });
  });

  // ─── Datasets ──────────────────────────────────────────────────────────────
  app.get("/api/datasets", requireAuth, async (_req: any, res: any) => res.json(await storage.getPublishedDatasets()));
  app.get("/api/datasets/:id", requireAuth, async (req: any, res: any) => {
    const d = await storage.getPublishedDataset(req.params.id);
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });

  // ─── Multi-artifact download (CSV for ML, real ZIP for bundle) ─────────────
  app.get("/api/datasets/:code/artifact", requireAuth, async (req: any, res: any) => {
    const datasets = await storage.getPublishedDatasets();
    const dataset  = datasets.find(d => d.datasetCode === req.params.code || d.id === req.params.code);
    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    const contents = dataset.artifactContents as any;
    if (!contents) return res.status(404).json({ error: "Artifacts not generated yet. Publish the dataset first." });
    const { type = "ml" } = req.query as Record<string, string>;

    if (type === "ml") {
      const csv = generateMlCsv(contents.ml_features ?? []);
      res.setHeader("Content-Disposition", `attachment; filename="ml_features_${dataset.datasetCode}_v${dataset.version}.csv"`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    if (type === "bundle") {
      const zip = await generateBundleZip(contents);
      res.setHeader("Content-Disposition", `attachment; filename="bundle_${dataset.datasetCode}_v${dataset.version}.zip"`);
      res.setHeader("Content-Type", "application/zip");
      return res.send(zip);
    }

    const jsonlMap: Record<string, any[]> = {
      kg_graph:       contents.kg_graph ?? [],
      kg_entities:    contents.kg_entities,
      kg_identifiers: contents.kg_identifiers,
      kg_edges:       contents.kg_edges,
      rag_chunks:     contents.rag_chunks,
      dataset_card:   [contents.dataset_card],
    };
    const data = jsonlMap[type];
    if (!data) return res.status(400).json({ error: `Unknown artifact type: ${type}. Valid: ml, kg_graph, kg_entities, kg_identifiers, kg_edges, rag_chunks, bundle` });
    const jsonl = data.map((r: any) => JSON.stringify(r)).join("\n");
    res.setHeader("Content-Disposition", `attachment; filename="${type}_${dataset.datasetCode}_v${dataset.version}.jsonl"`);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.send(jsonl);
  });

  app.post("/api/datasets", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const body = { ...req.body, datasetCode: generateCode("DS"), tenantId: "TENANT-001" };
    const parse = insertDatasetSchema.safeParse(body);
    if (!parse.success) return res.status(400).json({ error: parse.error });
    const dataset = await storage.createPublishedDataset(parse.data);
    await storage.createAuditLog({ action: "DATASET_CREATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: dataset.name, version: dataset.version }, tenantId: "TENANT-001" });
    res.json(dataset);
  });

  // ─── Publish with trust-score blocking + override ─────────────────────────
  app.post("/api/datasets/:id/publish", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    req.body = req.body ?? {};
    const dataset = await storage.getPublishedDataset(req.params.id);
    if (!dataset) return res.status(404).json({ error: "Not found" });

    const allEntities     = await storage.getCdmEntities();
    const allExtractions  = await storage.getExtractionRuns();
    const allEvidenceFiles = await storage.getEvidenceFiles();

    // ─── Batch-scope filtering ──────────────────────────────────────────────
    // SINGLE_BATCH: only include evidence from the selected batch(es)
    // CROSS_BATCH:  include everything (the default, ideal for KG)
    const scope = (dataset as any).scope ?? "CROSS_BATCH";
    const sourceBatchIds: string[] = (dataset as any).sourceBatchIds ?? [];

    const scopedEvidence = scope === "SINGLE_BATCH" && sourceBatchIds.length > 0
      ? allEvidenceFiles.filter(e => e.batchId && sourceBatchIds.includes(e.batchId))
      : allEvidenceFiles;

    const scopedEvidenceIds = new Set(scopedEvidence.map(e => e.id));
    const scopedExtractions = allExtractions.filter(r => scopedEvidenceIds.has(r.evidenceId));
    const scopedEntities    = allEntities.filter(e =>
      (e.sourceEvidenceIds ?? []).some(id => scopedEvidenceIds.has(id))
    );

    const entities     = scopedEntities;
    const extractions  = scopedExtractions;
    const evidenceFiles = scopedEvidence;
    const evidenceMap  = new Map(evidenceFiles.map(e => [e.id, e]));

    // Trust-score blocking check (uses dataset.qualityScore which reflects all evidence linked to this dataset)
    if (ADRS_CONFIG.features.publish_trust_blocking) {
      const datasetTrustScore = dataset.qualityScore;
      const threshold = ADRS_CONFIG.thresholds.publish_trust_block;
      if (datasetTrustScore < threshold) {
        const { override, overrideReason } = req.body;
        if (!override) {
          const blockingReason = `Dataset quality score ${(datasetTrustScore * 100).toFixed(0)}% is below the publishing threshold of ${(threshold * 100).toFixed(0)}%. Improve extraction quality or provide an override reason.`;
          await storage.createAuditLog({ action: "PUBLISH_BLOCKED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { avg_trust_score: datasetTrustScore, threshold, reason: blockingReason }, tenantId: "TENANT-001" });
          return res.status(422).json({ blocked: true, avg_trust_score: datasetTrustScore, threshold, reason: blockingReason });
        }
        // Override granted — audit it
        await storage.createAuditLog({ action: "PUBLISH_OVERRIDE", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { override_reason: overrideReason, avg_trust_score: datasetTrustScore, threshold }, tenantId: "TENANT-001" });
      }
    }

    const artifacts    = buildArtifactContents(dataset, entities, extractions, evidenceMap);
    const artifactUris = buildArtifactUris(dataset.datasetCode, dataset.version);
    const kgNodes      = artifacts.kg_graph.filter((r: any) => r.record_type === "NODE").length;
    const kgEdges      = artifacts.kg_graph.filter((r: any) => r.record_type === "EDGE").length;
    const updated      = await storage.updatePublishedDataset(req.params.id, { status: "PUBLISHED", publishedAt: new Date(), publishedBy: (req.user as any)?.id ?? "system", datasetCard: artifacts.dataset_card, artifactUris, artifactContents: artifacts, formats: ["ML_FEATURES", "KG_GRAPH", "KG_ENTITIES", "KG_EDGES", "KG_IDENTIFIERS", "RAG_CHUNKS"] });

    await storage.createAuditLog({ action: "ARTIFACT_GENERATED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: "system", details: { artifacts: ["ml_features.csv", "kg_graph.jsonl", "kg_entities.jsonl", "kg_identifiers.jsonl", "kg_edges.jsonl", "rag_chunks.jsonl", "bundle.zip"], quality_gates_passed: artifacts.quality_gates.overall_passed }, tenantId: "TENANT-001" });
    await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: dataset.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: dataset.name, version: dataset.version, ml_rows: artifacts.ml_features.length, kg_nodes: kgNodes, kg_edges: kgEdges, rag_chunks: artifacts.rag_chunks.length }, tenantId: "TENANT-001" });

    res.json({ dataset: updated, ml: artifacts.ml_features.length, kg_nodes: kgNodes, kg_edges: kgEdges, kg_entities: artifacts.kg_entities.length, kg_identifiers: artifacts.kg_identifiers.length, rag_chunks: artifacts.rag_chunks.length, quality_gates: artifacts.quality_gates });
  });

  app.patch("/api/datasets/:id", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
    const existing = await storage.getPublishedDataset(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updated = await storage.updatePublishedDataset(req.params.id, req.body);
    if (req.body.status === "PUBLISHED") await storage.createAuditLog({ action: "DATASET_PUBLISHED", resourceType: "DATASET", resourceId: existing.datasetCode, userId: (req.user as any)?.id ?? "system", details: { name: existing.name, version: existing.version }, tenantId: "TENANT-001" });
    res.json(updated);
  });

  // ─── Normalization preview ─────────────────────────────────────────────────
  app.post("/api/normalize/preview", requireAuth, requireRole("ANALYST"), async (req: any, res: any) => {
    const { fields = {}, entities = [] } = req.body;
    const rawAttrs = normalizeExtractedFields(fields, entities);
    const { deduped, conflictKeys } = dedupAttributes(rawAttrs);
    res.json({ attributes: deduped, total: deduped.length, pending: deduped.filter((a: any) => a.validation_state === "PENDING").length, approved: deduped.filter((a: any) => a.validation_state === "AUTO_APPROVED").length, conflicts: conflictKeys });
  });

  // ─── Audit ─────────────────────────────────────────────────────────────────
  app.get("/api/audit", requireAuth, async (_req: any, res: any) => res.json(await storage.getAuditLogs(200)));

  return httpServer;
}
