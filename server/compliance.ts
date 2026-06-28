import { db } from "./db";
import { kgNodes, kgEdges, auditLogs, processingRecords, publishedDatasets, validationTasks, teeAttestations, zkpProofs, auditLedgerEvents, federatedAuditSessions, evidenceFiles } from "@shared/schema";
import { desc, count, eq, sql } from "drizzle-orm";

// ─── KG sync ─────────────────────────────────────────────────────────────────
export async function syncLiveKnowledgeGraph() {
  try {
    console.log("[COMPLIANCE] syncLiveKnowledgeGraph invoked");
    const n = await db.select().from(kgNodes).limit(1);
    return { ok: true, nodes: n.length };
  } catch (err) {
    console.error("[COMPLIANCE] syncLiveKnowledgeGraph error:", err);
    throw err;
  }
}

// ─── Regulator API: Compliance Status ────────────────────────────────────────
export async function getRegulatorComplianceStatus() {
  const [
    auditCount,
    processingCount,
    datasetCount,
    pendingValidationCount,
    zkpCount,
    teeCount,
    ledgerCount,
    federatedCount,
  ] = await Promise.all([
    db.select({ count: count() }).from(auditLogs),
    db.select({ count: count() }).from(processingRecords),
    db.select({ count: count() }).from(publishedDatasets),
    db.select({ count: count() }).from(validationTasks).where(eq(validationTasks.status, "PENDING_VALIDATION")),
    db.select({ count: count() }).from(zkpProofs),
    db.select({ count: count() }).from(teeAttestations),
    db.select({ count: count() }).from(auditLedgerEvents),
    db.select({ count: count() }).from(federatedAuditSessions),
  ]);

  const allConditionsSatisfied = await db
    .select({ count: count() })
    .from(zkpProofs)
    .where(eq(zkpProofs.complianceAllConditionsSatisfied, true));

  const zkpTotal = zkpCount[0]?.count ?? 0;
  const zkpPassed = allConditionsSatisfied[0]?.count ?? 0;

  return {
    status: pendingValidationCount[0]?.count > 0 ? "NEEDS_ATTENTION" : "OK",
    metrics: {
      auditEvents: auditCount[0]?.count ?? 0,
      activeProcessingRecords: processingCount[0]?.count ?? 0,
      publishedDatasets: datasetCount[0]?.count ?? 0,
      pendingValidations: pendingValidationCount[0]?.count ?? 0,
      zkpProofsTotal: zkpTotal,
      zkpProofsPassed: zkpPassed,
      zkpProofsFailed: zkpTotal - zkpPassed,
      teeAttestations: teeCount[0]?.count ?? 0,
      auditLedgerEvents: ledgerCount[0]?.count ?? 0,
      federatedAuditSessions: federatedCount[0]?.count ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Regulator API: Audit Logs ───────────────────────────────────────────────
export async function getRegulatorAuditLogs() {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
  return rows;
}

// ─── Regulator API: Processing Records ───────────────────────────────────────
export async function getRegulatorProcessingRecords() {
  const rows = await db
    .select()
    .from(processingRecords)
    .orderBy(desc(processingRecords.createdAt));
  return rows;
}

// ─── Regulator API: Activities (Evidence + Extraction summary) ────────────────
export async function getRegulatorActivities() {
  const rows = await db
    .select({
      id: evidenceFiles.id,
      filename: evidenceFiles.fileName,
      docType: evidenceFiles.fileFormat,
      status: evidenceFiles.status,
      mediaType: evidenceFiles.mediaType,
      sensitivityLevel: evidenceFiles.sensitivityLabels,
      tenantId: evidenceFiles.tenantId,
      createdAt: evidenceFiles.createdAt,
    })
    .from(evidenceFiles)
    .orderBy(desc(evidenceFiles.createdAt))
    .limit(200);
  return rows;
}

// ─── Regulator API: ZKP Proofs ───────────────────────────────────────────────
export async function getRegulatorZkpProofs() {
  const rows = await db
    .select()
    .from(zkpProofs)
    .orderBy(desc(zkpProofs.createdAt))
    .limit(100);
  return rows;
}

// ─── Regulator API: TEE Attestations ─────────────────────────────────────────
export async function getRegulatorTeeAttestations() {
  const rows = await db
    .select()
    .from(teeAttestations)
    .orderBy(desc(teeAttestations.createdAt))
    .limit(100);
  return rows;
}

// ─── Regulator API: Audit Ledger Events ──────────────────────────────────────
export async function getRegulatorLedgerEvents() {
  const rows = await db
    .select()
    .from(auditLedgerEvents)
    .orderBy(desc(auditLedgerEvents.createdAt))
    .limit(200);
  return rows;
}

// ─── Regulator API: Federated Audit Sessions ─────────────────────────────────
export async function getRegulatorFederatedSessions() {
  const rows = await db
    .select()
    .from(federatedAuditSessions)
    .orderBy(desc(federatedAuditSessions.createdAt))
    .limit(50);
  return rows;
}
