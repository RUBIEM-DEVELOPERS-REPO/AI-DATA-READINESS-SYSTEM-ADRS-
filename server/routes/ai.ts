import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { createAiClient, getChatModel, getAiProviderConfig } from "../services/ai-provider";
import { withTimeout, aiCircuitBreaker, AI_TIMEOUT_MS } from "../services/circuit-breaker";
import { generateEmbedding, semanticSearch } from "../services/embeddings";
import { resolveDynamicProfile } from "../services/attention";
import { runAgentTask, getSystemInsights, getAgentOrchestrationPlan, AGENT_TASKS } from "../services/agent";
import { evaluateExtraction, type GroundTruthEntry } from "../services/evaluation";
import { storage } from "../storage";
import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import { chunkEmbeddings, entityEmbeddings, cdmEntities, evidenceFiles, extractionTexts, extractionRuns, validationTasks, kgNodes, kgEdges } from "@shared/schema";
import { syncLiveKnowledgeGraph } from "../compliance";
import { randomUUID } from "crypto";
import { ADRS_CONFIG } from "../config";
import { generateCode } from "./utils";
import { requireTenantContext } from "../middleware/tenant-guard";

const router = Router();

// Apply auth and tenant context globally to all AI and Feature router endpoints
router.use(requireAuth);
router.use(requireTenantContext);

// ─── Copilot Chat (RAG) ──────────────────────────────────────────────────────
router.post("/copilot/chat", async (req, res) => {
  try {
    const { message, conversationHistory = [], layer, pageLabel } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const searchResults = await semanticSearch(message, 5, req.tenantContext.tenantId);
    let contextString = "";
    if (searchResults.length > 0) {
      contextString = "CONTEXT DOCUMENTS:\n" + searchResults.map((r, i) => 
        `[Doc ${i+1}: ${r.fileName} (Confidence: ${(r.score * 100).toFixed(1)}%)]\n${r.text.slice(0, 1500)}`
      ).join("\n\n");
    } else {
      contextString = "No relevant context documents found in the system for this query.";
    }

    const workspaceScope = layer || pageLabel
      ? `\nCurrent workspace: ${pageLabel || layer} (layer: ${layer || "system"}).
You are embedded in this workspace. Answer within this workspace's scope and do not blend in concepts from unrelated parts of the ADRS pipeline.
If the context documents do not support a focused answer for this workspace, say so explicitly instead of substituting unrelated context.`
      : "";

    const systemPrompt = `You are ADRS Copilot, an AI assistant for the African Data Readiness System.
Your job is to answer the user's questions based strictly on the provided Context Documents.
If the context documents do not contain the answer, say "I don't have enough information in the ingested documents to answer that."
Do not hallucinate or invent information outside of the provided context.
When providing an answer, cite the source document name if possible.
${workspaceScope}

${contextString}`;

    const openai = createAiClient(getAiProviderConfig());
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-5),
      { role: "user", content: message }
    ];

    const response = await aiCircuitBreaker.execute(() =>
      withTimeout(
        openai.chat.completions.create({
          model: getChatModel(),
          messages,
          temperature: 0.2,
        }),
        AI_TIMEOUT_MS,
        "AI Copilot Chat"
      )
    );

    const reply = response.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    res.json({ reply, sources: searchResults.map(r => r.fileName) });
  } catch (err: any) {
    console.error("[Copilot] Chat error:", err);
    const detail = err?.message ?? "Unknown error";
    const configError = /not configured|baseUrl is required|API key/i.test(detail);
    const reply = configError
      ? "The AI service is not configured on this server. Ask an administrator to set the AI provider API key in the server environment, then try again."
      : "I couldn't reach the AI service right now. Please try again in a moment — if this persists, check the AI provider configuration and API key.";
    res.json({ reply, sources: [], error: detail });
  }
});

// ─── Evaluation / Ground Truth Benchmark ─────────────────────────────────────
router.post("/evaluate", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const { extractionRunId, groundTruth } = req.body as { extractionRunId: string; groundTruth: GroundTruthEntry[] };
    if (!extractionRunId || !Array.isArray(groundTruth) || groundTruth.length === 0) {
      return res.status(400).json({ error: "extractionRunId and groundTruth array are required" });
    }
    const run = await storage.getExtractionRun(extractionRunId);
    if (!run) return res.status(404).json({ error: "Extraction run not found" });

    // Verify tenant ownership of the evidence file linked to this extraction run
    const evidence = await storage.getEvidenceFile(run.evidenceId, req.tenantContext);
    if (!evidence) return res.status(403).json({ error: "Access denied" });

    const attrs = (run.extractedAttributes as any[]) ?? [];
    const report = evaluateExtraction(groundTruth, attrs);
    res.json(report);
  } catch (err: any) {
    console.error("[Evaluate] Error:", err);
    res.status(500).json({ error: "Evaluation failed" });
  }
});

// ─── Embeddings and Feature stats (Layer 4) ──────────────────────────────────
router.get("/features/stats", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const tenantId = req.tenantContext.tenantId;
    const [chunkRows, entityRows, evidenceRows, runRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(chunkEmbeddings).where(eq(chunkEmbeddings.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` }).from(entityEmbeddings).where(eq(entityEmbeddings.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` }).from(evidenceFiles).where(eq(evidenceFiles.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` })
        .from(extractionRuns)
        .innerJoin(evidenceFiles, eq(extractionRuns.evidenceId, evidenceFiles.id))
        .where(eq(evidenceFiles.tenantId, tenantId)),
    ]);
    const totalChunks   = Number(chunkRows[0]?.count   ?? 0);
    const totalEntities = Number(entityRows[0]?.count   ?? 0);
    const totalEvidence = Number(evidenceRows[0]?.count ?? 0);
    const totalRuns     = Number(runRows[0]?.count      ?? 0);

    const tokenStats = await db
      .select({
        avgTokens: sql<number>`avg(token_count)`,
        maxTokens: sql<number>`max(token_count)`,
        sumTokens: sql<number>`sum(token_count)`,
      })
      .from(chunkEmbeddings)
      .where(eq(chunkEmbeddings.tenantId, tenantId));

    const modelBreakdown = await db
      .select({
        modelVersion: chunkEmbeddings.modelVersion,
        count: sql<number>`count(*)`,
      })
      .from(chunkEmbeddings)
      .where(eq(chunkEmbeddings.tenantId, tenantId))
      .groupBy(chunkEmbeddings.modelVersion);

    res.json({
      totalChunkEmbeddings: totalChunks,
      totalEntityEmbeddings: totalEntities,
      totalEvidenceFiles: totalEvidence,
      totalExtractionRuns: totalRuns,
      embeddingCoveragePct: totalRuns > 0 ? Math.round((totalChunks / Math.max(totalRuns, 1)) * 100) : 0,
      vectorDimensions: 384,
      modelVersion: "all-MiniLM-L6-v2",
      avgTokenCount: Math.round(Number(tokenStats[0]?.avgTokens ?? 0)),
      maxTokenCount: Number(tokenStats[0]?.maxTokens ?? 0),
      totalTokensIndexed: Number(tokenStats[0]?.sumTokens ?? 0),
      modelBreakdown: modelBreakdown.map(m => ({ model: m.modelVersion, count: Number(m.count) })),
    });
  } catch (err: any) {
    console.error("[Layer4] Stats error:", err);
    res.status(500).json({ error: "Failed to fetch feature stats" });
  }
});

router.get("/features/chunks", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1)));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20))));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id:             chunkEmbeddings.id,
        evidenceId:     chunkEmbeddings.evidenceId,
        modelVersion:   chunkEmbeddings.modelVersion,
        tokenCount:     chunkEmbeddings.tokenCount,
        tenantId:       chunkEmbeddings.tenantId,
        createdAt:      chunkEmbeddings.createdAt,
        fileName:       evidenceFiles.fileName,
        fileFormat:     evidenceFiles.fileFormat,
        chunkText:      extractionTexts.text,
      })
      .from(chunkEmbeddings)
      .leftJoin(evidenceFiles,   eq(chunkEmbeddings.evidenceId,       evidenceFiles.id))
      .leftJoin(extractionTexts, eq(chunkEmbeddings.extractionTextId, extractionTexts.id))
      .where(eq(chunkEmbeddings.tenantId, req.tenantContext.tenantId))
      .orderBy(desc(chunkEmbeddings.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: sql<number>`count(*)` }).from(chunkEmbeddings).where(eq(chunkEmbeddings.tenantId, req.tenantContext.tenantId));

    res.json({
      chunks: rows.map(r => ({
        ...r,
        chunkText: r.chunkText ? r.chunkText.slice(0, 200) : null,
      })),
      total: Number(total?.count ?? 0),
      page,
      limit,
    });
  } catch (err: any) {
    console.error("[Layer4] Chunks error:", err);
    res.status(500).json({ error: "Failed to fetch chunk embeddings" });
  }
});

router.get("/features/entities", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1)));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20))));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id:           entityEmbeddings.id,
        entityId:     entityEmbeddings.entityId,
        modelVersion: entityEmbeddings.modelVersion,
        tenantId:     entityEmbeddings.tenantId,
        createdAt:    entityEmbeddings.createdAt,
        displayName:  cdmEntities.displayName,
        entityType:   cdmEntities.entityType,
        confidence:   cdmEntities.confidenceScore,
      })
      .from(entityEmbeddings)
      .leftJoin(cdmEntities, eq(entityEmbeddings.entityId, cdmEntities.id))
      .where(eq(entityEmbeddings.tenantId, req.tenantContext.tenantId))
      .orderBy(desc(entityEmbeddings.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: sql<number>`count(*)` }).from(entityEmbeddings).where(eq(entityEmbeddings.tenantId, req.tenantContext.tenantId));

    res.json({
      entities: rows,
      total: Number(total?.count ?? 0),
      page,
      limit,
    });
  } catch (err: any) {
    console.error("[Layer4] Entity embeddings error:", err);
    res.status(500).json({ error: "Failed to fetch entity embeddings" });
  }
});

router.post("/features/search", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const { query, limit = 10 } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query string is required" });
    }
    const results = await semanticSearch(query, Math.min(20, limit), req.tenantContext.tenantId);
    res.json({ results, query, count: results.length });
  } catch (err: any) {
    console.error("[Layer4] Search error:", err);
    res.status(500).json({ error: "Semantic search failed" });
  }
});

// ─── Attention & Fusion (Layer 5) ───────────────────────────────────────────
router.get("/attention/profile-stats", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const byDocType = await db
      .select({
        docType: extractionRuns.docType,
        count:   sql<number>`count(*)`,
        avgConf: sql<number>`avg(extraction_confidence)`,
        avgTrust: sql<number>`avg(trust_score)`,
      })
      .from(extractionRuns)
      .innerJoin(evidenceFiles, eq(extractionRuns.evidenceId, evidenceFiles.id))
      .where(eq(evidenceFiles.tenantId, req.tenantContext.tenantId))
      .groupBy(extractionRuns.docType);

    const FINANCE_TYPES = new Set(["INVOICE","QUOTATION","PURCHASE_ORDER","RECEIPT","BANK_STATEMENT","FINANCIAL","REPORT"]);
    const HR_TYPES      = new Set(["CV","IDENTITY","PAYSLIP","CERTIFICATE","LICENSE","PERMIT"]);

    let profileCounts = {
      "profile-finance": { name: "Financial Record", count: 0, avgConf: 0, avgTrust: 0, docTypes: [] as string[] },
      "profile-hr":      { name: "HR & Employment",  count: 0, avgConf: 0, avgTrust: 0, docTypes: [] as string[] },
      "profile-generic": { name: "Generic Document", count: 0, avgConf: 0, avgTrust: 0, docTypes: [] as string[] },
    } as Record<string, any>;

    for (const row of byDocType) {
      const dt    = row.docType?.toUpperCase() ?? "";
      const key   = FINANCE_TYPES.has(dt) ? "profile-finance" : HR_TYPES.has(dt) ? "profile-hr" : "profile-generic";
      const count = Number(row.count);
      profileCounts[key].count    += count;
      profileCounts[key].docTypes.push(dt);
      const prev = profileCounts[key];
      const total = prev.count;
      profileCounts[key].avgConf  = total > 0 ? ((prev.avgConf * (total - count) + Number(row.avgConf) * count) / total) : Number(row.avgConf);
      profileCounts[key].avgTrust = total > 0 ? ((prev.avgTrust * (total - count) + Number(row.avgTrust) * count) / total) : Number(row.avgTrust);
    }

    const totalRuns = Object.values(profileCounts).reduce((s: number, p: any) => s + p.count, 0);

    res.json({
      profiles: Object.entries(profileCounts).map(([id, p]: [string, any]) => ({
        id,
        name:     p.name,
        count:    p.count,
        pct:      totalRuns > 0 ? Math.round((p.count / totalRuns) * 100) : 0,
        avgConf:  Math.round(Number(p.avgConf) * 100),
        avgTrust: Math.round(Number(p.avgTrust) * 100),
        docTypes: [...new Set(p.docTypes)].filter(Boolean),
      })),
      totalRuns,
    });
  } catch (err: any) {
    console.error("[Layer5] Profile stats error:", err);
    res.status(500).json({ error: "Failed to fetch profile stats" });
  }
});

router.post("/attention/resolve", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const { text, docType = "OTHER" } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    const result = await resolveDynamicProfile(text.trim(), docType);
    res.json({
      profileId:       result.profile.id,
      profileName:     result.profile.name,
      similarityScore: Math.round(result.similarityScore * 100),
      description:     result.profile.description,
      targetEntities:  result.profile.targetEntities.map(t => t.entityType),
      relevanceWeights: result.profile.relevanceWeights,
    });
  } catch (err: any) {
    console.error("[Layer5] Resolve error:", err);
    res.status(500).json({ error: "Profile resolution failed" });
  }
});

router.get("/attention/fusion-stats", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const tenantId = req.tenantContext.tenantId;
    const [structuredRows, unstructuredRows, hitlRows, kgNodeRows, kgEdgeRows, conflictRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)`, totalAttrs: sql<number>`sum(jsonb_array_length(extracted_attributes::jsonb))` })
        .from(extractionRuns)
        .innerJoin(evidenceFiles, eq(extractionRuns.evidenceId, evidenceFiles.id))
        .where(and(eq(evidenceFiles.tenantId, tenantId), sql`extracted_attributes is not null` as any)),
      db.select({ count: sql<number>`count(*)` }).from(chunkEmbeddings).where(eq(chunkEmbeddings.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` })
        .from(validationTasks)
        .innerJoin(evidenceFiles, eq(validationTasks.evidenceId, evidenceFiles.id))
        .where(and(eq(evidenceFiles.tenantId, tenantId), eq(validationTasks.status, "APPROVED"))),
      db.select({ count: sql<number>`count(*)` }).from(kgNodes).where(eq(kgNodes.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` }).from(kgEdges).where(eq(kgEdges.tenantId, tenantId)),
      db.select({ count: sql<number>`count(*)` })
        .from(validationTasks)
        .innerJoin(evidenceFiles, eq(validationTasks.evidenceId, evidenceFiles.id))
        .where(and(eq(evidenceFiles.tenantId, tenantId), sql`conflict_details is not null` as any)),
    ]);

    res.json({
      structured:   { label: "Structured Fields",   count: Number(structuredRows[0]?.totalAttrs ?? 0), icon: "Database" },
      unstructured: { label: "RAG Text Chunks",     count: Number(unstructuredRows[0]?.count ?? 0),  icon: "FileText" },
      rules:        { label: "Ontology Axioms",     count: 6,  icon: "GitBranch" },
      graph:        { label: "KG Nodes + Edges",    count: Number(kgNodeRows[0]?.count ?? 0) + Number(kgEdgeRows[0]?.count ?? 0), icon: "Share2" },
      human:        { label: "HITL Decisions",      count: Number(hitlRows[0]?.count ?? 0),  icon: "Users" },
      conflicts:    { label: "Resolved Conflicts",  count: Number(conflictRows[0]?.count ?? 0), icon: "Zap" },
    });
  } catch (err: any) {
    console.error("[Layer5] Fusion stats error:", err);
    res.status(500).json({ error: "Failed to fetch fusion stats" });
  }
});

router.get("/attention/context-packet/:evidenceId", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const { evidenceId } = req.params;
    const ev = await storage.getEvidenceFile(evidenceId, req.tenantContext);
    if (!ev) return res.status(404).json({ error: "Evidence file not found" });

    const run = await storage.getExtractionRunByEvidence(evidenceId);
    const structuredFields = run?.extractedAttributes ? (run.extractedAttributes as any[]).slice(0, 20) : [];

    const ragChunks = await db
      .select({ id: chunkEmbeddings.id, text: extractionTexts.text, tokenCount: chunkEmbeddings.tokenCount })
      .from(chunkEmbeddings)
      .leftJoin(extractionTexts, eq(chunkEmbeddings.extractionTextId, extractionTexts.id))
      .where(and(eq(chunkEmbeddings.evidenceId, evidenceId), eq(chunkEmbeddings.tenantId, req.tenantContext.tenantId)))
      .limit(5);

    const linkedNodes = await db
      .select({ id: kgNodes.id, label: kgNodes.label, displayName: kgNodes.displayName, confidence: kgNodes.confidenceScore })
      .from(kgNodes)
      .where(and(sql`properties->>'source_evidence_id' = ${evidenceId}`, eq(kgNodes.tenantId, req.tenantContext.tenantId)))
      .limit(10);

    const rawText = run?.rawText ?? "";
    const profileCtx = rawText ? await resolveDynamicProfile(rawText.slice(0, 500), run?.docType ?? "OTHER") : null;

    res.json({
      evidenceId,
      fileName:         ev.fileName,
      fileFormat:       ev.fileFormat,
      docType:          run?.docType,
      trustScore:       run?.trustScore ?? 0,
      structuredFields,
      ragChunks: ragChunks.map(c => ({ id: c.id, snippet: (c.text ?? "").slice(0, 300), tokenCount: c.tokenCount })),
      graphNodes: linkedNodes,
      profile: profileCtx ? {
        id:    profileCtx.profile.id,
        name:  profileCtx.profile.name,
        score: Math.round(profileCtx.similarityScore * 100),
      } : null,
      fusedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Layer5] Context packet error:", err);
    res.status(500).json({ error: "Failed to build context packet" });
  }
});

// ─── Agent Task Orchestration (Layer 9) ─────────────────────────────────────
router.get("/agent/tasks", requireRole("SUPER_ADMIN", "ADMIN", "ANALYST", "DATA_CONTROLLER", "DATA_PROTECTION_OFFICER", "REGULATOR"), async (req: any, res: any) => {
  try {
    const { layer } = req.query;
    const tasks = layer ? AGENT_TASKS.filter(t => t.layer === String(layer)) : AGENT_TASKS;
    res.json({ tasks, total: tasks.length });
  } catch (err: any) {
    console.error("[Layer9] Tasks error:", err);
    res.status(500).json({ error: "Failed to fetch agent tasks" });
  }
});

router.post("/agent/run", requireRole("SUPER_ADMIN", "ADMIN", "ANALYST", "DATA_CONTROLLER", "DATA_PROTECTION_OFFICER", "REGULATOR"), async (req: any, res: any) => {
  try {
    const { layer, taskId, query } = req.body;
    if (!layer || !taskId) return res.status(400).json({ error: "layer and taskId are required" });
    const result = await runAgentTask({ layer, taskId, query }, req.tenantContext.tenantId);
    res.json(result);
  } catch (err: any) {
    console.error("[Layer9] Agent run error:", err);
    res.status(500).json({ error: "Agent task failed", detail: err?.message });
  }
});

router.post("/agent/orchestrate", requireRole("ADMIN"), async (req: any, res: any) => {
  try {
    const { layer, taskId, query, objective, mode } = req.body;
    if (!layer || !taskId) return res.status(400).json({ error: "layer and taskId are required" });
    if (!mode || !["DRY_RUN", "APPLY"].includes(mode)) return res.status(400).json({ error: "mode must be DRY_RUN or APPLY" });

    const tenantId = req.tenantContext.tenantId;
    const plan = await getAgentOrchestrationPlan({ layer, taskId, query, objective, mode }, tenantId);
    if (plan.mode === "APPLY") {
      const adminId = (req.user as any)?.id ?? "system";
      for (const action of plan.actions) {
        if (action.type === "CREATE_VALIDATION_TASK") {
          const { extractionRunId, evidenceId, fieldsToValidate, approvalPolicyRule, approvalPolicyReason } = action.payload;
          if (!extractionRunId || !evidenceId || !Array.isArray(fieldsToValidate) || fieldsToValidate.length === 0) continue;

          // Verify tenant ownership of the evidence file before creating validation task
          const evidence = await storage.getEvidenceFile(evidenceId, req.tenantContext);
          if (!evidence) continue; // Skip — evidence not owned by this tenant

          const taskCode = generateCode("VAL");
          await db.insert(validationTasks).values({
            id: randomUUID(),
            taskCode,
            extractionRunId,
            evidenceId,
            status: "PENDING_VALIDATION",
            assignedTo: null,
            fieldsToValidate,
            validatorNotes: null,
            approvalStage: 1,
            maxApprovalStages: 1,
            trustScore: 0,
            approvalPolicyRule,
            approvalPolicyReason,
            policyRule: approvalPolicyRule,
            policyOutcome: "PENDING",
            regulatorEscalation: false,
            complianceNotes: null,
            weakFields: null,
            conflictDetails: null,
            validatedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await storage.createAuditLog({
            action: "AUTO_VALIDATION_TASK_CREATED",
            resourceType: "VALIDATION",
            resourceId: taskCode,
            userId: adminId,
            details: { extractionRunId, evidenceId, fieldsToValidate, approvalPolicyRule, approvalPolicyReason },
            tenantId,
          });
        }
        if (action.type === "TRIGGER_KG_SYNC") {
          await syncLiveKnowledgeGraph();
          await storage.createAuditLog({
            action: "KG_SYNC_TRIGGERED",
            resourceType: "KNOWLEDGE_GRAPH",
            resourceId: "live-sync",
            userId: (req.user as any)?.id ?? "system",
            details: { triggeredBy: "agent orchestration" },
            tenantId,
          });
        }
      }
    }
    res.json(plan);
  } catch (err: any) {
    console.error("[Layer9] Agent orchestrate error:", err);
    res.status(500).json({ error: "Agent orchestration failed", detail: err?.message });
  }
});

router.get("/agent/insights", requireRole("ANALYST"), async (req: any, res: any) => {
  try {
    const result = await getSystemInsights(req.tenantContext.tenantId);
    res.json(result);
  } catch (err: any) {
    console.error("[Layer9] Insights error:", err);
    res.status(500).json({ error: "Failed to get system insights" });
  }
});

export default router;

