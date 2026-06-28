import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Bot, Sparkles, Loader2, CheckCircle2, RefreshCw, Zap,
  ChevronDown, ChevronRight, ExternalLink, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AgentTask {
  id: string;
  label: string;
  description: string;
  layer: string;
  icon: string;
}

interface AgentResult {
  taskId: string;
  layer: string;
  output: string;
  suggestions: string[];
}

// ─── Color palette per layer ──────────────────────────────────────────────────
const LAYER_STYLES: Record<string, { gradient: string; badge: string; dot: string; border: string }> = {
  evidence:     { gradient: "from-blue-600 to-blue-700",     badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",     dot: "bg-blue-400",    border: "border-blue-500/20" },
  intelligence: { gradient: "from-violet-600 to-purple-700", badge: "bg-violet-500/10 text-violet-400 border-violet-500/20", dot: "bg-violet-400", border: "border-violet-500/20" },
  cdm:          { gradient: "from-amber-600 to-orange-700",  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",   dot: "bg-amber-400",   border: "border-amber-500/20" },
  feature:      { gradient: "from-emerald-600 to-teal-700",  badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", border: "border-emerald-500/20" },
  attention:    { gradient: "from-cyan-600 to-sky-700",      badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",     dot: "bg-cyan-400",    border: "border-cyan-500/20" },
  validation:   { gradient: "from-rose-600 to-red-700",      badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",     dot: "bg-rose-400",    border: "border-rose-500/20" },
  graph:        { gradient: "from-pink-600 to-fuchsia-700",  badge: "bg-pink-500/10 text-pink-400 border-pink-500/20",     dot: "bg-pink-400",    border: "border-pink-500/20" },
  publishing:   { gradient: "from-orange-600 to-amber-700",  badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400", border: "border-orange-500/20" },
  system:       { gradient: "from-primary to-primary/80",    badge: "bg-primary/10 text-primary border-primary/20",         dot: "bg-primary",     border: "border-primary/20" },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface InlineAgentWidgetProps {
  /** Which ADRS layer to load agent tasks for */
  layer: string;
  /** Human-readable label shown in the header */
  layerLabel: string;
  /** Maximum number of tasks to show (default: 3) */
  maxTasks?: number;
  /** If true the widget starts collapsed (default: false) */
  defaultCollapsed?: boolean;
  /** Optional class override */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function InlineAgentWidget({
  layer,
  layerLabel,
  maxTasks = 3,
  defaultCollapsed = false,
  className = "",
}: InlineAgentWidgetProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AgentResult>>({});
  const [activeResult, setActiveResult] = useState<string | null>(null);

  const style = LAYER_STYLES[layer] ?? LAYER_STYLES.system;

  // Fetch layer-specific tasks
  const { data: tasksData, isLoading } = useQuery<{ tasks: AgentTask[] }>({
    queryKey: ["/api/agent/tasks", layer],
    queryFn: () =>
      fetch(`/api/agent/tasks?layer=${layer}`, { credentials: "include" }).then((r) => r.json()),
    enabled: open,
  });

  const { mutate: runTask } = useMutation<AgentResult, Error, { taskId: string }>({
    mutationFn: ({ taskId }) =>
      fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ layer, taskId }),
      }).then((r) => r.json()),
    onMutate: ({ taskId }) => {
      setRunning(taskId);
      setActiveResult(taskId);
    },
    onSuccess: (data) => {
      setResults((prev) => ({ ...prev, [data.taskId]: data }));
      setRunning(null);
    },
    onError: () => setRunning(null),
  });

  const tasks = (tasksData?.tasks ?? []).slice(0, maxTasks);
  const activeRes = activeResult ? results[activeResult] : null;

  return (
    <Card className={`glass-panel border ${style.border} overflow-hidden ${className}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader
            className={`pb-3 cursor-pointer hover:bg-muted/10 transition-colors`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* Animated glow orb */}
                <div
                  className={`w-8 h-8 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}
                >
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    AI Agent Assist
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-4 ${style.badge}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse mr-1`} />
                      {layerLabel}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5">
                    AI agents with live system context — click to run
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tasks.length > 0 && (
                  <Badge variant="outline" className="text-[10px] hidden sm:flex">
                    {tasks.length} agents
                  </Badge>
                )}
                {open ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {/* Task grid */}
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading agents…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {tasks.map((task) => {
                  const res = results[task.id];
                  const isRunning = running === task.id;
                  const isActive = activeResult === task.id;
                  return (
                    <button
                      key={task.id}
                      onClick={() => runTask({ taskId: task.id })}
                      disabled={!!running}
                      data-testid={`button-inline-agent-${task.id}`}
                      className={`w-full text-left flex items-start gap-2.5 p-3 rounded-xl border transition-all duration-200 group ${
                        isActive && res
                          ? `${style.border} bg-muted/30`
                          : "border-border/40 hover:border-primary/30 hover:bg-muted/20"
                      } ${!!running && !isRunning ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                          res ? "bg-emerald-500/15" : "bg-muted/50 group-hover:bg-primary/10"
                        }`}
                      >
                        {isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : res ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight line-clamp-1">
                          {task.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                          {task.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Result panel */}
            {activeResult && running === activeResult && (
              <div className="flex items-center gap-2.5 bg-muted/20 rounded-xl p-3 border border-border/30">
                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Agent running…</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tasks.find((t) => t.id === activeResult)?.label}
                  </p>
                </div>
              </div>
            )}

            {activeRes && !running && (
              <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold">
                      {tasks.find((t) => t.id === activeResult)?.label}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setActiveResult(null);
                      setResults({});
                    }}
                    title="Clear result"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                    {activeRes.output}
                  </p>
                  {activeRes.suggestions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/20">
                      {activeRes.suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                          <Badge
                            variant="outline"
                            className={`text-[9px] shrink-0 mt-0.5 ${style.badge}`}
                          >
                            {i + 1}
                          </Badge>
                          <span>{s.replace(/^\d+\.\s*/, "")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer: run all + link to agent layer */}
            <div className="flex items-center justify-between pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-primary px-2"
                onClick={() => {
                  if (tasks[0]) runTask({ taskId: tasks[0].id });
                }}
                disabled={!!running || tasks.length === 0}
              >
                <Zap className="w-3 h-3" />
                Quick Run
              </Button>
              <Link href="/agent-layer">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-primary px-2"
                >
                  All 23 Agents
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
