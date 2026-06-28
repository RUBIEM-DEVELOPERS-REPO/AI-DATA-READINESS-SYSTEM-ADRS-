import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, X, ChevronRight, Sparkles, Loader2, CheckCircle2,
  RefreshCw, Send, Layers,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AgentTask {
  id: string; label: string; description: string; layer: string; icon: string;
}

interface AgentResult {
  taskId: string; layer: string; output: string; suggestions: string[];
}

// ─── Route → Layer mapping ─────────────────────────────────────────────────────
const ROUTE_LAYER: Record<string, string> = {
  "/":                      "system",
  "/dashboard":             "system",
  "/evidence":              "evidence",
  "/intelligence":          "intelligence",
  "/cdm":                   "cdm",
  "/validation":            "validation",
  "/feature-representation":"feature",
  "/intelligence-layer":    "attention",
  "/kg-visualizer":         "graph",
  "/publishing":            "publishing",
  "/agent-layer":           "system",
  "/evaluate":              "system",
  "/catalogue":             "system",
};

const LAYER_META: Record<string, { label: string; color: string; bg: string }> = {
  evidence:     { label: "Layer 1 · Evidence",           color: "text-blue-400",    bg: "bg-blue-500/10" },
  intelligence: { label: "Layer 2 · Intelligence",       color: "text-violet-400",  bg: "bg-violet-500/10" },
  cdm:          { label: "Layer 3 · CDM",                color: "text-amber-400",   bg: "bg-amber-500/10" },
  validation:   { label: "Layer 6 · Validation",         color: "text-rose-400",    bg: "bg-rose-500/10" },
  feature:      { label: "Layer 4 · Feature Store",      color: "text-emerald-400", bg: "bg-emerald-500/10" },
  attention:    { label: "Layer 5 · Attention",          color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  graph:        { label: "Layer 7 · Knowledge Graph",    color: "text-pink-400",    bg: "bg-pink-500/10" },
  publishing:   { label: "Layer 8 · Publishing",         color: "text-orange-400",  bg: "bg-orange-500/10" },
  system:       { label: "System · All Layers",          color: "text-primary",     bg: "bg-primary/10" },
};

// ─── Main AgentAssist Component ───────────────────────────────────────────────
export function AgentAssist() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);

  // Determine active layer from route
  const layer = ROUTE_LAYER[location] ?? "system";
  const meta  = LAYER_META[layer] ?? LAYER_META.system;

  // Fetch tasks for this layer
  const { data: tasksData } = useQuery<{ tasks: AgentTask[] }>({
    queryKey: ["/api/agent/tasks", layer],
    queryFn: () => fetch(`/api/agent/tasks?layer=${layer}`, { credentials: "include" }).then(r => r.json()),
    enabled: isOpen,
  });

  // Run agent task
  const { isPending, mutate: runTask } = useMutation<AgentResult, Error, { taskId: string; query?: string }>({
    mutationFn: ({ taskId, query: q }) =>
      fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ layer, taskId, query: q }),
      }).then(r => r.json()),
    onSuccess: (data) => setResult(data),
  });

  const handleRun = (task: AgentTask) => {
    setSelectedTask(task);
    setResult(null);
    runTask({ taskId: task.id, query: query || undefined });
  };

  const handleReset = () => {
    setSelectedTask(null);
    setResult(null);
    setQuery("");
  };

  const tasks = tasksData?.tasks ?? [];

  return (
    <>
      {/* Floating Trigger — bottom-left, opposite side from copilot */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 h-14 w-14 rounded-full shadow-2xl bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 hover:scale-105 transition-all duration-300 z-50 flex items-center justify-center group"
          title="AI Agent Assist"
          data-testid="button-agent-assist-open"
        >
          <Bot className="h-6 w-6 text-white absolute group-hover:opacity-0 transition-opacity" />
          <Sparkles className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity absolute" />
        </Button>
      )}

      {/* Agent Panel */}
      <Card
        className={`fixed bottom-6 left-6 w-80 sm:w-[380px] shadow-2xl flex flex-col z-50 overflow-hidden border border-border/50 backdrop-blur-sm transition-all duration-300 origin-bottom-left max-h-[85vh] ${
          isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 p-4 flex items-center justify-between text-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">AI Agent Assist</p>
              <p className="text-[10px] text-white/70 leading-tight">{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {result && (
              <Button variant="ghost" size="icon" onClick={handleReset} className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            {/* Current layer badge */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${meta.bg}`}>
              <Layers className={`w-3.5 h-3.5 ${meta.color}`} />
              <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{tasks.length} agents</span>
            </div>

            {/* Task list or result */}
            {!result && !isPending && (
              <>
                {/* Optional context input */}
                <div>
                  <Textarea
                    placeholder="Optional: add context or a specific question for the agent…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                    data-testid="textarea-agent-context"
                  />
                </div>

                {tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">Loading agents…</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Available Agents</p>
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleRun(task)}
                        data-testid={`button-agent-task-${task.id}`}
                        className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all duration-150 group"
                      >
                        <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-emerald-500/20 transition-colors">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-tight">{task.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{task.description}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 group-hover:text-emerald-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Loading */}
            {isPending && (
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">Agent running…</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{selectedTask?.label}</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && !isPending && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">{selectedTask?.label}</p>
                    <p className="text-[10px] text-muted-foreground">Agent response</p>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{result.output}</p>
                </div>
                {result.suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Key Recommendations</p>
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5 bg-emerald-500/5 text-emerald-400 border-emerald-500/20">{i + 1}</Badge>
                        <span className="text-muted-foreground leading-relaxed">{s.replace(/^\d+\.\s*/, "")}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={handleReset} className="w-full text-xs gap-2 h-8">
                  <RefreshCw className="w-3 h-3" /> Run another agent
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </>
  );
}
