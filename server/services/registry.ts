import { dpoDb as db } from "../dpoDb";
import {
  dataControllers,
  processingRecords,
  dataBreaches,
  dsrRequests,
  dsrComplaints,
  complianceAudits,
  externalIntegrations,
  externalIntegrationEvents,
  externalSystems,
  dpoAppointments,
  consentRecords,
  patientIdentifiers,
  transferRecords,
  whistleblowerReports,
  enforcementCases,
  appealCases,
  adequacyCountries,
  authorityApprovals,
  insertDataControllerSchema,
  insertProcessingRecordSchema,
  insertDataBreachSchema,
  insertDsrRequestSchema,
  insertDsrComplaintSchema,
  insertComplianceAuditSchema,
  insertExternalIntegrationSchema
  , insertExternalIntegrationEventSchema
} from "@shared/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { db as mainDb } from "../db";
import { getConnectorManager } from "../services/connector-manager";
import { connectorInstances } from "@shared/schema";
import { getVault } from "../connector-vault";

// ─── Data Controllers & Processors ──────────────────────────────────────────
export async function listDataControllers(tenantId: string) {
  return await db
    .select()
    .from(dataControllers)
    .where(eq(dataControllers.tenantId, tenantId))
    .orderBy(dataControllers.createdAt);
}

export async function createDataController(data: any, tenantId: string) {
  const risk = data.riskLevel || "LOW";
  const defaultExpiryDays = risk === "CRITICAL" ? 180 : risk === "HIGH" ? 270 : 365;
  const expiryDate = data.licenceExpiryDate ? new Date(data.licenceExpiryDate) : new Date(Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000);

  const payload = insertDataControllerSchema.parse({
    controllerCode: data.controllerCode || `REG-${Date.now()}`,
    name: data.name,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    organisation: data.organisation,
    address: data.address,
    type: data.type || "CONTROLLER",
    sector: data.sector || "OTHER",
    riskLevel: risk,
    licenceStatus: data.licenceStatus || "ACTIVE",
    licenceExpiryDate: expiryDate,
    metadata: data.metadata || {},
    tenantId,
  });

  const [record] = await db.insert(dataControllers).values(payload).returning();
  return record;
}

export async function renewLicence(id: string, tenantId: string) {
  const [controller] = await db
    .select()
    .from(dataControllers)
    .where(eq(dataControllers.id, id));

  if (!controller) {
    throw Object.assign(new Error("Data Controller/Processor not found."), { status: 404 });
  }

  const newExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 year
  const [updated] = await db
    .update(dataControllers)
    .set({
      licenceStatus: "ACTIVE",
      licenceExpiryDate: newExpiryDate,
      updatedAt: new Date(),
    })
    .where(eq(dataControllers.id, id))
    .returning();

  return updated;
}

// ─── ROPA Management ────────────────────────────────────────────────────────
export async function listProcessingRecords(tenantId: string) {
  return await db
    .select()
    .from(processingRecords)
    .where(eq(processingRecords.tenantId, tenantId))
    .orderBy(processingRecords.createdAt);
}

export async function createProcessingRecord(data: any, tenantId: string) {
  if (!data.controllerId) {
    throw Object.assign(new Error("Controller selection is required."), { status: 400 });
  }

  const controllerExists = await db.select().from(dataControllers).where(eq(dataControllers.id, data.controllerId));
  if (controllerExists.length === 0) {
    throw Object.assign(new Error("Selected data controller does not exist."), { status: 404 });
  }

  // AI Completeness score computation
  const fields = [data.purpose, data.lawfulBasis, data.dataCategories];
  const filledFields = fields.filter(f => {
    if (Array.isArray(f)) return f.length > 0;
    return !!String(f || "").trim();
  }).length;
  const completenessScore = filledFields / fields.length;

  // Lawful basis verification
  const validBases = ["CONSENT", "CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTERESTS", "PUBLIC_TASK", "LEGITIMATE_INTERESTS"];
  const basisStr = String(data.lawfulBasis || "").toUpperCase();
  const lawfulBasisVerified = validBases.some(b => basisStr.includes(b));
  const lawfulBasisVerificationNotes = lawfulBasisVerified 
    ? "Lawful basis verified automatically against Article 6 GDPR / NDPA principles."
    : "Warning: Lawful basis could not be automatically validated. Please verify compliance.";

  // Retention policy & expiry
  const retentionExpiryDate = data.retentionExpiryDate ? new Date(data.retentionExpiryDate) : new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000); // 5 years default

  // Excessive data collection detection (minimisation check)
  const categoriesStr = String(data.dataCategories || "").toUpperCase();
  const hasHighlySensitive = ["BIOMETRIC", "HEALTH", "GENETIC", "PASSWORD", "FINANCIAL", "CREDIT CARD"].some(cat => categoriesStr.includes(cat));
  const excessiveDataDetected = hasHighlySensitive && String(data.purpose || "").length < 25;
  const excessiveDataNotes = excessiveDataDetected
    ? "Alert: Highly sensitive data categories are declared for a short/non-specific processing purpose. Halting auto-approval."
    : "Data minimization checks passed.";

  const payload = insertProcessingRecordSchema.parse({
    recordCode: data.recordCode || `PR-${Date.now()}`,
    controllerId: data.controllerId,
    purpose: data.purpose,
    lawfulBasis: data.lawfulBasis,
    dataCategories: Array.isArray(data.dataCategories) ? data.dataCategories : String(data.dataCategories || "").split(",").map((item: string) => item.trim()).filter(Boolean),
    retentionPolicy: data.retentionPolicy || null,
    thirdParties: data.thirdParties || null,
    processingActivities: data.processingActivities || null,
    status: data.status || "ACTIVE",
    ropaTemplate: data.ropaTemplate || "OTHER",
    completenessScore,
    lawfulBasisVerified,
    lawfulBasisVerificationNotes,
    retentionExpiryDate,
    excessiveDataDetected,
    excessiveDataNotes,
    tenantId,
  });

  const [record] = await db.insert(processingRecords).values(payload).returning();
  return record;
}

// ─── Data Breach Management ─────────────────────────────────────────────────
export async function listDataBreaches(tenantId: string) {
  return await db
    .select()
    .from(dataBreaches)
    .where(eq(dataBreaches.tenantId, tenantId))
    .orderBy(desc(dataBreaches.createdAt));
}

export async function createDataBreach(data: any, tenantId: string) {
  const descLower = String(data.description || "").toLowerCase();
  const titleLower = String(data.title || "").toLowerCase();
  const hasCriticalWords = ["password", "leak", "biometric", "health", "credit card", "financial", "critical"].some(w => descLower.includes(w) || titleLower.includes(w));
  
  const severity = hasCriticalWords ? "CRITICAL" : "MEDIUM";
  // Critical severity needs 24 hour response SLA, medium gets 72 hours
  const slaHours = severity === "CRITICAL" ? 24 : 72;
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  const payload = insertDataBreachSchema.parse({
    breachCode: `BR-${Date.now()}`,
    title: data.title,
    description: data.description,
    incidentDate: new Date(data.incidentDate),
    detectedDate: new Date(data.detectedDate),
    severity,
    status: "REPORTED",
    impactAssessment: data.impactAssessment || "Under AI assessment...",
    rootCause: data.rootCause || "Analyzing server logs...",
    remediationActions: data.remediationActions || "Pending investigation.",
    evidenceFileUrls: data.evidenceFileUrls || [],
    slaDeadline,
    slaStatus: "ON_TRACK",
    tenantId,
  });

  const [record] = await db.insert(dataBreaches).values(payload).returning();
  return record;
}

export async function updateDataBreach(id: string, data: any, tenantId: string) {
  const [updated] = await db
    .update(dataBreaches)
    .set({
      status: data.status,
      impactAssessment: data.impactAssessment,
      rootCause: data.rootCause,
      remediationActions: data.remediationActions,
      slaStatus: data.slaStatus,
      updatedAt: new Date(),
    })
    .where(eq(dataBreaches.id, id))
    .returning();
  return updated;
}

// ─── Data Subject Rights ────────────────────────────────────────────────────
export async function listDsrRequests(tenantId: string) {
  return await db
    .select()
    .from(dsrRequests)
    .where(eq(dsrRequests.tenantId, tenantId))
    .orderBy(desc(dsrRequests.createdAt));
}

export async function createDsrRequest(data: any, tenantId: string) {
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

  const payload = insertDsrRequestSchema.parse({
    requestCode: `DSR-${Date.now()}`,
    subjectName: data.subjectName,
    subjectEmail: data.subjectEmail,
    requestType: data.requestType || "ACCESS",
    details: data.details,
    status: "RECEIVED",
    deadline,
    complaintsCount: 0,
    tenantId,
  });

  const [record] = await db.insert(dsrRequests).values(payload).returning();
  return record;
}

export async function updateDsrRequest(id: string, data: any, tenantId: string) {
  const updates: any = {
    status: data.status,
    rejectionReason: data.rejectionReason,
    escalationNotes: data.escalationNotes,
    updatedAt: new Date(),
  };
  if (data.status === "COMPLETED" || data.status === "REJECTED") {
    updates.responseSentAt = new Date();
  }
  const [updated] = await db
    .update(dsrRequests)
    .set(updates)
    .where(eq(dsrRequests.id, id))
    .returning();
  return updated;
}

export async function listDsrComplaints(tenantId: string) {
  return await db
    .select()
    .from(dsrComplaints)
    .where(eq(dsrComplaints.tenantId, tenantId))
    .orderBy(desc(dsrComplaints.createdAt));
}

export async function createDsrComplaint(data: any, tenantId: string) {
  const payload = insertDsrComplaintSchema.parse({
    complaintCode: `CMP-${Date.now()}`,
    requestId: data.requestId || null,
    complainantName: data.complainantName,
    complainantEmail: data.complainantEmail,
    details: data.details,
    status: "OPEN",
    tenantId,
  });

  const [complaint] = await db.insert(dsrComplaints).values(payload).returning();

  // If linked to a DSR request, increment the complaint count
  if (data.requestId) {
    const [request] = await db.select().from(dsrRequests).where(eq(dsrRequests.id, data.requestId));
    if (request) {
      await db
        .update(dsrRequests)
        .set({ complaintsCount: (request.complaintsCount || 0) + 1 })
        .where(eq(dsrRequests.id, data.requestId));
    }
  }

  return complaint;
}

// ─── Compliance Audits & Enforcement ─────────────────────────────────────────
export async function listComplianceAudits(tenantId: string) {
  return await db
    .select()
    .from(complianceAudits)
    .where(eq(complianceAudits.tenantId, tenantId))
    .orderBy(desc(complianceAudits.scheduledDate));
}

export async function createComplianceAudit(data: any, tenantId: string) {
  const payload = insertComplianceAuditSchema.parse({
    auditCode: `AUD-${Date.now()}`,
    title: data.title,
    description: data.description,
    targetControllerId: data.targetControllerId || null,
    scheduledDate: new Date(data.scheduledDate),
    inspectionStatus: "SCHEDULED",
    findings: data.findings || "",
    score: data.score ? parseFloat(data.score) : null,
    enforcementStatus: data.enforcementStatus || "NONE",
    fineAmount: data.fineAmount ? parseFloat(data.fineAmount) : null,
    correctiveActions: data.correctiveActions || "",
    evidenceRepositoryUrls: data.evidenceRepositoryUrls || [],
    tenantId,
  });

  const [record] = await db.insert(complianceAudits).values(payload).returning();
  return record;
}

export async function updateComplianceAudit(id: string, data: any, tenantId: string) {
  const updates: any = {
    inspectionStatus: data.inspectionStatus,
    findings: data.findings,
    score: data.score ? parseFloat(data.score) : null,
    enforcementStatus: data.enforcementStatus,
    fineAmount: data.fineAmount ? parseFloat(data.fineAmount) : null,
    correctiveActions: data.correctiveActions,
    evidenceRepositoryUrls: data.evidenceRepositoryUrls || [],
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(complianceAudits)
    .set(updates)
    .where(eq(complianceAudits.id, id))
    .returning();
  return updated;
}

// ─── External Integrations Feeds ────────────────────────────────────────────
export async function listExternalIntegrations(tenantId: string) {
  // Ensure default rows exist for government & cybersecurity if none are present
  const existing = await db.select().from(externalIntegrations).where(eq(externalIntegrations.tenantId, tenantId));
  
  if (existing.length === 0) {
    const gov = await db.insert(externalIntegrations).values({
      systemName: "GOV_REGULATOR",
      displayName: "Government Regulator Portal",
      integrationType: "GOVERNMENT",
      connectorType: "API",
      status: "DISCONNECTED",
      enabled: true,
      healthStatus: "UNKNOWN",
      config: {},
      metadata: {},
      tenantId,
    }).returning();
    const cert = await db.insert(externalIntegrations).values({
      systemName: "CERT_CYBERSECURITY",
      displayName: "Cybersecurity Threat Feed",
      integrationType: "CYBERSECURITY",
      connectorType: "API",
      status: "DISCONNECTED",
      enabled: true,
      healthStatus: "UNKNOWN",
      config: {},
      metadata: {},
      tenantId,
    }).returning();
    return [...gov, ...cert];
  }

  return existing;
}

export async function getExternalIntegration(id: string, tenantId: string) {
  const [integration] = await db
    .select()
    .from(externalIntegrations)
    .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)));

  if (!integration) {
    throw Object.assign(new Error("Integration not found."), { status: 404 });
  }

  return integration;
}

export async function createExternalIntegration(data: any, tenantId: string, createdBy: string) {
  const metadata = {
    ...(data.metadata || {}),
    portalVisible: data.metadata?.portalVisible ?? true,
    createdFromPortal: Boolean(data.metadata?.createdFromPortal),
  };

  const payload = insertExternalIntegrationSchema.parse({
    systemName: data.systemName,
    displayName: data.displayName || data.systemName,
    integrationType: data.integrationType || "GENERIC",
    connectorType: data.connectorType || "API",
    status: data.status || "DISCONNECTED",
    enabled: data.enabled ?? true,
    healthStatus: data.healthStatus || "UNKNOWN",
    config: data.config || {},
    metadata,
    createdBy,
    tenantId,
  });

  const [record] = await db.insert(externalIntegrations).values(payload).returning();
  return record;
}

export async function updateExternalIntegration(id: string, data: any, tenantId: string) {
  const [existing] = await db
    .select()
    .from(externalIntegrations)
    .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)));

  if (!existing) {
    throw Object.assign(new Error("Integration settings not found."), { status: 404 });
  }

  const existingMetadata = (existing.metadata as Record<string, any> | null) || {};
  const updates: any = {
    displayName: data.displayName ?? existing.displayName,
    integrationType: data.integrationType ?? existing.integrationType,
    connectorType: data.connectorType ?? existing.connectorType,
    config: data.config ?? existing.config,
    metadata: {
      ...existingMetadata,
      ...(data.metadata || {}),
      portalVisible: data.metadata?.portalVisible ?? existingMetadata.portalVisible ?? true,
    },
    enabled: data.enabled ?? existing.enabled,
    healthStatus: data.healthStatus ?? existing.healthStatus,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(externalIntegrations)
    .set(updates)
    .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function deleteExternalIntegration(id: string, tenantId: string, actorId?: string) {
  const [integration] = await db
    .select()
    .from(externalIntegrations)
    .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)));

  if (!integration) {
    throw Object.assign(new Error("Integration not found."), { status: 404 });
  }

  const connectorManager = getConnectorManager();
  const vault = getVault();

  // Find candidate connector instances mapped to this integration
  let candidates: any[] = [];
  const meta = (integration.metadata || {}) as any;

  if (meta?.connectorInstanceId) {
    const [inst] = await mainDb
      .select()
      .from(connectorInstances)
      .where(and(eq(connectorInstances.id, meta.connectorInstanceId), eq(connectorInstances.tenantId, tenantId)));
    if (inst) candidates.push(inst);
  } else if (meta?.externalSystemId) {
    const insts = await mainDb
      .select()
      .from(connectorInstances)
      .where(and(eq(connectorInstances.externalSystemId, meta.externalSystemId), eq(connectorInstances.tenantId, tenantId)));
    if (insts && insts.length) candidates.push(...insts);
  } else {
    const nameConditions: any[] = [];
    if (integration.systemName) nameConditions.push(eq(externalSystems.name, integration.systemName));
    if (integration.displayName) nameConditions.push(eq(externalSystems.name, integration.displayName));

    if (nameConditions.length) {
      const whereCond = and(eq(externalSystems.tenantId, tenantId), nameConditions.length === 1 ? nameConditions[0] : or(...nameConditions));
      const [extSys] = await mainDb.select().from(externalSystems).where(whereCond);
      if (extSys) {
        const insts = await mainDb
          .select()
          .from(connectorInstances)
          .where(and(eq(connectorInstances.externalSystemId, extSys.id), eq(connectorInstances.tenantId, tenantId)));
        if (insts && insts.length) candidates.push(...insts);
      }
    }

    if (!candidates.length) {
      const instNameConditions: any[] = [];
      if (integration.displayName) instNameConditions.push(eq(connectorInstances.name, integration.displayName));
      if (integration.systemName) instNameConditions.push(eq(connectorInstances.name, integration.systemName));

      if (instNameConditions.length) {
        const insts2 = await mainDb
          .select()
          .from(connectorInstances)
          .where(and(eq(connectorInstances.tenantId, tenantId), instNameConditions.length === 1 ? instNameConditions[0] : or(...instNameConditions)));
        if (insts2 && insts2.length) candidates.push(...insts2);
      }
    }
  }

  // Revoke and remove connector instances and credentials
  for (const instance of candidates) {
    try {
      // Revoke via manager to perform audit and state changes
      await connectorManager.revokeConnector(tenantId, instance.id, actorId);
    } catch (err) {
      // non-fatal: continue with deletion attempt
      console.warn(`Failed to revoke connector ${instance.id}:`, err);
    }

    try {
      // Delete stored credential from vault
      await vault.deleteCredential(tenantId, instance.id);
    } catch (err) {
      console.warn(`Failed to delete vault credential for ${instance.id}:`, err);
    }

    try {
      await mainDb.delete(connectorInstances).where(and(eq(connectorInstances.id, instance.id), eq(connectorInstances.tenantId, tenantId)));
    } catch (err) {
      console.warn(`Failed to remove connector instance ${instance.id} from DB:`, err);
    }
  }

  // Remove the external integration record
  await db.delete(externalIntegrations).where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)));

  await logExternalIntegrationEvent(id, "INTEGRATION_DELETED", "INFO", `External integration deleted by ${actorId || 'system'}`, { actor: actorId }, tenantId);

  return { ok: true };
}

export async function logExternalIntegrationEvent(
  integrationId: string,
  eventType: string,
  severity: string,
  message: string,
  metadata: any,
  tenantId: string
) {
  const payload = insertExternalIntegrationEventSchema.parse({
    integrationId,
    eventType,
    severity,
    message,
    metadata: metadata || {},
    tenantId,
  });

  const [event] = await db.insert(externalIntegrationEvents).values(payload).returning();
  return event;
}

export async function listExternalIntegrationEvents(integrationId: string, tenantId: string) {
  return await db
    .select()
    .from(externalIntegrationEvents)
    .where(and(eq(externalIntegrationEvents.integrationId, integrationId), eq(externalIntegrationEvents.tenantId, tenantId)))
    .orderBy(desc(externalIntegrationEvents.createdAt));
}

export async function syncExternalIntegration(id: string, tenantId: string) {
  const [integration] = await db
    .select()
    .from(externalIntegrations)
    .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)));
  if (!integration) {
    throw Object.assign(new Error("Integration settings not found."), { status: 404 });
  }

  await logExternalIntegrationEvent(id, "SYNC_START", "INFO", "Starting external integration synchronization.", {
    connectorType: integration.connectorType,
    integrationType: integration.integrationType,
    config: integration.config,
  }, tenantId);

  try {
    const connectorManager = getConnectorManager();
    const actorId = integration.createdBy || "SYSTEM";

    let candidates: any[] = [];
    const meta = (integration.metadata || {}) as any;

    if (meta?.connectorInstanceId) {
      const [inst] = await mainDb
        .select()
        .from(connectorInstances)
        .where(and(eq(connectorInstances.id, meta.connectorInstanceId), eq(connectorInstances.tenantId, tenantId)));
      if (inst) candidates.push(inst);
    } else if (meta?.externalSystemId) {
      const insts = await mainDb
        .select()
        .from(connectorInstances)
        .where(and(eq(connectorInstances.externalSystemId, meta.externalSystemId), eq(connectorInstances.tenantId, tenantId)));
      if (insts && insts.length) candidates.push(...insts);
    } else {
      const nameConditions: any[] = [];
      if (integration.systemName) nameConditions.push(eq(externalSystems.name, integration.systemName));
      if (integration.displayName) nameConditions.push(eq(externalSystems.name, integration.displayName));

      if (nameConditions.length) {
        const whereCond = and(eq(externalSystems.tenantId, tenantId), nameConditions.length === 1 ? nameConditions[0] : or(...nameConditions));
        const [extSys] = await mainDb.select().from(externalSystems).where(whereCond);
        if (extSys) {
          const insts = await mainDb
            .select()
            .from(connectorInstances)
            .where(and(eq(connectorInstances.externalSystemId, extSys.id), eq(connectorInstances.tenantId, tenantId)));
          if (insts && insts.length) candidates.push(...insts);
        }
      }

      if (!candidates.length) {
        const instNameConditions: any[] = [];
        if (integration.displayName) instNameConditions.push(eq(connectorInstances.name, integration.displayName));
        if (integration.systemName) instNameConditions.push(eq(connectorInstances.name, integration.systemName));

        if (instNameConditions.length) {
          const insts2 = await mainDb
            .select()
            .from(connectorInstances)
            .where(and(eq(connectorInstances.tenantId, tenantId), instNameConditions.length === 1 ? instNameConditions[0] : or(...instNameConditions)));
          if (insts2 && insts2.length) candidates.push(...insts2);
        }
      }
    }

    if (!candidates.length) {
      const [updated] = await db
        .update(externalIntegrations)
        .set({
          status: "DISCONNECTED",
          healthStatus: "FAILED",
          lastSyncAt: new Date(),
          syncLog: "No matching connector instance found for this external integration.",
          lastError: "Connector mapping not found.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)))
        .returning();

      await logExternalIntegrationEvent(id, "SYNC_FAILURE", "WARN", "No connector instance mapped to this external integration.", {
        connectorType: integration.connectorType,
        integrationType: integration.integrationType,
      }, tenantId);

      return updated;
    }

    const bridgeLogs: string[] = [];
    let successCount = 0;
    let failureCount = 0;
    let lastError: string | null = null;

    for (const instance of candidates) {
      try {
        const jobId = await connectorManager.executeSync(tenantId, instance.id, "sync", { full: true }, actorId);
        bridgeLogs.push(`Connector sync triggered for instance ${instance.id} with job ${jobId}`);
        await logExternalIntegrationEvent(id, "BRIDGE_SYNC", "INFO", `Triggered connector-manager sync for connector ${instance.id}`,
          { connectorInstanceId: instance.id, jobId }, tenantId);
        successCount += 1;
      } catch (err: any) {
        const message = err?.message || String(err);
        bridgeLogs.push(`Connector sync failed for instance ${instance.id}: ${message}`);
        await logExternalIntegrationEvent(id, "BRIDGE_SYNC_FAILED", "WARN", `Connector-manager sync failed for ${instance.id}: ${message}`,
          { connectorInstanceId: instance.id, error: message }, tenantId);
        failureCount += 1;
        lastError = message;
      }
    }

    const status = failureCount === 0 ? "CONNECTED" : successCount > 0 ? "DEGRADED" : "ERROR";
    const healthStatus = failureCount === 0 ? "HEALTHY" : successCount > 0 ? "DEGRADED" : "FAILED";
    const syncLog = bridgeLogs.join("\n");

    const [updated] = await db
      .update(externalIntegrations)
      .set({
        status,
        healthStatus,
        lastSyncAt: new Date(),
        syncLog,
        lastError,
        updatedAt: new Date(),
      })
      .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.tenantId, tenantId)))
      .returning();

    await logExternalIntegrationEvent(id, failureCount === 0 ? "SYNC_SUCCESS" : "SYNC_PARTIAL", failureCount === 0 ? "INFO" : "WARN",
      `External integration synchronization completed with ${successCount} successes and ${failureCount} failures.`, {
        connectorType: integration.connectorType,
        status: updated.status,
        successCount,
        failureCount,
      }, tenantId);

    return updated;
  } catch (error: any) {
    const message = error?.message || "Unknown sync failure.";
    await logExternalIntegrationEvent(id, "SYNC_FAILURE", "ERROR", `External integration synchronization failed: ${message}`,
      { connectorType: integration.connectorType, error: message }, tenantId);
    throw error;
  }
}

// ─── DPO Appointments ────────────────────────────────────────────────────────
export async function listDpoAppointments(tenantId: string) {
  return await db
    .select()
    .from(dpoAppointments)
    .where(eq(dpoAppointments.tenantId, tenantId))
    .orderBy(desc(dpoAppointments.appointedAt));
}

export async function createDpoAppointment(data: any, tenantId: string) {
  const [record] = await db.insert(dpoAppointments).values({
    orgId: data.orgId,
    name: data.name,
    email: data.email,
    status: "PENDING",
    isZimbabweEstablished: data.isZimbabweEstablished !== false,
    localRepName: data.localRepName || null,
    localRepEmail: data.localRepEmail || null,
    tenantId,
  }).returning();
  return record;
}

export async function notifyDpoToAuthority(id: string) {
  const [updated] = await db
    .update(dpoAppointments)
    .set({ status: "NOTIFIED", notifiedToAuthorityAt: new Date() })
    .where(eq(dpoAppointments.id, id))
    .returning();
  return updated;
}

export async function revokeDpoAppointment(id: string) {
  const [updated] = await db
    .update(dpoAppointments)
    .set({ status: "REVOKED" })
    .where(eq(dpoAppointments.id, id))
    .returning();
  return updated;
}

// ─── Consent Records ─────────────────────────────────────────────────────────
export async function listConsentRecords(tenantId: string) {
  return await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.tenantId, tenantId))
    .orderBy(desc(consentRecords.givenAt));
}

export async function createConsentRecord(data: any, tenantId: string) {
  const [record] = await db.insert(consentRecords).values({
    orgId: data.orgId,
    dataSubjectName: data.dataSubjectName,
    dataSubjectEmail: data.dataSubjectEmail,
    sensitivityTier: data.sensitivityTier,
    method: data.method,
    legalBasisCode: data.legalBasisCode,
    justification: data.justification || null,
    evidenceUri: data.evidenceUri || null,
    tenantId,
  }).returning();
  return record;
}

export async function withdrawConsent(id: string) {
  const [updated] = await db
    .update(consentRecords)
    .set({ withdrawnAt: new Date() })
    .where(eq(consentRecords.id, id))
    .returning();
  return updated;
}

// ─── Patient Identifiers ─────────────────────────────────────────────────────
export async function listPatientIdentifiers(tenantId: string) {
  return await db
    .select()
    .from(patientIdentifiers)
    .where(eq(patientIdentifiers.tenantId, tenantId))
    .orderBy(desc(patientIdentifiers.createdAt));
}

export async function generatePatientIdentifier(data: any, tenantId: string) {
  const prefix = "PID";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  const identifierValue = `${prefix}-${timestamp}-${random}`;

  const [record] = await db.insert(patientIdentifiers).values({
    orgId: data.orgId,
    dataSubjectName: data.dataSubjectName,
    dataSubjectEmail: data.dataSubjectEmail,
    identifierValue,
    healthProfessionalCustodian: data.healthProfessionalCustodian,
    authorityApprovalId: data.authorityApprovalId || null,
    linkedIds: data.linkedIds || [],
    tenantId,
  }).returning();
  return record;
}

// ─── Transfer Records (TIAs) ─────────────────────────────────────────────────
export async function listTransferRecords(tenantId: string) {
  return await db
    .select()
    .from(transferRecords)
    .where(eq(transferRecords.tenantId, tenantId))
    .orderBy(desc(transferRecords.createdAt));
}

export async function createTransferRecord(data: any, tenantId: string) {
  const [country] = await db
    .select()
    .from(adequacyCountries)
    .where(eq(adequacyCountries.countryName, data.destinationCountry));

  const adequacyStatus = country?.isAdequate ? "ADEQUATE" : "NOT_ADEQUATE";

  const [record] = await db.insert(transferRecords).values({
    orgId: data.orgId,
    destinationCountry: data.destinationCountry,
    adequacyStatus,
    derogationCode: data.derogationCode || null,
    justification: data.justification || null,
    tenantId,
  }).returning();

  if (adequacyStatus === "NOT_ADEQUATE" && !data.derogationCode) {
    await db.insert(authorityApprovals).values({
      subjectType: "TIA_EXCEPTION",
      subjectId: record.id,
      decision: "PENDING",
      tenantId,
    });
  }

  return { ...record, adequacyStatus, approvalRequired: adequacyStatus === "NOT_ADEQUATE" && !data.derogationCode };
}

// ─── Whistleblower Reports ───────────────────────────────────────────────────
export async function listWhistleblowerReports(tenantId: string) {
  return await db
    .select()
    .from(whistleblowerReports)
    .where(eq(whistleblowerReports.tenantId, tenantId))
    .orderBy(desc(whistleblowerReports.filedAt));
}

export async function createWhistleblowerReport(data: any, tenantId: string) {
  const [record] = await db.insert(whistleblowerReports).values({
    orgId: data.orgId,
    isAnonymous: data.isAnonymous !== false,
    reporterName: data.isAnonymous ? null : (data.reporterName || null),
    reporterEmail: data.isAnonymous ? null : (data.reporterEmail || null),
    implicatedPerson: data.implicatedPerson,
    details: data.details,
    disclosureStatus: "PENDING",
    withheldReason: null,
    tenantId,
  }).returning();
  return record;
}

export async function updateWhistleblowerReport(id: string, data: any) {
  const [updated] = await db
    .update(whistleblowerReports)
    .set({ disclosureStatus: data.disclosureStatus, withheldReason: data.withheldReason || null })
    .where(eq(whistleblowerReports.id, id))
    .returning();
  return updated;
}

// ─── Enforcement Cases ───────────────────────────────────────────────────────
export async function listEnforcementCases(tenantId: string) {
  return await db
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.tenantId, tenantId))
    .orderBy(desc(enforcementCases.createdAt));
}

export async function createEnforcementCase(data: any, tenantId: string) {
  const seriousSections = ["s.7", "s.8", "s.9", "s.10", "s.11", "s.12"];
  const breachedSections: string[] = data.breachedSections || [];
  const isSeriousBreach = breachedSections.some((s: string) => seriousSections.includes(s));
  const penaltyBand = data.penaltyBand || (isSeriousBreach ? "LEVEL_11" : "LEVEL_7");

  const [record] = await db.insert(enforcementCases).values({
    respondentName: data.respondentName,
    breachedSections,
    penaltyBand,
    fineAmount: data.fineAmount ? parseFloat(data.fineAmount) : null,
    imprisonmentTerm: data.imprisonmentTerm || null,
    seizureOrder: data.seizureOrder === true,
    deletionOrder: data.deletionOrder === true,
    status: "OPEN",
    tenantId,
  }).returning();
  return record;
}

export async function updateEnforcementCase(id: string, data: any) {
  const updates: Record<string, any> = {
    status: data.status,
    fineAmount: data.fineAmount ? parseFloat(data.fineAmount) : undefined,
    seizureOrder: data.seizureOrder,
    deletionOrder: data.deletionOrder,
  };
  if (data.status === "CLOSED" && data.deletionOrder) {
    updates.destructionConfirmedAt = new Date();
  }
  const [updated] = await db
    .update(enforcementCases)
    .set(updates)
    .where(eq(enforcementCases.id, id))
    .returning();
  return updated;
}

// ─── Appeal Cases ────────────────────────────────────────────────────────────
export async function listAppealCases(tenantId: string) {
  return await db
    .select()
    .from(appealCases)
    .where(eq(appealCases.tenantId, tenantId))
    .orderBy(desc(appealCases.filedAt));
}

export async function createAppealCase(data: any, tenantId: string) {
  await db
    .update(enforcementCases)
    .set({ status: "APPEALED" })
    .where(eq(enforcementCases.id, data.enforcementCaseId));

  const [record] = await db.insert(appealCases).values({
    enforcementCaseId: data.enforcementCaseId,
    courtReference: data.courtReference,
    outcome: null,
    status: "PENDING",
    tenantId,
  }).returning();
  return record;
}

export async function updateAppealCase(id: string, data: any) {
  const [updated] = await db
    .update(appealCases)
    .set({ outcome: data.outcome, status: data.status })
    .where(eq(appealCases.id, id))
    .returning();
  return updated;
}

// ─── Adequacy Countries ──────────────────────────────────────────────────────
export async function listAdequacyCountries() {
  return await db.select().from(adequacyCountries).orderBy(adequacyCountries.countryName);
}

export async function addAdequacyCountry(data: any) {
  const [record] = await db.insert(adequacyCountries).values({
    countryName: data.countryName,
    isAdequate: data.isAdequate !== false,
    legalBasis: data.legalBasis || null,
  }).returning();
  return record;
}

export async function removeAdequacyCountry(id: string) {
  await db.delete(adequacyCountries).where(eq(adequacyCountries.id, id));
  return { ok: true };
}

// ─── Authority Approvals ─────────────────────────────────────────────────────
export async function listAuthorityApprovals(tenantId: string) {
  return await db
    .select()
    .from(authorityApprovals)
    .where(eq(authorityApprovals.tenantId, tenantId))
    .orderBy(desc(authorityApprovals.id));
}

export async function decideAuthorityApproval(id: string, data: any, decidedBy: string) {
  const [updated] = await db
    .update(authorityApprovals)
    .set({ decision: data.decision, conditions: data.conditions || null, decidedBy, decidedAt: new Date() })
    .where(eq(authorityApprovals.id, id))
    .returning();
  return updated;
}
