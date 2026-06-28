import { db } from "../db";
import { evidenceFiles, extractionRuns, validationTasks, cdmEntities, chunkEmbeddings, kgNodes, kgEdges, publishedDatasets } from "@shared/schema";
import { sql } from "drizzle-orm";

export type AgentLayer =
  | "evidence" | "intelligence" | "cdm" | "validation"
  | "feature" | "attention" | "publishing" | "graph" | "system";

export interface AgentTask {
  id: string;
  label: string;
  description: string;
  layer: AgentLayer;
  icon: string;
}

export interface AgentContext {
  layer: AgentLayer;
  taskId: string;
  query?: string;
}

export interface AgentStats {
  evidenceFiles: number;
  extractionRuns: number;
  validationTasks: number;
  cdmEntities: number;
  chunkEmbeddings: number;
  kgNodes: number;
  kgEdges: number;
  publishedDatasets: number;
}

export interface AgentResult {
  taskId: string;
  layer: AgentLayer;
  output: string;
  suggestions: string[];
}

// ─── Layer-scoped agent task registry ────────────────────────────────────────
export const AGENT_TASKS: AgentTask[] = [
  // Layer 1 — Evidence / Ingestion
  { id: "evidence.batch_health",   layer: "evidence",     icon: "PackageSearch",  label: "Analyse Batch Health",         description: "Review batch metrics and identify files at risk of extraction failure." },
  { id: "evidence.detect_dupes",   layer: "evidence",     icon: "CopyX",          label: "Detect Duplicate Patterns",    description: "Identify naming/size patterns that suggest duplicate ingestion." },
  { id: "evidence.suggest_tags",   layer: "evidence",     icon: "Tags",           label: "Auto-Tag Evidence",            description: "Suggest classification tags for untagged evidence files." },

  // Layer 2 — Multimodal Intelligence
  { id: "intel.quality_summary",   layer: "intelligence", icon: "FileBarChart2",  label: "Extraction Quality Summary",   description: "Natural-language summary of recent extraction run quality metrics." },
  { id: "intel.flag_anomalies",    layer: "intelligence", icon: "AlertCircle",    label: "Flag Extraction Anomalies",    description: "Identify runs with unusual confidence drops or field gaps." },
  { id: "intel.profile_advice",    layer: "intelligence", icon: "Lightbulb",      label: "Profile Improvement Advice",   description: "Suggest extraction profile tuning based on recent run data." },

  // Layer 3 — CDM / Standardisation
  { id: "cdm.resolve_conflicts",   layer: "cdm",          icon: "GitMerge",       label: "Resolve Entity Conflicts",     description: "Suggest merge strategies for entities with overlapping canonical fields." },
  { id: "cdm.find_orphans",        layer: "cdm",          icon: "Unlink",         label: "Find Orphaned Entities",       description: "Identify CDM entities unlinked to any evidence or KG node." },
  { id: "cdm.quality_report",      layer: "cdm",          icon: "ClipboardCheck", label: "CDM Quality Report",           description: "Report on canonical field completeness and confidence distribution." },

  // Layer 4 — Feature & Representation
  { id: "feature.coverage_gaps",   layer: "feature",      icon: "PieChart",       label: "Identify Coverage Gaps",       description: "Find evidence files not yet embedded in the vector store." },
  { id: "feature.query_suggest",   layer: "feature",      icon: "SearchCode",     label: "Suggest Search Queries",       description: "Generate semantically rich example queries tuned to the corpus." },

  // Layer 5 — Attention, Fusion & Context
  { id: "attention.profile_audit", layer: "attention",    icon: "ScanSearch",     label: "Profile Assignment Audit",     description: "Review whether documents were routed to their optimal extraction profile." },
  { id: "attention.fusion_explain",layer: "attention",    icon: "Combine",        label: "Explain Fusion Result",        description: "Explain how structured + unstructured + graph sources were fused." },

  // Layer 6 — Trust, Validation & Governance
  { id: "valid.prioritize_queue",  layer: "validation",   icon: "ListOrdered",    label: "Prioritize Validation Queue",  description: "Rank pending tasks by risk score and field criticality." },
  { id: "valid.suggest_fixes",     layer: "validation",   icon: "Wand2",          label: "Suggest Field Corrections",    description: "Propose likely correct values for flagged or low-trust fields." },
  { id: "valid.trust_explain",     layer: "validation",   icon: "ShieldQuestion", label: "Explain Trust Score",          description: "Break down why an extraction run received its current trust score." },

  // Layer 7 — Knowledge Graph
  { id: "graph.hidden_links",      layer: "graph",        icon: "Network",        label: "Find Hidden Connections",      description: "Discover probable implicit relationships between unlinked entities." },
  { id: "graph.anomaly_detect",    layer: "graph",        icon: "Radar",          label: "Graph Anomaly Detection",      description: "Flag unusual relationship patterns or isolated subgraph clusters." },

  // Layer 8 — AI-Ready Dataset Publishing
  { id: "publish.draft_card",      layer: "publishing",   icon: "FileEdit",       label: "Draft Dataset Card",           description: "Auto-generate a professional dataset description and lineage summary." },
  { id: "publish.quality_advise",  layer: "publishing",   icon: "BadgeCheck",     label: "Quality Gate Advisor",         description: "Recommend optimal quality threshold settings for the current dataset." },

  // System-wide
  { id: "system.health_check",     layer: "system",       icon: "HeartPulse",     label: "Pipeline Health Check",        description: "System-wide diagnostic reporting on bottlenecks and queue depths." },
  { id: "system.predict_issues",   layer: "system",       icon: "TrendingUp",     label: "Predictive Issue Detection",   description: "Predict likely processing failures based on current system trends." },
  { id: "system.roi_report",       layer: "system",       icon: "BarChart3",      label: "AI ROI Report",                description: "Estimate time and cost savings delivered by AI automation vs. manual processing." },
];

// Helper functions for agent tools
async function executeQuery(sqlQuery: string): Promise<string> {
  const trimmed = sqlQuery.trim();
  if (!trimmed.toLowerCase().startsWith("select")) {
    return JSON.stringify({ error: "Only SELECT queries are allowed for safety and security." });
  }
  try {
    const res = await db.execute(sql.raw(trimmed));
    const rows = res.rows || res;
    return JSON.stringify(rows.slice(0, 30)); // limit rows to fit context window
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

async function escalateToHitl(taskId: string, reason: string): Promise<string> {
  try {
    await db.update(validationTasks)
      .set({
        status: "ESCALATED",
        complianceNotes: reason,
        updatedAt: new Date()
      })
      .where(sql`id = ${taskId}`);
    return JSON.stringify({ success: true, message: `Task ${taskId} escalated to HITL successfully with reason: ${reason}` });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

async function suggestFieldCorrection(taskId: string, fieldName: string, correctedValue: string): Promise<string> {
  try {
    const task = await db.select().from(validationTasks).where(sql`id = ${taskId}`).limit(1);
    if (!task || task.length === 0) {
      return JSON.stringify({ error: `Validation task ${taskId} not found.` });
    }
    const currentNotes = task[0].validatorNotes || "";
    const updatedNotes = `${currentNotes}\n[AI Auto-Suggestion] Proposed correction: Set ${fieldName} = "${correctedValue}"`.trim();
    await db.update(validationTasks)
      .set({
        validatorNotes: updatedNotes,
        updatedAt: new Date()
      })
      .where(sql`id = ${taskId}`);
    return JSON.stringify({ success: true, message: `Proposed correction for ${fieldName} recorded successfully.` });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

const agentTools = [
  {
    type: "function" as const,
    function: {
      name: "query_database",
      description: "Run a read-only SQL SELECT query on the database to check table records, system counts, validation tasks, cdm_entities, extraction_runs, etc. Example: 'SELECT * FROM validation_tasks LIMIT 5;'",
      parameters: {
        type: "object",
        properties: {
          sqlQuery: { type: "string", description: "The SQL SELECT statement." }
        },
        required: ["sqlQuery"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "escalate_to_hitl",
      description: "Escalate a low-trust validation task for human review. Use when fields are highly sensitive or conflicting.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "The validation task UUID." },
          reason: { type: "string", description: "The rationale for escalation." }
        },
        required: ["taskId", "reason"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_field_correction",
      description: "Suggest a corrected field value for an extraction or validation task, updating the system annotations.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "The validation task UUID." },
          fieldName: { type: "string", description: "The field to correct." },
          correctedValue: { type: "string", description: "The proposed value." }
        },
        required: ["taskId", "fieldName", "correctedValue"]
      }
    }
  }
];

// ─── Main agent execution ─────────────────────────────────────────────────────
export async function runAgentTask(ctx: AgentContext): Promise<AgentResult> {
  // Gather live system stats to ground the agent
  const [ev, runs, val, ent, chunks, nodes, edges, datasets] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(evidenceFiles),
    db.select({ n: sql<number>`count(*)` }).from(extractionRuns),
    db.select({ n: sql<number>`count(*)` }).from(validationTasks),
    db.select({ n: sql<number>`count(*)` }).from(cdmEntities),
    db.select({ n: sql<number>`count(*)` }).from(chunkEmbeddings),
    db.select({ n: sql<number>`count(*)` }).from(kgNodes),
    db.select({ n: sql<number>`count(*)` }).from(kgEdges),
    db.select({ n: sql<number>`count(*)` }).from(publishedDatasets),
  ]);

  const stats = {
    evidenceFiles:    Number(ev[0]?.n   ?? 0),
    extractionRuns:   Number(runs[0]?.n  ?? 0),
    validationTasks:  Number(val[0]?.n   ?? 0),
    cdmEntities:      Number(ent[0]?.n   ?? 0),
    chunkEmbeddings:  Number(chunks[0]?.n ?? 0),
    kgNodes:          Number(nodes[0]?.n  ?? 0),
    kgEdges:          Number(edges[0]?.n  ?? 0),
    publishedDatasets:Number(datasets[0]?.n ?? 0),
  };

  const task = AGENT_TASKS.find(t => t.id === ctx.taskId);

  const systemPrompt = `You are an expert AI Agent embedded in ADRS (AI Data Readiness System), an enterprise pipeline for ingesting, extracting, validating, and publishing AI-ready datasets.

Live system metrics:
- Evidence files: ${stats.evidenceFiles}
- Extraction runs: ${stats.extractionRuns}
- Pending validation tasks: ${stats.validationTasks}
- CDM entities: ${stats.cdmEntities}
- Vector embeddings indexed: ${stats.chunkEmbeddings}
- Knowledge graph: ${stats.kgNodes} nodes, ${stats.kgEdges} edges
- Published datasets: ${stats.publishedDatasets}

Active layer: ${ctx.layer.toUpperCase()}
Agent task: ${ctx.taskId}

You have access to tools to query the database and act on the system state. Use them proactively to get precise facts before drawing conclusions!

Instructions:
- Be concise (max 220 words)
- Lead with the most critical insight
- Use numbered recommendations (1. 2. 3.) where applicable
- Be specific, actionable, and grounded in the database facts you retrieve
- Do not mention being an AI or add caveats`;

  const userPrompt = task
    ? `Execute: "${task.label}" — ${task.description}${ctx.query ? `\n\nAdditional context: ${ctx.query}` : ""}`
    : ctx.query ?? "Provide a system assessment for this layer.";

  try {
    const OpenAI = require("openai").default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ];

    let steps = 0;
    const maxSteps = 5;
    let finalOutput = "Agent response unavailable.";
    let toolExecutionLogs: string[] = [];

    while (steps < maxSteps) {
      steps++;
      const response = await openai.chat.completions.create({
        model: process.env.AI_TEXT_MODEL || "llama-3.3-70b-versatile",
        messages,
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.1,
      });

      const message = response.choices[0]?.message;
      if (!message) break;

      messages.push(message);

      if (message.content) {
        finalOutput = message.content;
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          let toolResult = "";

          if (toolName === "query_database") {
            toolResult = await executeQuery(toolArgs.sqlQuery);
          } else if (toolName === "escalate_to_hitl") {
            toolResult = await escalateToHitl(toolArgs.taskId, toolArgs.reason);
          } else if (toolName === "suggest_field_correction") {
            toolResult = await suggestFieldCorrection(toolArgs.taskId, toolArgs.fieldName, toolArgs.correctedValue);
          } else {
            toolResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
          }

          toolExecutionLogs.push(`Executed ${toolName}. Result snippet: ${toolResult.slice(0, 80)}...`);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult
          });
        }
      } else {
        break;
      }
    }

    let detailedOutput = finalOutput;
    if (toolExecutionLogs.length > 0) {
      detailedOutput += `\n\n*Agent Execution Audit Trail (${steps} turns):*\n` + toolExecutionLogs.map((l, i) => `${i+1}. ${l}`).join("\n");
    }

    const suggestions = (detailedOutput.match(/^\d+\.\s+.+/gm) ?? []).slice(0, 4);
    return { taskId: ctx.taskId, layer: ctx.layer, output: detailedOutput, suggestions };

  } catch (err: any) {
    console.error("[Agent] LLM call failed:", err?.message ?? err);
    throw new Error(`Agent execution failed: ${err?.message ?? err}`);
  }
}

// ─── Agent orchestration plan types ──────────────────────────────────────────
export type OrchestrationAction =
  | {
      type: "CREATE_VALIDATION_TASK";
      payload: {
        extractionRunId: string;
        evidenceId: string;
        fieldsToValidate: string[];
        approvalPolicyRule: "CONFLICT" | "LOW_TRUST";
        approvalPolicyReason: string;
      };
    }
  | { type: "TRIGGER_KG_SYNC"; payload: {} };

export interface AgentOrchestrationPlan {
  planId: string;
  taskId: string;
  layer: AgentLayer;
  mode: "DRY_RUN" | "APPLY";
  reasoning: string;
  actions: OrchestrationAction[];
}

export function buildDeterministicOrchestrationPlan(params: {
  taskId: string;
  layer: AgentLayer;
  mode: "DRY_RUN" | "APPLY";
  stats: AgentStats;
  candidateExtractionRun?: { id: string; evidenceId: string };
  objective?: string;
}): AgentOrchestrationPlan {
  const reasoning = params.objective
    ? `Fallback orchestration plan for ${params.objective}.`
    : "Fallback orchestration plan generated from live system metrics.";

  const actions: OrchestrationAction[] = [];
  if (params.candidateExtractionRun && params.stats.validationTasks < params.stats.extractionRuns) {
    actions.push({
      type: "CREATE_VALIDATION_TASK",
      payload: {
        extractionRunId: params.candidateExtractionRun.id,
        evidenceId: params.candidateExtractionRun.evidenceId,
        fieldsToValidate: ["document_type", "trust_score", "confidence"],
        approvalPolicyRule: params.stats.validationTasks > 0 ? "LOW_TRUST" : "CONFLICT",
        approvalPolicyReason: "Fallback plan created because the AI orchestration response was unavailable.",
      },
    });
  }
  if (params.stats.kgNodes > 0 || params.stats.kgEdges > 0) {
    actions.push({ type: "TRIGGER_KG_SYNC", payload: {} });
  }

  return {
    planId: `plan-${Date.now()}`,
    taskId: params.taskId,
    layer: params.layer,
    mode: params.mode,
    reasoning,
    actions,
  };
}

function parseJsonSafe(raw: string): any {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/(\{[\s\S]*\})/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isValidOrchestrationAction(action: any): action is OrchestrationAction {
  if (!action || typeof action.type !== "string" || typeof action.payload !== "object" || action.payload === null) {
    return false;
  }

  if (action.type === "TRIGGER_KG_SYNC") {
    return Object.keys(action.payload).length === 0;
  }

  if (action.type === "CREATE_VALIDATION_TASK") {
    const payload = action.payload;
    return (
      typeof payload.extractionRunId === "string" && payload.extractionRunId.trim().length > 0 &&
      typeof payload.evidenceId === "string" && payload.evidenceId.trim().length > 0 &&
      Array.isArray(payload.fieldsToValidate) && payload.fieldsToValidate.length > 0 &&
      payload.fieldsToValidate.every((field: any) => typeof field === "string" && field.trim().length > 0) &&
      (payload.approvalPolicyRule === "CONFLICT" || payload.approvalPolicyRule === "LOW_TRUST") &&
      typeof payload.approvalPolicyReason === "string" && payload.approvalPolicyReason.trim().length > 0
    );
  }

  return false;
}

export async function getAgentOrchestrationPlan(
  ctx: AgentContext & { objective?: string; mode?: "DRY_RUN" | "APPLY" }
): Promise<AgentOrchestrationPlan> {
  const [ev, runs, val, ent, chunks, nodes, edges, datasets] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(evidenceFiles),
    db.select({ n: sql<number>`count(*)` }).from(extractionRuns),
    db.select({ n: sql<number>`count(*)` }).from(validationTasks),
    db.select({ n: sql<number>`count(*)` }).from(cdmEntities),
    db.select({ n: sql<number>`count(*)` }).from(chunkEmbeddings),
    db.select({ n: sql<number>`count(*)` }).from(kgNodes),
    db.select({ n: sql<number>`count(*)` }).from(kgEdges),
    db.select({ n: sql<number>`count(*)` }).from(publishedDatasets),
  ]);

  const stats = {
    evidenceFiles: Number(ev[0]?.n ?? 0),
    extractionRuns: Number(runs[0]?.n ?? 0),
    validationTasks: Number(val[0]?.n ?? 0),
    cdmEntities: Number(ent[0]?.n ?? 0),
    chunkEmbeddings: Number(chunks[0]?.n ?? 0),
    kgNodes: Number(nodes[0]?.n ?? 0),
    kgEdges: Number(edges[0]?.n ?? 0),
    publishedDatasets: Number(datasets[0]?.n ?? 0),
  };

  const task = AGENT_TASKS.find(t => t.id === ctx.taskId);
  const requestedMode: "DRY_RUN" | "APPLY" = ctx.mode === "APPLY" ? "APPLY" : "DRY_RUN";

  const latestRun = await db.select({ id: extractionRuns.id, evidenceId: extractionRuns.evidenceId })
    .from(extractionRuns)
    .orderBy(sql`created_at DESC`)
    .limit(1);

  const fallback = buildDeterministicOrchestrationPlan({
    taskId: ctx.taskId,
    layer: ctx.layer,
    mode: requestedMode,
    stats,
    objective: ctx.objective,
    candidateExtractionRun: latestRun[0] ? { id: latestRun[0].id, evidenceId: latestRun[0].evidenceId } : undefined,
  });

  const systemPrompt = `You are an ADRS agent orchestrator. Return ONLY valid JSON that matches the schema exactly. Do not put markdown blocks like \`\`\`json. Just raw JSON string.

Schema:
{
  "planId": string,
  "taskId": string,
  "layer": string,
  "mode": "DRY_RUN" | "APPLY",
  "reasoning": string,
  "actions": [
    {
      "type": "CREATE_VALIDATION_TASK" | "TRIGGER_KG_SYNC",
      "payload": object
    }
  ]
}

Action constraints:
- CREATE_VALIDATION_TASK payload must include extractionRunId, evidenceId, fieldsToValidate (array of strings), approvalPolicyRule (CONFLICT|LOW_TRUST), approvalPolicyReason.
- TRIGGER_KG_SYNC payload must be {}.

Base decisions strictly on metrics and database information. You have a query tool to inspect system state before orchestrating. Use it to find actual extractionRunIds and evidenceIds.

Base metrics:
- evidenceFiles=${stats.evidenceFiles}
- extractionRuns=${stats.extractionRuns}
- pendingValidationTasks=${stats.validationTasks}
- chunkEmbeddings=${stats.chunkEmbeddings}
- kgNodes=${stats.kgNodes}
- kgEdges=${stats.kgEdges}`;

  const userPrompt = task
    ? `Objective: ${ctx.objective ?? "Improve pipeline throughput and governance"}\n\nExecute: "${task.label}" — ${task.description}${ctx.query ? `\n\nAdditional context: ${ctx.query}` : ""}`
    : `Objective: ${ctx.objective ?? "Improve pipeline throughput and governance"}\n\nTask: ${ctx.taskId}${ctx.query ? `\n\nAdditional context: ${ctx.query}` : ""}`;

  try {
    const OpenAI = require("openai").default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    let steps = 0;
    const maxSteps = 4;
    let finalContent = "";

    while (steps < maxSteps) {
      steps++;
      const response = await openai.chat.completions.create({
        model: process.env.AI_TEXT_MODEL || "llama-3.3-70b-versatile",
        messages,
        tools: [
          {
            type: "function" as const,
            function: {
              name: "query_database",
              description: "Run a read-only SQL SELECT query on the database. Use this to search extraction runs, validation tasks, and database state to plan orchestrations.",
              parameters: {
                type: "object",
                properties: {
                  sqlQuery: { type: "string", description: "The SELECT statement." }
                },
                required: ["sqlQuery"]
              }
            }
          }
        ],
        tool_choice: "auto",
        temperature: 0.1,
      });

      const message = response.choices[0]?.message;
      if (!message) break;

      messages.push(message);

      if (message.content) {
        finalContent = message.content;
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          let toolResult = "";
          if (toolName === "query_database") {
            toolResult = await executeQuery(toolArgs.sqlQuery);
          } else {
            toolResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult
          });
        }
      } else {
        break;
      }
    }

    const parsed = parseJsonSafe(finalContent);
    if (!parsed || !Array.isArray(parsed.actions)) {
      throw new Error(`Orchestrator plan format invalid:\n${finalContent}`);
    }

    const validActions = parsed.actions.filter(isValidOrchestrationAction);

    return {
      planId: String(parsed.planId ?? fallback.planId),
      taskId: String(parsed.taskId ?? ctx.taskId),
      layer: (parsed.layer as AgentLayer) ?? ctx.layer,
      mode: requestedMode,
      reasoning: String(parsed.reasoning ?? ""),
      actions: validActions,
    };
  } catch (err: any) {
    console.error("[Agent][Orchestration] plan generation failed:", err);
    throw new Error(`Agent orchestration failed: ${err?.message ?? err}`);
  }
}

// ─── System-level insights (no specific task) ─────────────────────────────────
export async function getSystemInsights(): Promise<{ insights: string[]; score: number }> {
  const [ev, runs, val, ent, chunks] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(evidenceFiles),
    db.select({ n: sql<number>`count(*)` }).from(extractionRuns),
    db.select({ n: sql<number>`count(*)` }).from(validationTasks),
    db.select({ n: sql<number>`count(*)` }).from(cdmEntities),
    db.select({ n: sql<number>`count(*)` }).from(chunkEmbeddings),
  ]);

  const evidenceFiles_n  = Number(ev[0]?.n    ?? 0);
  const runs_n           = Number(runs[0]?.n   ?? 0);
  const validation_n     = Number(val[0]?.n    ?? 0);
  const entities_n       = Number(ent[0]?.n    ?? 0);
  const chunks_n         = Number(chunks[0]?.n ?? 0);

  const insights: string[] = [];

  if (evidenceFiles_n === 0) insights.push("No evidence ingested yet — upload documents to begin the pipeline.");
  else if (runs_n < evidenceFiles_n) insights.push(`${evidenceFiles_n - runs_n} evidence files pending extraction — run extraction to process them.`);
  
  if (validation_n > 10) insights.push(`${validation_n} validation tasks pending — consider assigning reviewers to clear the queue.`);
  
  if (chunks_n === 0 && evidenceFiles_n > 0) insights.push("No vector embeddings indexed — RAG search will be unavailable until extraction runs complete.");
  
  if (entities_n === 0 && runs_n > 0) insights.push("Extraction completed but no CDM entities created — check entity inference settings.");
  
  if (insights.length === 0) insights.push("System pipeline is healthy — all layers are active and processing normally.");

  // Compute a simple pipeline health score (0-100)
  let score = 50;
  if (evidenceFiles_n > 0) score += 10;
  if (runs_n > 0) score += 10;
  if (chunks_n > 0) score += 10;
  if (entities_n > 0) score += 10;
  if (validation_n < 5) score += 10;

  return { insights, score: Math.min(100, score) };
}
