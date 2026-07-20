import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { getConnectorManager } from "../services/connector-manager";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { connectorInstances } from "@shared/schema";
import { storage } from "../storage";
import { testSmtpConnection, resetEmailTransport } from "../services/email";
import { jobQueue } from "../queue";
import { tenantIdFromReq } from "./utils";
import { ADRS_CONFIG } from "../config";
import { requireTenantContext } from "../middleware/tenant-guard";

const router = Router();
const connectorManager = getConnectorManager();

// ─── Connector SDK Integration ───────────────────────────────────────────────
router.get("/connector-definitions", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
  const definitions = connectorManager.getSupportedConnectorDefinitions();
  res.json(definitions);
});

router.get("/connectors", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const instances = await db.select().from(connectorInstances).where(eq(connectorInstances.tenantId, tenantId));
  res.json(instances.map(instance => ({
    id: instance.id,
    name: instance.name,
    status: instance.status,
    connectorDefinitionId: instance.connectorDefinitionId,
    externalSystemId: instance.externalSystemId,
    syncMode: instance.syncMode,
    lastHealthCheck: instance.lastHealthCheck,
    lastSyncStatus: instance.lastSyncStatus,
    updatedAt: instance.updatedAt,
    createdAt: instance.createdAt,
  })));
});

router.post("/connectors", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const { connectorDefinitionId, externalSystemId, config, metadata, credential } = req.body;

  if (!connectorDefinitionId || !externalSystemId || !config || !credential) {
    return res.status(400).json({ error: "connectorDefinitionId, externalSystemId, config, and credential are required" });
  }

  const credentialPayload = {
    id: credential.id || `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: credential.type || "CUSTOM",
    secrets: credential.secrets,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: credential.expiresAt ? new Date(credential.expiresAt) : undefined,
    isActive: true,
    metadata: credential.metadata,
  };

  try {
    const connectorInstanceId = await connectorManager.registerConnector(
      tenantId,
      {
        connectorDefinitionId,
        externalSystemId,
        config,
        credential: credentialPayload,
        metadata,
      },
      (req.user as any)?.id
    );

    const [instance] = await db.select().from(connectorInstances).where(eq(connectorInstances.id, connectorInstanceId));
    res.status(201).json(instance);
  } catch (error: any) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

router.post("/connectors/:id/test", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;

  try {
    const success = await connectorManager.testConnection(tenantId, connectorId, (req.user as any)?.id);
    res.json({ success });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || String(error) });
  }
});

router.get("/connectors/:id/health", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  const health = await connectorManager.healthCheck(tenantId, connectorId);
  res.json(health);
});

router.post("/connectors/:id/pause", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  await connectorManager.pauseConnector(tenantId, connectorId, (req.user as any)?.id);
  res.json({ id: connectorId, status: "PAUSED" });
});

router.post("/connectors/:id/resume", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  await connectorManager.resumeConnector(tenantId, connectorId, (req.user as any)?.id);
  res.json({ id: connectorId, status: "CONNECTED" });
});

router.post("/connectors/:id/revoke", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  await connectorManager.revokeConnector(tenantId, connectorId, (req.user as any)?.id);
  res.json({ id: connectorId, status: "REVOKED" });
});

router.post("/connectors/:id/sync", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  const { operation, full, timeout } = req.body;

  if (!operation || !["discover", "sync", "remediate"].includes(operation)) {
    return res.status(400).json({ error: "operation must be one of discover, sync, remediate" });
  }

  try {
    const jobId = await connectorManager.executeSync(tenantId, connectorId, operation, { full, timeout }, (req.user as any)?.id);
    res.json({ jobId, operation });
  } catch (error: any) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

router.patch("/connectors/:id/credentials", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: "credential is required" });
  }

  const credentialPayload = {
    id: credential.id || `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: credential.type || "CUSTOM",
    secrets: credential.secrets,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: credential.expiresAt ? new Date(credential.expiresAt) : undefined,
    isActive: true,
    metadata: credential.metadata,
  };

  try {
    await connectorManager.rotateCredentials(tenantId, connectorId, credentialPayload, (req.user as any)?.id);
    res.json({ id: connectorId, rotated: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

router.patch("/connectors/:id", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  const updates = req.body;

  try {
    const existing = await db.select().from(connectorInstances).where(
      and(eq(connectorInstances.id, connectorId), eq(connectorInstances.tenantId, tenantId))
    );
    if (!existing.length) {
      return res.status(404).json({ error: "Connector not found" });
    }

    const allowed = ["name", "config", "syncMode", "scanSchedule", "scopeApproved"];
    const patch = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
    await db.update(connectorInstances).set({ ...patch, updatedAt: new Date() }).where(
      and(eq(connectorInstances.id, connectorId), eq(connectorInstances.tenantId, tenantId))
    );

    res.json({ id: connectorId, updated: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

router.get("/connectors/:id", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const tenantId = tenantIdFromReq(req);
  const connectorId = req.params.id;
  const instances = await db.select().from(connectorInstances).where(
    and(eq(connectorInstances.id, connectorId), eq(connectorInstances.tenantId, tenantId))
  );
  if (!instances.length) {
    return res.status(404).json({ error: "Connector not found" });
  }
  res.json(instances[0]);
});

// ─── SMTP settings ───────────────────────────────────────────────────────────
router.get("/settings/smtp", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
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
  } catch { res.status(500).json({ error: "Failed to fetch SMTP settings" }); }
});

router.post("/settings/smtp", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
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

router.post("/settings/smtp/test", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
  resetEmailTransport();
  const result = await testSmtpConnection();
  res.json(result);
});

router.get("/config", requireAuth, (_req: any, res: any) => {
  res.json({ features: ADRS_CONFIG.features, thresholds: { auto_validation_task: ADRS_CONFIG.thresholds.auto_validation_task, publish_trust_block: ADRS_CONFIG.thresholds.publish_trust_block, party_creation_confidence: ADRS_CONFIG.thresholds.party_creation_confidence }, trust_weights: ADRS_CONFIG.trust_weights });
});

router.get("/dashboard/stats", requireAuth, requireTenantContext, async (req: any, res: any) => {
  try { res.json(await storage.getDashboardStats(req.tenantContext)); } catch { res.status(500).json({ error: "Failed to fetch dashboard stats" }); }
});

// ─── Background queue jobs ──────────────────────────────────────────────────
router.post("/queue/jobs", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  try {
    const job = jobQueue.enqueue(
      req.body?.name || "manual-job",
      async () => ({ ok: true, timestamp: new Date().toISOString() }),
      req.body?.payload,
    );
    res.status(202).json({ job });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to queue job" });
  }
});

router.get("/queue/jobs", requireAuth, requireRole("ADMIN"), (_req: any, res: any) => {
  res.json(jobQueue.listJobs());
});

const checkJobStatus = (req: any, res: any) => {
  const job = jobQueue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Background job not found" });
  res.json(job);
};

router.get("/jobs/:id", requireAuth, checkJobStatus);
router.get("/queue/jobs/:id", requireAuth, checkJobStatus);

router.get("/audit", requireAuth, requireTenantContext, async (req: any, res: any) => {
  const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;

  if (page !== undefined && (isNaN(page) || page < 1)) {
    return res.status(400).json({ error: "Invalid page parameter" });
  }
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return res.status(400).json({ error: "Invalid limit parameter" });
  }

  res.json(await storage.getAuditLogs(req.tenantContext, page, limit));
});

export default router;
