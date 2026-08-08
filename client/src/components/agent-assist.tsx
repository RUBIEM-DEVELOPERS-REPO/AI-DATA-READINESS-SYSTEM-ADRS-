import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, X, ChevronRight, Sparkles, Loader2, CheckCircle2,
  RefreshCw, Layers, AlertCircle,
} from "lucide-react";
import { getCsrfToken } from "@/lib/queryClient";
import { resolveLayer } from "@/lib/agent-layers";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AgentTask {
  id: string; label: string; description: string; layer: string; icon: string;
}

interface AgentResult {
  taskId: string; layer: string; output: string; suggestions: string[];
}

interface AgentAssistProps {
  title?: string;
  subtitle?: string;
  initialMessage?: string;
  layerOverride?: string;
  layerLabel?: string;
}

// ─── Route → Layer mapping ─────────────────────────────────────────────────────

const LAYER_META: Record<string, { label: string; color: string; bg: string }> = {
  evidence:     { label: "Evidence",                    color: "text-blue-400",    bg: "bg-blue-500/10" },
  intelligence: { label: "Intelligence",                color: "text-violet-400",  bg: "bg-violet-500/10" },
  cdm:          { label: "CDM",                         color: "text-amber-400",   bg: "bg-amber-500/10" },
  validation:   { label: "Validation",                 color: "text-rose-400",    bg: "bg-rose-500/10" },
  feature:      { label: "Feature Store",              color: "text-emerald-400", bg: "bg-emerald-500/10" },
  attention:    { label: "Context Intelligence",       color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  graph:        { label: "Knowledge Graph",            color: "text-pink-400",    bg: "bg-pink-500/10" },
  publishing:   { label: "Publishing",                 color: "text-orange-400",  bg: "bg-orange-500/10" },
  system:       { label: "System · All Workspaces",    color: "text-primary",     bg: "bg-primary/10" },
};

const BTN_SIZE = 56; // px — explicit size to avoid Tailwind custom class issues

// ─── Main AgentAssist Component ───────────────────────────────────────────────
export function AgentAssist({
  title = "AI Agent Assist",
  subtitle = "Workflow automation",
  initialMessage,
  layerOverride,
  layerLabel,
}: AgentAssistProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Position stored as viewport top-left offsets
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Initialize after mount so window dimensions are available
  useEffect(() => {
    setPos({
      x: window.innerWidth - BTN_SIZE - 24,
      y: window.innerHeight - BTN_SIZE - 24 - BTN_SIZE - 16, // above copilot button
    });
  }, []);

  // Clamp on resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        return {
          x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, prev.x)),
          y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, prev.y)),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !pos) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = pos.x;
    const initY = pos.y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, initX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, initY + dy)),
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!moved) setIsOpen((v) => !v);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!pos) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const initX = pos.x;
    const initY = pos.y;
    let moved = false;

    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, initX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, initY + dy)),
      });
    };

    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      if (!moved) setIsOpen((v) => !v);
    };

    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
  };

  const getCardStyle = (): React.CSSProperties => {
    if (!pos) return { display: "none" };
    const cardW = window.innerWidth < 640 ? 320 : 380;
    const cardH = Math.min(520, window.innerHeight - 40);
    let left = pos.x + BTN_SIZE - cardW;
    let top = pos.y - cardH - 12;
    if (left < 12) left = 12;
    if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
    if (top < 12) top = pos.y + BTN_SIZE + 12;
    if (top + cardH > window.innerHeight - 12) top = window.innerHeight - cardH - 12;
    return { left: `${left}px`, top: `${top}px`, height: `${cardH}px`, maxHeight: `${cardH}px` };
  };

  // Determine active layer from route or explicit portal override
  const layer = layerOverride ?? resolveLayer(location);
  const meta  = LAYER_META[layer] ?? LAYER_META.system;

  // Fetch tasks for this layer
  const { data: tasksData } = useQuery<{ tasks: AgentTask[] }>({
    queryKey: ["/api/agent/tasks", layer],
    queryFn: () => fetch(`/api/agent/tasks?layer=${layer}`, { credentials: "include" }).then(r => r.json()),
    enabled: isOpen,
  });

  // Run agent task
  const { isPending, mutate: runTask } = useMutation<AgentResult, Error, { taskId: string; query?: string }>({
    mutationFn: async ({ taskId, query: q }) => {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": await getCsrfToken() },
        credentials: "include",
        body: JSON.stringify({ layer, taskId, query: q }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error ?? data?.detail ?? `Agent task failed (HTTP ${response.status})`);
      }
      if (typeof data?.output !== "string") {
        throw new Error("Agent returned an empty response. The AI service may be unavailable.");
      }
      return data as AgentResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setRunError(null);
    },
    onError: (err) => {
      setResult(null);
      setRunError(err?.message ?? "Agent task failed. Please try again.");
    },
  });

  const handleRun = (task: AgentTask) => {
    setSelectedTask(task);
    setResult(null);
    setRunError(null);
    runTask({ taskId: task.id, query: query || undefined });
  };

  const handleReset = () => {
    setSelectedTask(null);
    setResult(null);
    setRunError(null);
    setQuery("");
  };

  const tasks = tasksData?.tasks ?? [];

  if (!pos) return null;

  return (
    <>
      {/* Floating Draggable Button */}
      <button
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          position: "fixed",
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${BTN_SIZE}px`,
          height: `${BTN_SIZE}px`,
          zIndex: 9999,
          borderRadius: "50%",
          background: isOpen
            ? "linear-gradient(135deg, #065f46, #0f766e)"
            : "linear-gradient(135deg, #059669, #0d9488)",
          boxShadow: "0 8px 32px rgba(16,185,129,0.4), 0 2px 8px rgba(0,0,0,0.18)",
          border: "none",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          touchAction: "none",
          transition: "box-shadow 0.2s, transform 0.15s",
          outline: "3px solid rgba(255,255,255,0.18)",
        }}
        title="AI Agent Assist — drag to move, click to open"
        data-testid="button-agent-assist-open"
        aria-label="Toggle AI Agent Assist"
      >
        {isOpen ? (
          <X size={24} color="white" />
        ) : (
          <>
            <Bot size={22} color="white" style={{ position: "absolute" }} />
            {/* Pulse ring */}
            <span style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              border: "2px solid rgba(16,185,129,0.4)",
              animation: "agent-pulse 2.4s ease-in-out infinite",
              pointerEvents: "none",
            }} />
          </>
        )}
      </button>

      {/* Agent Panel */}
      <Card
        style={{ ...getCardStyle(), zIndex: 9998, position: "fixed" }}
        className={`w-80 sm:w-[380px] shadow-2xl flex flex-col overflow-hidden border border-emerald-200/30 dark:border-emerald-900/40 backdrop-blur-sm transition-all duration-200 transform ${
          isOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
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
              <span className={`text-xs font-semibold ${meta.color}`}>{layerLabel ?? meta.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{tasks.length} agents</span>
            </div>

            {initialMessage && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <p className="text-[10px] leading-relaxed text-muted-foreground">{initialMessage}</p>
              </div>
            )}

            {/* Task list or result */}
            {!result && !isPending && !runError && (
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

            {/* Run error */}
            {runError && !isPending && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">{selectedTask?.label ?? "Agent Assist"}</p>
                    <p className="text-[10px] text-muted-foreground">Task could not be completed</p>
                  </div>
                </div>
                <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-3">
                  <p className="text-xs leading-relaxed text-red-400 whitespace-pre-wrap">{runError}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset} className="w-full text-xs gap-2 h-8">
                  <RefreshCw className="w-3 h-3" /> Try again
                </Button>
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
                {(result.suggestions?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Key Recommendations</p>
                    {(result.suggestions ?? []).map((s, i) => (
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

      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.2); }
        }
      `}</style>
    </>
  );
}
