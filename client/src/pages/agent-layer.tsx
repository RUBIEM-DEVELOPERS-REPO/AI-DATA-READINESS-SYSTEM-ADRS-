import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/auth";
import {
  Bot, Brain, Sparkles, Zap, BarChart3, Search, Database,
  FileText, Users, Network, Shield, Package, Cpu, GitBranch,
  HeartPulse, TrendingUp, CheckCircle2, Loader2, Send, RefreshCw,
  MessageSquare, Layers, ArrowRight, Activity, ChevronRight,
  BookOpen, FlaskConical, Workflow, Lightbulb, Target, Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AgentTask {
  id: string; label: string; description: string; layer: string; icon: string;
}

interface AgentResult {
  taskId: string; layer: string; output: string; suggestions: string[];
}

interface OrchestrationPlan {
  planId: string;
  taskId: string;
  layer: string;
  mode: "DRY_RUN" | "APPLY";
  reasoning: string;
  actions: Array<{
    type: string;
    payload: Record<string, any>;
  }>;
}

interface SystemInsights {
  insights: string[]; score: number;
}

interface ChatMessage {
  role: "user" | "assistant"; content: string; sources?: string[];
}

// ─── Layer definitions (for Agent Hub) ────────────────────────────────────────
const LAYERS = [
  { id: "evidence",     num: 1, label: "Evidence & Ingestion",       icon: Package,    color: "from-blue-500/20 border-blue-500/20    text-blue-400" },
  { id: "intelligence", num: 2, label: "Multimodal Intelligence",    icon: Brain,      color: "from-violet-500/20 border-violet-500/20 text-violet-400" },
  { id: "cdm",          num: 3, label: "CDM Standardisation",        icon: Database,   color: "from-amber-500/20 border-amber-500/20   text-amber-400" },
  { id: "feature",      num: 4, label: "Feature & Representation",   icon: Cpu,        color: "from-emerald-500/20 border-emerald-500/20 text-emerald-400" },
  { id: "attention",    num: 5, label: "Attention, Fusion & Context",icon: GitBranch,  color: "from-cyan-500/20 border-cyan-500/20     text-cyan-400" },
  { id: "validation",   num: 6, label: "Trust & Validation",         icon: Shield,     color: "from-rose-500/20 border-rose-500/20     text-rose-400" },
  { id: "graph",        num: 7, label: "Knowledge Graph",            icon: Network,    color: "from-pink-500/20 border-pink-500/20     text-pink-400" },
  { id: "publishing",   num: 8, label: "AI-Ready Publishing",        icon: FileText,   color: "from-orange-500/20 border-orange-500/20 text-orange-400" },
];

// ─── Tab 1: Agent Hub ─────────────────────────────────────────────────────────
function AgentHubTab() {
  const { user } = useAuth();
  const [activeLayer, setActiveLayer] = useState("system");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AgentResult>>({});
  const [orchestration, setOrchestration] = useState<Record<string, OrchestrationPlan>>({});

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ tasks: AgentTask[] }>({
    queryKey: ["/api/agent/tasks", activeLayer],
    queryFn: () => fetch(`/api/agent/tasks${activeLayer !== "system" ? `?layer=${activeLayer}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { mutate: runTask } = useMutation<AgentResult, Error, { taskId: string; layer: string }>({
    mutationFn: ({ taskId, layer }) =>
      apiRequest("POST", "/api/agent/run", { layer, taskId }).then(r => r.json()),
    onMutate: ({ taskId }) => setRunning(taskId),
    onSuccess: (data) => { setResults(p => ({ ...p, [data.taskId]: data })); setRunning(null); },
    onError: () => setRunning(null),
  });

  const [applyMode, setApplyMode] = useState<Record<string, boolean>>({});

  const { mutate: orchestrateTask } = useMutation<OrchestrationPlan, Error, { taskId: string; layer: string; mode: "DRY_RUN" | "APPLY" }>({
    mutationFn: ({ taskId, layer, mode }) =>
      apiRequest("POST", "/api/agent/orchestrate", {
        layer,
        taskId,
        mode,
        objective: mode === "APPLY"
          ? "Apply recommended governance and validation actions automatically."
          : "Preview recommended governance and validation actions.",
      }).then(r => r.json()),
    onMutate: ({ taskId }) => setRunning(taskId),
    onSuccess: (data) => { setOrchestration(p => ({ ...p, [data.taskId]: data })); setRunning(null); },
    onError: () => setRunning(null),
  });

  const tasks = tasksData?.tasks ?? [];

  return (
    <div className="space-y-5">
      {/* Layer filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveLayer("system")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${activeLayer === "system" ? "bg-primary text-primary-foreground border-primary" : "border-border/50 hover:border-primary/30 text-muted-foreground"}`}
        >
          All Layers
        </button>
        {LAYERS.map(l => (
          <button
            key={l.id}
            onClick={() => setActiveLayer(l.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${activeLayer === l.id ? "bg-primary text-primary-foreground border-primary" : "border-border/50 hover:border-primary/30 text-muted-foreground"}`}
          >
            L{l.num}: {l.label.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Agent task grid */}
      {tasksLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((task) => {
            const res = results[task.id];
            const plan = orchestration[task.id];
            const isRunning = running === task.id;
            const layerMeta = LAYERS.find(l => l.id === task.layer);
            return (
              <Card key={task.id} className="glass-panel border-0 hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-4 space-y-3">
                  {/* Task header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${layerMeta?.color ?? "from-primary/20 border-primary/20 text-primary"} border`}>
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold leading-tight">{task.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0 font-mono">L{layerMeta?.num ?? "?"}</Badge>
                  </div>

                  {/* Result */}
                  {res && !isRunning && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-[11px] text-foreground leading-relaxed line-clamp-5 whitespace-pre-wrap">{res.output}</p>
                    </div>
                  )}

                  {/* Orchestration summary for admins */}
                  {plan && !isRunning && (
                    <div className="bg-muted/10 border border-border/60 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Orchestration {plan.mode === "APPLY" ? "Result" : "Preview"}</p>
                          <p className="text-[11px] font-semibold text-foreground">{plan.actions.length > 0 ? `${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"}` : "No actions suggested"}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] uppercase">{plan.mode}</Badge>
                      </div>
                      <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">{plan.reasoning || "No additional reasoning provided."}</p>
                      {plan.actions.length > 0 && (
                        <div className="space-y-2">
                          {plan.actions.map((action, index) => (
                            <div key={`${action.type}-${index}`} className="rounded-xl border border-border/30 bg-background p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{action.type.replace(/_/g, " ")}</p>
                                <span className="text-[9px] text-muted-foreground">{Object.keys(action.payload ?? {}).length} payload field{Object.keys(action.payload ?? {}).length === 1 ? "" : "s"}</span>
                              </div>
                              <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                                {Object.entries(action.payload ?? {}).map(([key, value]) => (
                                  <div key={key} className="flex flex-wrap gap-1">
                                    <span className="font-medium text-foreground">{key}:</span>
                                    <span>{Array.isArray(value) ? value.join(", ") : String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isRunning && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Agent processing…
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Button
                      size="sm"
                      variant={res ? "outline" : "default"}
                      onClick={() => runTask({ taskId: task.id, layer: task.layer })}
                      disabled={isRunning || !!running}
                      className="w-full h-8 text-xs gap-2"
                      data-testid={`button-run-agent-${task.id}`}
                    >
                      {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : res ? <RefreshCw className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {isRunning ? "Running…" : res ? "Re-run Agent" : "Run Agent"}
                    </Button>
                    {user?.role === "ADMIN" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <label className="inline-flex items-center gap-2">
                            <Switch
                              checked={applyMode[task.id] ?? false}
                              onCheckedChange={(checked) => setApplyMode(prev => ({ ...prev, [task.id]: checked as boolean }))}
                              className="border"
                            />
                            Apply automatically
                          </label>
                          <Badge variant="outline" className="text-[9px] uppercase">
                            {applyMode[task.id] ? "APPLY" : "DRY_RUN"}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant={applyMode[task.id] ? "destructive" : "secondary"}
                          onClick={() => orchestrateTask({ taskId: task.id, layer: task.layer, mode: applyMode[task.id] ? "APPLY" : "DRY_RUN" })}
                          disabled={isRunning || !!running}
                          className="w-full h-8 text-[10px] gap-2"
                        >
                          {applyMode[task.id] ? <CheckCircle2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {applyMode[task.id] ? "Apply" : "Dry-run"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: RAG Explorer (Full-screen Copilot) ────────────────────────────────
function RagExplorerTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Welcome to the ADRS Knowledge Explorer. I can answer questions about your ingested documents, extraction results, entities, and system state. What would you like to investigate?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: msg,
          conversationHistory: messages.map(m => ({ role: m.role === "assistant" ? "system" : "user", content: m.content })),
        }),
      });
      const data = await res.json();
      const sources = Array.from(new Set(data.sources ?? [])) as string[];
      setMessages(prev => [...prev, { role: "assistant", content: data.reply ?? "No response.", sources }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Unable to connect to the knowledge base. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const EXAMPLE_QUERIES = [
    "What documents have been ingested?",
    "Which entities have the highest confidence?",
    "What is the current extraction quality?",
    "Show me the most recent trust scores",
    "Are there any unresolved validation conflicts?",
    "What data has been published to datasets?",
  ];

  return (
    <div className="flex flex-col h-[600px] space-y-4">
      {/* Chat area */}
      <Card className="glass-panel border-0 flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold">Document Knowledge Explorer</CardTitle>
              <CardDescription className="text-xs">Ask anything about your ingested documents and pipeline state.</CardDescription>
            </div>
            <Badge variant="outline" className="ml-auto text-[10px] gap-1 border-emerald-500/30 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> RAG Active
            </Badge>
          </div>
        </CardHeader>
        <ScrollArea className="flex-1 px-4 min-h-0">
          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted/50 border border-border/30 text-foreground rounded-tl-sm"
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1">
                      {msg.sources.map((s, si) => (
                        <Badge key={si} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted/50 border border-border/30 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Searching knowledge base…</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-border/30 flex-shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents, entities, extractions…"
              className="flex-1 text-sm"
              disabled={isLoading}
              data-testid="input-rag-chat"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="shrink-0" data-testid="button-rag-send">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Examples:</span>
        {EXAMPLE_QUERIES.map(q => (
          <button key={q} onClick={() => setInput(q)}
            className="text-[10px] px-2.5 py-1 rounded-full border border-border/50 hover:border-primary/30 hover:text-primary transition-colors text-muted-foreground">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 3: Workflow Automation ────────────────────────────────────────────────
function WorkflowTab() {
  const { data: insights, isLoading } = useQuery<SystemInsights>({ queryKey: ["/api/agent/insights"] });

  const WORKFLOWS = [
    {
      id: "auto_validate",
      name: "Auto-Validation Sweep",
      desc: "Automatically approve validation tasks where all fields exceed confidence thresholds.",
      status: "ACTIVE",
      layer: "L6",
      icon: Shield,
      color: "border-rose-500/30 bg-rose-500/5",
      trigger: "Every extraction run completion",
      aiCapability: "Eliminates manual review for 70%+ of low-risk tasks",
    },
    {
      id: "auto_embed",
      name: "Background Embedding Worker",
      desc: "Automatically generate vector embeddings for new extraction runs without human initiation.",
      status: "ACTIVE",
      layer: "L4",
      icon: Cpu,
      color: "border-emerald-500/30 bg-emerald-500/5",
      trigger: "On new extraction run completion",
      aiCapability: "100% vector coverage without manual triggers",
    },
    {
      id: "profile_routing",
      name: "Intelligent Profile Routing",
      desc: "Automatically select the optimal extraction profile based on zero-shot document classification.",
      status: "ACTIVE",
      layer: "L5",
      icon: GitBranch,
      color: "border-cyan-500/30 bg-cyan-500/5",
      trigger: "On document ingestion",
      aiCapability: "Previously required manual profile selection",
    },
    {
      id: "entity_dedup",
      name: "Continuous Entity Deduplication",
      desc: "Detect and flag potential CDM entity duplicates as new evidence is ingested.",
      status: "ACTIVE",
      layer: "L3",
      icon: Database,
      color: "border-amber-500/30 bg-amber-500/5",
      trigger: "On CDM entity creation",
      aiCapability: "Replaces weekly manual deduplication reviews",
    },
    {
      id: "kg_sync",
      name: "Knowledge Graph Auto-Sync",
      desc: "Automatically sync new CDM entities and relationships into the live knowledge graph.",
      status: "ACTIVE",
      layer: "L7",
      icon: Network,
      color: "border-pink-500/30 bg-pink-500/5",
      trigger: "On CDM entity approval",
      aiCapability: "Graph stays current without manual graph management",
    },
    {
      id: "trust_monitor",
      name: "Trust Score Guardian",
      desc: "Continuously monitor trust scores and auto-escalate extractions below threshold.",
      status: "ACTIVE",
      layer: "L6",
      icon: HeartPulse,
      color: "border-violet-500/30 bg-violet-500/5",
      trigger: "Real-time on score update",
      aiCapability: "Proactive quality control — impossible at scale without AI",
    },
    {
      id: "dataset_card_gen",
      name: "Dataset Card Auto-Draft",
      desc: "Generate draft dataset cards using AI summarisation when publishing is triggered.",
      status: "STANDBY",
      layer: "L8",
      icon: FileText,
      color: "border-orange-500/30 bg-orange-500/5",
      trigger: "On publish request",
      aiCapability: "Eliminates manual documentation writing",
    },
    {
      id: "anomaly_patrol",
      name: "Anomaly Patrol Agent",
      desc: "Periodically scan extraction runs for statistical outliers and alert the validation queue.",
      status: "STANDBY",
      layer: "L2",
      icon: Activity,
      color: "border-blue-500/30 bg-blue-500/5",
      trigger: "Scheduled every 6 hours",
      aiCapability: "Detects patterns invisible to human reviewers",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Pipeline health card */}
      <Card className="glass-panel border-0 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-muted/30 flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full border-4 border-emerald-500 transition-all"
                    style={{
                      clipPath: `inset(0 ${100 - (insights?.score ?? 0)}% 0 0)`,
                    }}
                  />
                  <span className="text-lg font-bold relative z-10">{isLoading ? "…" : (insights?.score ?? 0)}</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold">Pipeline Health Score</p>
                <p className="text-xs text-muted-foreground">Based on live system metrics across all layers</p>
              </div>
            </div>
            <div className="space-y-1 flex-1 min-w-0 max-w-xs">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : insights?.insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <div className="w-1 h-1 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />
                  {ins}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automation workflows */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Workflow className="w-4 h-4 text-primary" /> Automated Workflows
          <Badge variant="outline" className="text-[10px] ml-1">{WORKFLOWS.filter(w => w.status === "ACTIVE").length} active</Badge>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WORKFLOWS.map((wf) => (
            <Card key={wf.id} className={`glass-panel border ${wf.color} hover:-translate-y-0.5 transition-all duration-200`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${wf.color}`}>
                      <wf.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">{wf.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[9px]">{wf.layer}</Badge>
                        <Badge variant="outline" className={`text-[9px] ${wf.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                          {wf.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{wf.desc}</p>
                <div className="space-y-1.5 pt-1 border-t border-border/30">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="font-medium">Trigger:</span> {wf.trigger}
                  </div>
                  <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    <span className="italic">{wf.aiCapability}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 4: Analytics & Decision Support ─────────────────────────────────────
function AnalyticsTab() {
  const { data: evidenceStats } = useQuery<any>({ queryKey: ["/api/evidence"] });
  const { data: featureStats } = useQuery<any>({ queryKey: ["/api/features/stats"] });
  const { data: fusionStats } = useQuery<any>({ queryKey: ["/api/attention/fusion-stats"] });

  const [askText, setAskText] = useState("");
  const [decision, setDecision] = useState<AgentResult | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleDecisionSupport = async () => {
    if (!askText.trim()) return;
    setIsAsking(true);
    setDecision(null);
    try {
      const res = await apiRequest("POST", "/api/agent/run", {
        layer: "system",
        taskId: "system.health_check",
        query: askText.trim(),
      });
      const data = await res.json();
      setDecision(data);
    } catch {}
    setIsAsking(false);
  };

  const METRICS = [
    { label: "Evidence Files",     icon: Package,      value: Array.isArray(evidenceStats) ? evidenceStats.length : "—",                color: "text-blue-400",    bg: "bg-blue-500/10" },
    { label: "Vectors Indexed",    icon: Cpu,          value: featureStats?.totalChunkEmbeddings ?? "—",                                 color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Embedding Coverage", icon: BarChart3,    value: featureStats ? `${featureStats.embeddingCoveragePct}%` : "—",              color: "text-amber-400",   bg: "bg-amber-500/10" },
    { label: "HITL Decisions",     icon: Users,        value: fusionStats?.human?.count ?? "—",                                         color: "text-rose-400",    bg: "bg-rose-500/10" },
    { label: "KG Nodes + Edges",   icon: Network,      value: fusionStats?.graph?.count ?? "—",                                         color: "text-pink-400",    bg: "bg-pink-500/10" },
    { label: "Resolved Conflicts", icon: CheckCircle2, value: fusionStats?.conflicts?.count ?? "—",                                     color: "text-violet-400",  bg: "bg-violet-500/10" },
  ];

  const AI_CAPABILITIES = [
    { before: "Manual document sorting",      after: "Zero-shot AI document classification",     impact: "95% faster" },
    { before: "Human field extraction",       after: "AI-powered vision + NER extraction",       impact: "10× throughput" },
    { before: "Manual entity deduplication",  after: "Embedding-based entity resolution",        impact: "99% accuracy" },
    { before: "Spot-check quality reviews",   after: "Continuous AI trust score monitoring",     impact: "100% coverage" },
    { before: "Manual dataset documentation", after: "AI-generated dataset cards + lineage",     impact: "Zero effort" },
    { before: "Static relationship mapping",  after: "Live knowledge graph inference",           impact: "Instant updates" },
  ];

  return (
    <div className="space-y-6">
      {/* Live metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {METRICS.map(m => (
          <Card key={m.label} className="glass-panel border-0 hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center flex-shrink-0`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-xl font-bold">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Decision Support */}
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> AI Decision Support
          </CardTitle>
          <CardDescription className="text-xs">
            Describe a decision or challenge. The AI Agent analyses your live system state and provides grounded recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              placeholder="e.g. 'Should I publish the current dataset?' or 'How should I prioritize the validation queue?'"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              rows={3}
              className="flex-1 text-sm resize-none"
              data-testid="textarea-decision-support"
            />
          </div>
          <Button onClick={handleDecisionSupport} disabled={!askText.trim() || isAsking} className="gap-2" data-testid="button-get-decision">
            {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            Get AI Recommendation
          </Button>
          {decision && (
            <div className="bg-muted/30 rounded-xl p-4 space-y-2 border border-border/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold">AI Recommendation</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{decision.output}</p>
              {decision.suggestions.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border/30">
                  {decision.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[9px] shrink-0 bg-primary/5 text-primary border-primary/20">{i + 1}</Badge>
                      <span>{s.replace(/^\d+\.\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Capability Transformation table */}
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> AI Capability Transformation
          </CardTitle>
          <CardDescription className="text-xs">How AI at scale has transformed each pipeline stage.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  {["Before AI", "After AI (Scale Adoption)", "Impact"].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AI_CAPABILITIES.map((row, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{row.before}</td>
                    <td className="py-2.5 px-4 text-xs font-medium">{row.after}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{row.impact}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: System Overview ────────────────────────────────────────────────────
function SystemOverviewTab() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Layer 9 orchestrates the entire ADRS pipeline — surfacing AI applications, agentic workflows, and intelligence across all 8 underlying layers.
      </p>

      {/* Layer pipeline diagram */}
      <div className="space-y-2">
        {LAYERS.map((l, i) => {
          const colorParts = l.color.split(" ");
          const gradient = colorParts[0] ?? "from-primary/20";
          const border   = colorParts[1] ?? "border-primary/20";
          const textCol  = colorParts[2] ?? "text-primary";
          return (
            <div key={l.id} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl border bg-gradient-to-br ${gradient} to-background/5 ${border} flex items-center justify-center flex-shrink-0`}>
                <l.icon className={`w-4 h-4 ${textCol}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold">Layer {l.num}: {l.label}</span>
                  <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
                </div>
              </div>
              {i < LAYERS.length - 1 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 hidden md:block" />
              )}
            </div>
          );
        })}
        {/* Layer 9 special */}
        <div className="flex items-center gap-3 mt-2">
          <div className="w-8 h-8 rounded-xl border bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary">Layer 9: AI Applications & Agentic Layer</span>
              <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">You are here</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Agent capability summary */}
      <Card className="glass-panel border-0 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> 23 AI Agents Across All Layers
          </CardTitle>
          <CardDescription className="text-xs">Every layer has dedicated AI agents that automate tasks previously requiring human expertise.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { layer: "L1–2", label: "Ingestion & Extraction", count: 6 },
              { layer: "L3–4", label: "CDM & Features",         count: 5 },
              { layer: "L5–6", label: "Fusion & Validation",    count: 5 },
              { layer: "L7–9", label: "Graph, Publish & System",count: 7 },
            ].map(g => (
              <div key={g.layer} className="space-y-1 text-center p-3 rounded-xl bg-background/30">
                <p className="text-xs font-bold text-primary font-mono">{g.layer}</p>
                <p className="text-2xl font-bold">{g.count}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{g.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentLayer() {
  const [activeTab, setActiveTab] = useState("hub");

  const { data: insights } = useQuery<SystemInsights>({ queryKey: ["/api/agent/insights"] });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">AI Applications &amp; Agentic Layer</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Layer 9 — Agent Hub, RAG Explorer, Workflow Automation, Decision Support &amp; System Analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {insights && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">{insights.score}/100</span>
              <span className="text-[10px] text-muted-foreground">health</span>
            </div>
          )}
          <Badge variant="outline" className="text-xs gap-1.5 border-primary/30 text-primary bg-primary/5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            23 Agents Active
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass-panel border-0 p-1 h-auto flex-wrap gap-1">
          <TabsTrigger value="hub"       className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Bot className="w-3 h-3" />Agent Hub</TabsTrigger>
          <TabsTrigger value="rag"       className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><MessageSquare className="w-3 h-3" />RAG Explorer</TabsTrigger>
          <TabsTrigger value="workflows" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Workflow className="w-3 h-3" />Workflow Automation</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><BarChart3 className="w-3 h-3" />Analytics & Decisions</TabsTrigger>
          <TabsTrigger value="overview"  className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Layers className="w-3 h-3" />System Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="hub"       className="mt-5"><AgentHubTab /></TabsContent>
        <TabsContent value="rag"       className="mt-5"><RagExplorerTab /></TabsContent>
        <TabsContent value="workflows" className="mt-5"><WorkflowTab /></TabsContent>
        <TabsContent value="analytics" className="mt-5"><AnalyticsTab /></TabsContent>
        <TabsContent value="overview"  className="mt-5"><SystemOverviewTab /></TabsContent>
      </Tabs>
    </div>
  );
}
