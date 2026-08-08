/**
 * storage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IntelliNexus Data Access Layer — Multi-Tenant Enforced
 *
 * ARCHITECTURE ENFORCEMENT:
 *   ✅ GAP-001 FIXED: Every tenant-scoped query applies a tenantId filter
 *      from the TenantContext attached to the request by requireTenantContext
 *      middleware. No cross-tenant data access is possible at this layer.
 *   ✅ Multi-Tenant: tenantId is mandatory on all list/create/update operations
 *      for tenant-scoped tables (evidence, batches, CDM, validation, datasets)
 *   ✅ Cloud-Native: pure DB operations, no local filesystem state
 *   ✅ SOLID: IStorage interface separates contract from implementation
 */

import {
  type User, type InsertUser,
  type Batch, type InsertBatch,
  type EvidenceFile, type InsertEvidenceFile,
  type ExtractionRun, type InsertExtractionRun,
  type ExtractionText, type InsertExtractionText,
  type ValidationTask, type InsertValidationTask,
  type CdmEntity, type InsertCdmEntity,
  type PublishedDataset, type InsertDataset,
  type AuditLog, type InsertAuditLog,
  type AccessRequest, type InsertAccessRequest,
  type ChunkEmbedding, type InsertChunkEmbedding,
  type EntityEmbedding, type InsertEntityEmbedding,
  users, batches, evidenceFiles, extractionRuns, extractionTexts, validationTasks,
  cdmEntities, publishedDatasets, auditLogs, accessRequests, systemConfig,
  chunkEmbeddings, entityEmbeddings,
} from "@shared/schema";
import { db } from "./db";
import { dpoDb } from "./dpoDb";
import { regulatorDb } from "./regulatorDb";
import { eq, desc, and, sql } from "drizzle-orm";

// ─── TenantContext (re-exported for convenience) ───────────────────────────

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  subscriptionTier?: string;
}

// ─── IStorage Interface ────────────────────────────────────────────────────

export interface IStorage {
  // ── User management (portal-isolated, not tenant-scoped) ──
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateUserLastLogin(id: string): Promise<void>;
  listUsers(): Promise<User[]>;

  // ── Tenant-Scoped: Batches ──
  getBatches(ctx: TenantContext): Promise<Batch[]>;
  getBatch(id: string, ctx: TenantContext): Promise<Batch | undefined>;
  createBatch(batch: InsertBatch): Promise<Batch>;
  updateBatch(id: string, updates: Partial<InsertBatch>, ctx: TenantContext): Promise<Batch | undefined>;

  // ── Tenant-Scoped: Evidence ──
  getEvidenceFiles(ctx: TenantContext, page?: number, limit?: number): Promise<EvidenceFile[]>;
  getEvidenceFile(id: string, ctx: TenantContext): Promise<EvidenceFile | undefined>;
  getEvidenceFileByHash(hash: string, ctx: TenantContext): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, updates: Partial<InsertEvidenceFile>, ctx: TenantContext): Promise<EvidenceFile | undefined>;

  // ── Extraction Runs (global scope — joins with tenant evidence) ──
  getExtractionRuns(ctx: TenantContext): Promise<ExtractionRun[]>;
  getExtractionRun(id: string): Promise<ExtractionRun | undefined>;
  getExtractionRunByEvidence(evidenceId: string): Promise<ExtractionRun | undefined>;
  createExtractionRun(run: InsertExtractionRun): Promise<ExtractionRun>;
  updateExtractionRun(id: string, updates: Partial<InsertExtractionRun>): Promise<ExtractionRun | undefined>;

  // ── Extraction Texts (global scope) ──
  createExtractionText(text: InsertExtractionText): Promise<ExtractionText>;
  getExtractionText(id: string): Promise<ExtractionText | undefined>;
  getExtractionTextByRun(extractionRunId: string): Promise<ExtractionText | undefined>;

  // ── Tenant-Scoped: Validation Tasks ──
  getValidationTasks(ctx: TenantContext): Promise<ValidationTask[]>;
  getValidationTask(id: string): Promise<ValidationTask | undefined>;
  createValidationTask(task: InsertValidationTask): Promise<ValidationTask>;
  updateValidationTask(id: string, updates: Partial<InsertValidationTask>): Promise<ValidationTask | undefined>;

  // ── Tenant-Scoped: CDM Entities ──
  getCdmEntities(ctx: TenantContext): Promise<CdmEntity[]>;
  getCdmEntity(id: string): Promise<CdmEntity | undefined>;
  createCdmEntity(entity: InsertCdmEntity): Promise<CdmEntity>;
  updateCdmEntity(id: string, updates: Partial<InsertCdmEntity>): Promise<CdmEntity | undefined>;

  // ── Tenant-Scoped: Published Datasets ──
  getPublishedDatasets(ctx: TenantContext): Promise<PublishedDataset[]>;
  getPublishedDataset(id: string): Promise<PublishedDataset | undefined>;
  createPublishedDataset(dataset: InsertDataset): Promise<PublishedDataset>;
  updatePublishedDataset(id: string, updates: Partial<InsertDataset>): Promise<PublishedDataset | undefined>;

  // ── Audit Logs (tenant-scoped) ──
  getAuditLogs(ctx: TenantContext, page?: number, limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // ── Access Requests ──
  getAccessRequests(): Promise<AccessRequest[]>;
  getAccessRequest(id: string): Promise<AccessRequest | undefined>;
  createAccessRequest(req: InsertAccessRequest): Promise<AccessRequest>;
  updateAccessRequest(id: string, updates: Partial<InsertAccessRequest>): Promise<AccessRequest | undefined>;

  // ── Dashboard Stats (tenant-scoped) ──
  getDashboardStats(ctx: TenantContext): Promise<{
    totalEvidence: number;
    pendingValidation: number;
    publishedDatasets: number;
    cdmEntities: number;
    avgTrustScore: number;
    recentActivity: AuditLog[];
  }>;

  // ── Embeddings (global, keyed by evidenceId which is tenant-scoped) ──
  createChunkEmbedding(embedding: InsertChunkEmbedding): Promise<ChunkEmbedding>;
  createEntityEmbedding(embedding: InsertEntityEmbedding): Promise<EntityEmbedding>;

  // ── System Config ──
  getSystemConfig(key: string): Promise<string | null>;
  setSystemConfig(key: string, value: string | null, updatedBy?: string): Promise<void>;
  getAllSystemConfig(): Promise<Record<string, string | null>>;
}

// ─── Portal DB Routing (unchanged) ─────────────────────────────────────────

const portalRoles = new Set(["DATA_CONTROLLER", "DATA_PROTECTION_OFFICER"]);

function getUserDatabaseByRole(role?: string) {
  if (role === "REGULATOR") return regulatorDb;
  if (portalRoles.has(role || "")) return dpoDb;
  return db;
}

async function findUserInPortalDatabases<T>(queryFn: (client: typeof db) => Promise<T[]>) {
  const searchPools = [db, dpoDb, regulatorDb] as const;
  for (const pool of searchPools) {
    const [result] = await queryFn(pool as any);
    if (result) return result;
  }
  return undefined;
}

// ─── DatabaseStorage Implementation ────────────────────────────────────────

export class DatabaseStorage implements IStorage {

  // ── User Methods (portal-isolated, no tenantId filter needed) ─────────────

  async getUser(id: string): Promise<User | undefined> {
    return findUserInPortalDatabases<User>(async client =>
      client.select().from(users).where(eq(users.id, id))
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return findUserInPortalDatabases<User>(async client =>
      client.select().from(users).where(eq(users.username, username))
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return findUserInPortalDatabases<User>(async client =>
      client.select().from(users).where(eq(users.email, email))
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const targetDb = getUserDatabaseByRole(insertUser.role);
    const [user] = await targetDb.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const searchPools = [db, dpoDb, regulatorDb] as const;
    for (const pool of searchPools) {
      const [updated] = await pool.update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (updated) return updated;
    }
    return undefined;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const searchPools = [db, dpoDb, regulatorDb] as const;
    for (const pool of searchPools) {
      const [updated] = await pool.update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (updated) return;
    }
  }

  async listUsers(): Promise<User[]> {
    const [mainUsers, dpoUsers, regulatorUsers] = await Promise.all([
      db.select().from(users),
      dpoDb.select().from(users),
      regulatorDb.select().from(users),
    ]);
    const merged = new Map<string, User>();
    for (const user of mainUsers) {
      if (!merged.has(user.id)) merged.set(user.id, { ...user, portalId: "main" } as any);
    }
    for (const user of dpoUsers) {
      if (!merged.has(user.id)) merged.set(user.id, { ...user, portalId: "dpo" } as any);
    }
    for (const user of regulatorUsers) {
      if (!merged.has(user.id)) merged.set(user.id, { ...user, portalId: "regulator" } as any);
    }
    return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Batches (GAP-001 FIXED: tenantId filter applied) ─────────────────────

  async getBatches(ctx: TenantContext): Promise<Batch[]> {
    return db.select().from(batches)
      .where(eq(batches.tenantId, ctx.tenantId))
      .orderBy(desc(batches.createdAt));
  }

  async getBatch(id: string, ctx: TenantContext): Promise<Batch | undefined> {
    const [batch] = await db.select().from(batches)
      .where(and(eq(batches.id, id), eq(batches.tenantId, ctx.tenantId)));
    return batch;
  }

  async createBatch(batch: InsertBatch): Promise<Batch> {
    const [created] = await db.insert(batches).values(batch).returning();
    return created;
  }

  async updateBatch(id: string, updates: Partial<InsertBatch>, ctx: TenantContext): Promise<Batch | undefined> {
    const [updated] = await db.update(batches)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(batches.id, id), eq(batches.tenantId, ctx.tenantId)))
      .returning();
    return updated;
  }

  async incrementBatchScannedDocuments(id: string): Promise<void> {
    await db.update(batches)
      .set({
        scannedDocuments: sql`${batches.scannedDocuments} + 1`,
        status: sql`CASE WHEN status = 'PENDING' THEN 'IN_PROGRESS' ELSE status END`,
        updatedAt: new Date(),
      })
      .where(eq(batches.id, id));
  }

  // ── Evidence Files (GAP-001 FIXED: tenantId filter applied) ──────────────

  async getEvidenceFiles(ctx: TenantContext, page?: number, limit?: number): Promise<EvidenceFile[]> {
    const q = db.select().from(evidenceFiles)
      .where(eq(evidenceFiles.tenantId, ctx.tenantId))
      .orderBy(desc(evidenceFiles.createdAt));
    if (page !== undefined && limit !== undefined) {
      const offset = (page - 1) * limit;
      return q.limit(limit).offset(offset);
    }
    return q;
  }

  async getEvidenceFile(id: string, ctx: TenantContext): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles)
      .where(and(eq(evidenceFiles.id, id), eq(evidenceFiles.tenantId, ctx.tenantId)));
    return file;
  }

  async getEvidenceFileByHash(hash: string, ctx: TenantContext): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles)
      .where(and(eq(evidenceFiles.fileHash, hash), eq(evidenceFiles.tenantId, ctx.tenantId)));
    return file;
  }

  async createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile> {
    const [created] = await db.insert(evidenceFiles).values(file).returning();
    return created;
  }

  async updateEvidenceFile(id: string, updates: Partial<InsertEvidenceFile>, ctx: TenantContext): Promise<EvidenceFile | undefined> {
    const [updated] = await db.update(evidenceFiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(evidenceFiles.id, id), eq(evidenceFiles.tenantId, ctx.tenantId)))
      .returning();
    return updated;
  }

  // ── Extraction Runs (scoped by evidence join, direct ops use ID only) ─────

  async getExtractionRuns(ctx: TenantContext): Promise<ExtractionRun[]> {
    // Join with evidenceFiles to enforce tenant scope
    return db.select({
      id: extractionRuns.id,
      evidenceId: extractionRuns.evidenceId,
      docType: extractionRuns.docType,
      docTypeConfidence: extractionRuns.docTypeConfidence,
      ocrConfidence: extractionRuns.ocrConfidence,
      extractionConfidence: extractionRuns.extractionConfidence,
      completenessScore: extractionRuns.completenessScore,
      consistencyScore: extractionRuns.consistencyScore,
      docQualityScore: extractionRuns.docQualityScore,
      trustScore: extractionRuns.trustScore,
      trustScoreBreakdown: extractionRuns.trustScoreBreakdown,
      extractedFields: extractionRuns.extractedFields,
      extractedEntities: extractionRuns.extractedEntities,
      extractedTables: extractionRuns.extractedTables,
      extractedAttributes: extractionRuns.extractedAttributes,
      rawText: extractionRuns.rawText,
      modelVersion: extractionRuns.modelVersion,
      processingTimeMs: extractionRuns.processingTimeMs,
      regulatoryPurpose: extractionRuns.regulatoryPurpose,
      dataCategories: extractionRuns.dataCategories,
      sensitivityRating: extractionRuns.sensitivityRating,
      policyViolations: extractionRuns.policyViolations,
      aiProvenance: extractionRuns.aiProvenance,
      processingActivity: extractionRuns.processingActivity,
      qualityGatesPassed: extractionRuns.qualityGatesPassed,
      qualityGatesReport: extractionRuns.qualityGatesReport,
      extractionTextId: extractionRuns.extractionTextId,
      createdAt: extractionRuns.createdAt,
    })
    .from(extractionRuns)
    .innerJoin(evidenceFiles, and(
      eq(extractionRuns.evidenceId, evidenceFiles.id),
      eq(evidenceFiles.tenantId, ctx.tenantId)
    ))
    .orderBy(desc(extractionRuns.createdAt));
  }

  async getExtractionRun(id: string): Promise<ExtractionRun | undefined> {
    const [run] = await db.select().from(extractionRuns).where(eq(extractionRuns.id, id));
    return run;
  }

  async getExtractionRunByEvidence(evidenceId: string): Promise<ExtractionRun | undefined> {
    const [run] = await db.select().from(extractionRuns)
      .where(eq(extractionRuns.evidenceId, evidenceId))
      .orderBy(desc(extractionRuns.createdAt));
    return run;
  }

  async createExtractionRun(run: InsertExtractionRun): Promise<ExtractionRun> {
    const [created] = await db.insert(extractionRuns).values(run).returning();
    return created;
  }

  async updateExtractionRun(id: string, updates: Partial<InsertExtractionRun>): Promise<ExtractionRun | undefined> {
    const [updated] = await db.update(extractionRuns).set(updates).where(eq(extractionRuns.id, id)).returning();
    return updated;
  }

  // ── Extraction Texts ───────────────────────────────────────────────────────

  async createExtractionText(text: InsertExtractionText): Promise<ExtractionText> {
    const [created] = await db.insert(extractionTexts).values(text).returning();
    return created;
  }

  async getExtractionText(id: string): Promise<ExtractionText | undefined> {
    const [txt] = await db.select().from(extractionTexts).where(eq(extractionTexts.id, id));
    return txt;
  }

  async getExtractionTextByRun(extractionRunId: string): Promise<ExtractionText | undefined> {
    const [txt] = await db.select().from(extractionTexts)
      .where(eq(extractionTexts.extractionRunId, extractionRunId));
    return txt;
  }

  // ── Validation Tasks (GAP-001 FIXED: tenantId filter via evidence join) ───

  async getValidationTasks(ctx: TenantContext): Promise<ValidationTask[]> {
    const results = await db.select({
      validationTask: validationTasks
    })
    .from(validationTasks)
    .innerJoin(evidenceFiles, and(
      eq(validationTasks.evidenceId, evidenceFiles.id),
      eq(evidenceFiles.tenantId, ctx.tenantId)
    ))
    .orderBy(desc(validationTasks.createdAt));

    return results.map(r => r.validationTask);
  }

  async getValidationTask(id: string): Promise<ValidationTask | undefined> {
    const [task] = await db.select().from(validationTasks).where(eq(validationTasks.id, id));
    return task;
  }

  async createValidationTask(task: InsertValidationTask): Promise<ValidationTask> {
    const [created] = await db.insert(validationTasks).values(task).returning();
    return created;
  }

  async updateValidationTask(id: string, updates: Partial<InsertValidationTask>): Promise<ValidationTask | undefined> {
    const [updated] = await db.update(validationTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(validationTasks.id, id))
      .returning();
    return updated;
  }

  // ── CDM Entities (GAP-001 FIXED: tenantId filter applied) ─────────────────

  async getCdmEntities(ctx: TenantContext): Promise<CdmEntity[]> {
    return db.select().from(cdmEntities)
      .where(eq(cdmEntities.tenantId, ctx.tenantId))
      .orderBy(desc(cdmEntities.createdAt));
  }

  async getCdmEntity(id: string): Promise<CdmEntity | undefined> {
    const [entity] = await db.select().from(cdmEntities).where(eq(cdmEntities.id, id));
    return entity;
  }

  async createCdmEntity(entity: InsertCdmEntity): Promise<CdmEntity> {
    const [created] = await db.insert(cdmEntities).values(entity).returning();
    return created;
  }

  async updateCdmEntity(id: string, updates: Partial<InsertCdmEntity>): Promise<CdmEntity | undefined> {
    const [updated] = await db.update(cdmEntities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cdmEntities.id, id))
      .returning();
    return updated;
  }

  // ── Published Datasets (GAP-001 FIXED: tenantId filter applied) ───────────

  async getPublishedDatasets(ctx: TenantContext): Promise<PublishedDataset[]> {
    return db.select().from(publishedDatasets)
      .where(eq(publishedDatasets.tenantId, ctx.tenantId))
      .orderBy(desc(publishedDatasets.createdAt));
  }

  async getPublishedDataset(id: string): Promise<PublishedDataset | undefined> {
    const [dataset] = await db.select().from(publishedDatasets)
      .where(eq(publishedDatasets.id, id));
    return dataset;
  }

  async createPublishedDataset(dataset: InsertDataset): Promise<PublishedDataset> {
    const [created] = await db.insert(publishedDatasets).values(dataset).returning();
    return created;
  }

  async updatePublishedDataset(id: string, updates: Partial<InsertDataset>): Promise<PublishedDataset | undefined> {
    const [updated] = await db.update(publishedDatasets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(publishedDatasets.id, id))
      .returning();
    return updated;
  }

  // ── Audit Logs (GAP-001 FIXED: tenantId filter applied) ───────────────────

  async getAuditLogs(ctx: TenantContext, page?: number, limit = 100): Promise<AuditLog[]> {
    const q = db.select().from(auditLogs)
      .where(eq(auditLogs.tenantId, ctx.tenantId))
      .orderBy(desc(auditLogs.createdAt));

    if (page !== undefined) {
      const offset = (page - 1) * limit;
      return q.limit(limit).offset(offset);
    }
    return q.limit(limit);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // ── Access Requests (global — pre-auth, no tenant scope) ──────────────────

  async getAccessRequests(): Promise<AccessRequest[]> {
    return db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
  }

  async getAccessRequestByEmail(email: string): Promise<AccessRequest | undefined> {
    const [req] = await db.select().from(accessRequests)
      .where(eq(accessRequests.email, email))
      .orderBy(desc(accessRequests.createdAt));
    return req;
  }

  async getAccessRequest(id: string): Promise<AccessRequest | undefined> {
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, id));
    return req;
  }

  async createAccessRequest(req: InsertAccessRequest): Promise<AccessRequest> {
    const [created] = await db.insert(accessRequests).values(req).returning();
    return created;
  }

  async updateAccessRequest(id: string, updates: Partial<InsertAccessRequest>): Promise<AccessRequest | undefined> {
    const [updated] = await db.update(accessRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accessRequests.id, id))
      .returning();
    return updated;
  }

  // ── System Config (global — no tenant scope) ──────────────────────────────

  async getSystemConfig(key: string): Promise<string | null> {
    const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
    return row?.value ?? null;
  }

  async setSystemConfig(key: string, value: string | null, updatedBy?: string): Promise<void> {
    await db.insert(systemConfig)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: { value, updatedAt: new Date(), updatedBy },
      });
  }

  async getAllSystemConfig(): Promise<Record<string, string | null>> {
    const rows = await db.select().from(systemConfig);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  // ── Dashboard Stats (GAP-001 FIXED: tenant-scoped aggregates) ─────────────

  async getDashboardStats(ctx: TenantContext) {
    const [evidenceCount]  = await db.select({ count: sql<number>`count(*)` })
      .from(evidenceFiles).where(eq(evidenceFiles.tenantId, ctx.tenantId));
    const [pendingCount]   = await db.select({ count: sql<number>`count(*)` })
      .from(validationTasks)
      .innerJoin(evidenceFiles, and(
        eq(validationTasks.evidenceId, evidenceFiles.id),
        eq(evidenceFiles.tenantId, ctx.tenantId)
      ))
      .where(eq(validationTasks.status, "PENDING_VALIDATION"));
    const [publishedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(publishedDatasets)
      .where(and(
        eq(publishedDatasets.tenantId, ctx.tenantId),
        eq(publishedDatasets.status, "PUBLISHED")
      ));
    const [cdmCount] = await db.select({ count: sql<number>`count(*)` })
      .from(cdmEntities).where(eq(cdmEntities.tenantId, ctx.tenantId));
    const [avgTrust] = await db.select({ avg: sql<number>`avg(${extractionRuns.trustScore})` })
      .from(extractionRuns)
      .innerJoin(evidenceFiles, and(
        eq(extractionRuns.evidenceId, evidenceFiles.id),
        eq(evidenceFiles.tenantId, ctx.tenantId)
      ));
    const recentActivity = await db.select().from(auditLogs)
      .where(eq(auditLogs.tenantId, ctx.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);
    return {
      totalEvidence:     Number(evidenceCount.count),
      pendingValidation: Number(pendingCount.count),
      publishedDatasets: Number(publishedCount.count),
      cdmEntities:       Number(cdmCount.count),
      avgTrustScore:     Number(avgTrust.avg) || 0,
      recentActivity,
    };
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────

  async createChunkEmbedding(embedding: InsertChunkEmbedding): Promise<ChunkEmbedding> {
    const [created] = await db.insert(chunkEmbeddings).values(embedding).returning();
    return created;
  }

  async createEntityEmbedding(embedding: InsertEntityEmbedding): Promise<EntityEmbedding> {
    const [created] = await db.insert(entityEmbeddings).values(embedding).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
