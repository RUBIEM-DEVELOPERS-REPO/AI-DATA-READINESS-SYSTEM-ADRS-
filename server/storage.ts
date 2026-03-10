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
  users, batches, evidenceFiles, extractionRuns, extractionTexts, validationTasks, cdmEntities, publishedDatasets, auditLogs
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getBatches(): Promise<Batch[]>;
  getBatch(id: string): Promise<Batch | undefined>;
  createBatch(batch: InsertBatch): Promise<Batch>;
  updateBatch(id: string, updates: Partial<InsertBatch>): Promise<Batch | undefined>;

  getEvidenceFiles(): Promise<EvidenceFile[]>;
  getEvidenceFile(id: string): Promise<EvidenceFile | undefined>;
  getEvidenceFileByHash(hash: string): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, updates: Partial<InsertEvidenceFile>): Promise<EvidenceFile | undefined>;

  getExtractionRuns(): Promise<ExtractionRun[]>;
  getExtractionRun(id: string): Promise<ExtractionRun | undefined>;
  getExtractionRunByEvidence(evidenceId: string): Promise<ExtractionRun | undefined>;
  createExtractionRun(run: InsertExtractionRun): Promise<ExtractionRun>;
  updateExtractionRun(id: string, updates: Partial<InsertExtractionRun>): Promise<ExtractionRun | undefined>;

  createExtractionText(text: InsertExtractionText): Promise<ExtractionText>;
  getExtractionText(id: string): Promise<ExtractionText | undefined>;
  getExtractionTextByRun(extractionRunId: string): Promise<ExtractionText | undefined>;

  getValidationTasks(): Promise<ValidationTask[]>;
  getValidationTask(id: string): Promise<ValidationTask | undefined>;
  createValidationTask(task: InsertValidationTask): Promise<ValidationTask>;
  updateValidationTask(id: string, updates: Partial<InsertValidationTask>): Promise<ValidationTask | undefined>;

  getCdmEntities(): Promise<CdmEntity[]>;
  getCdmEntity(id: string): Promise<CdmEntity | undefined>;
  createCdmEntity(entity: InsertCdmEntity): Promise<CdmEntity>;
  updateCdmEntity(id: string, updates: Partial<InsertCdmEntity>): Promise<CdmEntity | undefined>;

  getPublishedDatasets(): Promise<PublishedDataset[]>;
  getPublishedDataset(id: string): Promise<PublishedDataset | undefined>;
  createPublishedDataset(dataset: InsertDataset): Promise<PublishedDataset>;
  updatePublishedDataset(id: string, updates: Partial<InsertDataset>): Promise<PublishedDataset | undefined>;

  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  getDashboardStats(): Promise<{
    totalEvidence: number;
    pendingValidation: number;
    publishedDatasets: number;
    cdmEntities: number;
    avgTrustScore: number;
    recentActivity: AuditLog[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getBatches(): Promise<Batch[]> {
    return db.select().from(batches).orderBy(desc(batches.createdAt));
  }
  async getBatch(id: string): Promise<Batch | undefined> {
    const [batch] = await db.select().from(batches).where(eq(batches.id, id));
    return batch;
  }
  async createBatch(batch: InsertBatch): Promise<Batch> {
    const [created] = await db.insert(batches).values(batch).returning();
    return created;
  }
  async updateBatch(id: string, updates: Partial<InsertBatch>): Promise<Batch | undefined> {
    const [updated] = await db.update(batches).set({ ...updates, updatedAt: new Date() }).where(eq(batches.id, id)).returning();
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

  async getEvidenceFiles(): Promise<EvidenceFile[]> {
    return db.select().from(evidenceFiles).orderBy(desc(evidenceFiles.createdAt));
  }
  async getEvidenceFile(id: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.id, id));
    return file;
  }
  async getEvidenceFileByHash(hash: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.fileHash, hash));
    return file;
  }
  async createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile> {
    const [created] = await db.insert(evidenceFiles).values(file).returning();
    return created;
  }
  async updateEvidenceFile(id: string, updates: Partial<InsertEvidenceFile>): Promise<EvidenceFile | undefined> {
    const [updated] = await db.update(evidenceFiles).set({ ...updates, updatedAt: new Date() }).where(eq(evidenceFiles.id, id)).returning();
    return updated;
  }

  async getExtractionRuns(): Promise<ExtractionRun[]> {
    return db.select().from(extractionRuns).orderBy(desc(extractionRuns.createdAt));
  }
  async getExtractionRun(id: string): Promise<ExtractionRun | undefined> {
    const [run] = await db.select().from(extractionRuns).where(eq(extractionRuns.id, id));
    return run;
  }
  async getExtractionRunByEvidence(evidenceId: string): Promise<ExtractionRun | undefined> {
    const [run] = await db.select().from(extractionRuns).where(eq(extractionRuns.evidenceId, evidenceId)).orderBy(desc(extractionRuns.createdAt));
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

  async createExtractionText(text: InsertExtractionText): Promise<ExtractionText> {
    const [created] = await db.insert(extractionTexts).values(text).returning();
    return created;
  }
  async getExtractionText(id: string): Promise<ExtractionText | undefined> {
    const [txt] = await db.select().from(extractionTexts).where(eq(extractionTexts.id, id));
    return txt;
  }
  async getExtractionTextByRun(extractionRunId: string): Promise<ExtractionText | undefined> {
    const [txt] = await db.select().from(extractionTexts).where(eq(extractionTexts.extractionRunId, extractionRunId));
    return txt;
  }

  async getValidationTasks(): Promise<ValidationTask[]> {
    return db.select().from(validationTasks).orderBy(desc(validationTasks.createdAt));
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
    const [updated] = await db.update(validationTasks).set({ ...updates, updatedAt: new Date() }).where(eq(validationTasks.id, id)).returning();
    return updated;
  }

  async getCdmEntities(): Promise<CdmEntity[]> {
    return db.select().from(cdmEntities).orderBy(desc(cdmEntities.createdAt));
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
    const [updated] = await db.update(cdmEntities).set({ ...updates, updatedAt: new Date() }).where(eq(cdmEntities.id, id)).returning();
    return updated;
  }

  async getPublishedDatasets(): Promise<PublishedDataset[]> {
    return db.select().from(publishedDatasets).orderBy(desc(publishedDatasets.createdAt));
  }
  async getPublishedDataset(id: string): Promise<PublishedDataset | undefined> {
    const [dataset] = await db.select().from(publishedDatasets).where(eq(publishedDatasets.id, id));
    return dataset;
  }
  async createPublishedDataset(dataset: InsertDataset): Promise<PublishedDataset> {
    const [created] = await db.insert(publishedDatasets).values(dataset).returning();
    return created;
  }
  async updatePublishedDataset(id: string, updates: Partial<InsertDataset>): Promise<PublishedDataset | undefined> {
    const [updated] = await db.update(publishedDatasets).set({ ...updates, updatedAt: new Date() }).where(eq(publishedDatasets.id, id)).returning();
    return updated;
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getDashboardStats() {
    const [evidenceCount]  = await db.select({ count: sql<number>`count(*)` }).from(evidenceFiles);
    const [pendingCount]   = await db.select({ count: sql<number>`count(*)` }).from(validationTasks).where(eq(validationTasks.status, "PENDING_VALIDATION"));
    const [publishedCount] = await db.select({ count: sql<number>`count(*)` }).from(publishedDatasets).where(eq(publishedDatasets.status, "PUBLISHED"));
    const [cdmCount]       = await db.select({ count: sql<number>`count(*)` }).from(cdmEntities);
    const [avgTrust]       = await db.select({ avg: sql<number>`avg(trust_score)` }).from(extractionRuns);
    const recentActivity   = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10);
    return {
      totalEvidence:     Number(evidenceCount.count),
      pendingValidation: Number(pendingCount.count),
      publishedDatasets: Number(publishedCount.count),
      cdmEntities:       Number(cdmCount.count),
      avgTrustScore:     Number(avgTrust.avg) || 0,
      recentActivity,
    };
  }
}

export const storage = new DatabaseStorage();
