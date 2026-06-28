import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain, Zap, GitBranch, Shield, CheckCircle2, Database,
  FileText, Users, Share2, AlertTriangle, Layers, Network,
  ChevronRight, FlaskConical, Puzzle, Info, PackageOpen,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ProfileStat {
  id: string; name: string; count: number; pct: number;
  avgConf: number; avgTrust: number; docTypes: string[];
}

interface ProfileStats {
  profiles: ProfileStat[];
  totalRuns: number;
}

interface ResolveResult {
  profileId: string; profileName: string; similarityScore: number;
  description: string; targetEntities: string[]; relevanceWeights: Record<string, number>;
}

interface FusionStats {
  structured:   { label: string; count: number; icon: string };
  unstructured: { label: string; count: number; icon: string };
  rules:        { label: string; count: number; icon: string };
  graph:        { label: string; count: number; icon: string };
  human:        { label: string; count: number; icon: string };
  conflicts:    { label: string; count: number; icon: string };
}

interface EvidenceFile { id: string; fileName: string; }
interface ContextPacket {
  evidenceId: string; fileName: string; fileFormat: string; docType: string;
  trustScore: number; structuredFields: any[]; ragChunks: { id: string; snippet: string; tokenCount: number }[];
  graphNodes: { id: string; label: string; displayName: string; confidence: number }[];
  profile: { id: string; name: string; score: number } | null;
  fusedAt: string;
}

// ─── Static Ontology Data ──────────────────────────────────────────────────────
const PROFILES_STATIC = [
  {
    id: "profile-generic",
    name: "Generic Document",
    color: "from-blue-500/20 to-blue-600/5 border-blue-500/20",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    description: "Fallback profile for unclassified documents — correspondence, memos, agreements, policies.",
    targetEntities: ["PERSON", "ORGANIZATION"],
    weights: [{ field: "name", weight: "1.0×" }, { field: "email", weight: "1.0×" }],
  },
  {
    id: "profile-finance",
    name: "Financial Record",
    color: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    description: "Invoices, bank statements, POs, receipts. Monetary amounts, tax numbers, account details.",
    targetEntities: ["ORGANIZATION", "TRANSACTION"],
    weights: [{ field: "amount", weight: "1.5×" }, { field: "invoice_number", weight: "1.5×" }, { field: "bank_account", weight: "1.5×" }],
  },
  {
    id: "profile-hr",
    name: "HR & Employment",
    color: "from-violet-500/20 to-violet-600/5 border-violet-500/20",
    badge: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    description: "CVs, payslips, national IDs, certificates. Personal identifiers, employment history.",
    targetEntities: ["PERSON", "SKILL", "ROLE"],
    weights: [{ field: "national_id", weight: "2.0×" }, { field: "email", weight: "1.5×" }, { field: "phone", weight: "1.2×" }],
  },
];

const ONTOLOGY_AXIOMS = [
  { relationship: "ISSUED_BY",      sources: "DOCUMENT, TRANSACTION",             targets: "ORGANIZATION, PERSON", autoCorrect: "—" },
  { relationship: "ISSUED_TO",      sources: "DOCUMENT, TRANSACTION",             targets: "ORGANIZATION, PERSON", autoCorrect: "—" },
  { relationship: "EMPLOYED_BY",    sources: "PERSON",                            targets: "ORGANIZATION",         autoCorrect: "—" },
  { relationship: "SUBJECT_OF",     sources: "PERSON, ORGANIZATION, ASSET",       targets: "DOCUMENT",             autoCorrect: "MENTIONED_IN" },
  { relationship: "SIGNED_BY",      sources: "DOCUMENT, AGREEMENT, CONTRACT",     targets: "PERSON, ORGANIZATION", autoCorrect: "—" },
  { relationship: "MENTIONED_IN",   sources: "PERSON, ORGANIZATION, TRANSACTION", targets: "DOCUMENT",             autoCorrect: "—" },
];

// ─── Tab 1: Profile Attention ──────────────────────────────────────────────────
function ProfileAttentionTab() {
  const [testText, setTestText] = useState("");
  const { data: profileStats } = useQuery<ProfileStats>({ queryKey: ["/api/attention/profile-stats"] });

  const { data: resolveResult, isPending: isResolving, mutate: resolveProfile } = useMutation<ResolveResult, Error, string>({
    mutationFn: (text: string) => apiRequest("POST", "/api/attention/resolve", { text }).then(r => r.json()),
  });

  const getStatForProfile = (id: string) => profileStats?.profiles.find(p => p.id === id);

  const PROFILE_COLORS: Record<string, string> = {
    "profile-generic":  "border-blue-500/30    bg-blue-500/5    text-blue-400",
    "profile-finance":  "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    "profile-hr":       "border-violet-500/30  bg-violet-500/5  text-violet-400",
  };

  return (
    <div className="space-y-6">
      {/* Profile Cards with live stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROFILES_STATIC.map((p) => {
          const stat = getStatForProfile(p.id);
          return (
            <Card key={p.id} className={`glass-panel border bg-gradient-to-br ${p.color} hover:-translate-y-1 transition-all duration-300`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold">{p.name}</CardTitle>
                  <Badge variant="outline" className={`text-[10px] ${p.badge}`}>
                    {stat ? `${stat.count} runs` : "—"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Target Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {p.targetEntities.map(e => (
                      <Badge key={e} variant="outline" className="text-[10px] bg-background/40">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Relevance Weights</p>
                  <div className="space-y-1">
                    {p.weights.map(w => (
                      <div key={w.field} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{w.field}</span>
                        <span className="font-bold">{w.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {stat && stat.count > 0 && (
                  <div className="space-y-1.5 border-t border-border/30 pt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Avg Conf.</span><span className="font-mono font-bold">{stat.avgConf}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Avg Trust</span><span className="font-mono font-bold">{stat.avgTrust}%</span>
                    </div>
                    <Progress value={stat.pct} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{stat.pct}% of all runs</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live Profile Matching Widget */}
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" /> Live Profile Matching Widget
          </CardTitle>
          <CardDescription className="text-xs">
            Paste any document summary or raw text. The system embeds it and runs zero-shot cosine similarity
            against all profile semantic descriptions to identify the best matching extraction profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Paste a document summary or excerpt, e.g. 'This invoice from Acme Corp details a payment of R45,000 for consulting services, VAT inclusive, dated January 2024…'"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={4}
              className="text-sm resize-none"
              data-testid="textarea-profile-test"
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => resolveProfile(testText)} disabled={!testText.trim() || isResolving} className="gap-2" data-testid="button-resolve-profile">
                {isResolving ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Brain className="w-4 h-4" />}
                Match Profile
              </Button>
              {[
                "Invoice from Acme Corp for R45,000 VAT inclusive consulting services",
                "John Smith, Senior Software Engineer, 5 years experience, national ID 8801015026084",
                "Board resolution approving the sale of property at 12 Oak Street, Sandton",
              ].map((ex, i) => (
                <button key={i} onClick={() => setTestText(ex)}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-border/50 hover:border-primary/30 hover:text-primary transition-colors text-muted-foreground">
                  Example {i + 1}
                </button>
              ))}
            </div>
          </div>

          {resolveResult && (
            <div className={`rounded-xl border p-4 space-y-3 transition-all duration-500 ${PROFILE_COLORS[resolveResult.profileId] ?? "border-border bg-muted/20"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <p className="text-sm font-bold">Matched: {resolveResult.profileName}</p>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {resolveResult.similarityScore}% similarity
                </Badge>
              </div>
              <Progress value={resolveResult.similarityScore} className="h-2" />
              <p className="text-xs text-muted-foreground">{resolveResult.description}</p>
              <div className="flex flex-wrap gap-4 pt-1">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Target Entities</p>
                  <div className="flex gap-1 flex-wrap">
                    {resolveResult.targetEntities.map(e => (
                      <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Relevance Weights</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(resolveResult.relevanceWeights).map(([k, v]) => (
                      <span key={k} className="text-[10px] font-mono text-muted-foreground">{k}: <strong>{v}×</strong></span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Neuro-Symbolic Ontology Engine */}
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <GitBranch className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">Neuro-Symbolic Ontology Engine</CardTitle>
                <CardDescription className="text-xs">SPO axioms enforced on all inferred KG relationships.</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs gap-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Engine Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  {["Relationship", "Allowed Sources", "Allowed Targets", "Auto-Correct To"].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ONTOLOGY_AXIOMS.map((axiom, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20">{axiom.relationship}</Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground font-mono">{axiom.sources}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground font-mono">{axiom.targets}</td>
                    <td className="py-3 px-4">
                      {axiom.autoCorrect === "—"
                        ? <span className="text-xs text-muted-foreground/40">—</span>
                        : <Badge variant="outline" className="font-mono text-[10px] bg-amber-500/5 text-amber-400 border-amber-500/20">{axiom.autoCorrect}</Badge>}
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

// ─── Tab 2: Multi-Source Fusion ────────────────────────────────────────────────
function FusionTab() {
  const { data: fusion, isLoading } = useQuery<FusionStats>({ queryKey: ["/api/attention/fusion-stats"] });

  const FUSION_SOURCES = [
    { key: "structured",   icon: Database,  color: "from-blue-500/20   border-blue-500/20",   label: "Structured Fields",    desc: "Normalised extracted attributes from extraction runs. Includes amounts, dates, names, identifiers." },
    { key: "unstructured", icon: FileText,  color: "from-purple-500/20 border-purple-500/20", label: "RAG Text Chunks",      desc: "Dense vector embeddings of raw document text. Enables semantic search and LLM grounding." },
    { key: "rules",        icon: GitBranch, color: "from-amber-500/20  border-amber-500/20",  label: "Ontology Axioms",      desc: "6 Subject–Predicate–Object axioms from the symbolic reasoner validate all KG relationships." },
    { key: "graph",        icon: Share2,    color: "from-emerald-500/20 border-emerald-500/20",label: "KG Nodes & Edges",    desc: "Live knowledge graph providing relational context. Nodes, edges, and inferred relationship types." },
    { key: "human",        icon: Users,     color: "from-rose-500/20   border-rose-500/20",   label: "HITL Decisions",       desc: "Human-in-the-Loop validated field approvals and corrections that override automated inference." },
    { key: "conflicts",    icon: Zap,       color: "from-cyan-500/20   border-cyan-500/20",   label: "Resolved Conflicts",   desc: "Multi-source field conflicts resolved via confidence comparison or human arbitration." },
  ] as const;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        The Context Packet fuses data from 5 source streams before delivering it to downstream consumers.
        Each source type contributes uniquely to the final AI-ready context.
      </p>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {FUSION_SOURCES.map(({ key, icon: Icon, color, label, desc }) => {
          const stat = fusion?.[key as keyof FusionStats];
          return (
            <Card key={key} className={`glass-panel border bg-gradient-to-br ${color} to-background/5 hover:-translate-y-1 transition-all duration-300`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-background/30 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-bold font-mono">
                    {isLoading ? "…" : (stat?.count ?? 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Context Packet diagram */}
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-primary" /> Context Packet Architecture
          </CardTitle>
          <CardDescription className="text-xs">How the 5 source streams converge into a single fused context packet for AI consumers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-0">
            {/* Inputs */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {["Structured Fields", "RAG Chunks", "Ontology Rules", "KG Graph", "HITL Decisions"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border/50 bg-muted/30 text-muted-foreground font-medium whitespace-nowrap flex-1 text-center">{s}</div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 hidden md:block" />
                </div>
              ))}
            </div>

            {/* Fusion box */}
            <div className="flex flex-col items-center px-4">
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl bg-primary/10 border-2 border-primary/30 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(var(--primary),0.15)] gap-1">
                <Puzzle className="w-6 h-6 text-primary" />
                <span className="text-[9px] font-bold text-primary uppercase tracking-wider text-center leading-tight">Context<br/>Fusion</span>
              </div>
            </div>

            {/* Output */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {["ML Features CSV", "KG Graph JSONL", "RAG Chunks JSONL", "AI Copilot Context", "Dataset Card"].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-primary/50 flex-shrink-0 hidden md:block" />
                  <div className="text-[10px] px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-primary font-medium whitespace-nowrap flex-1 text-center">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 3: Conflict Resolution ────────────────────────────────────────────────
function ConflictResolutionTab() {
  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/validation"],
    select: (data: any) => (Array.isArray(data) ? data.filter((t: any) => t.conflictDetails && t.conflictDetails.length > 0) : []),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Validation tasks with multi-source field conflicts requiring resolution.
        </p>
        <Badge variant="outline" className="text-[10px]">
          {tasks ? `${tasks.length} tasks with conflicts` : "Loading…"}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : !tasks?.length ? (
        <Card className="glass-panel border-0">
          <CardContent className="flex flex-col items-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold">No Active Field Conflicts</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              All multi-source field discrepancies have been resolved or no conflicting evidence has been ingested.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => {
            const conflicts = Array.isArray(task.conflictDetails) ? task.conflictDetails : [];
            return (
              <Card key={task.id} className="glass-panel border-0 hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold">{task.taskCode}</span>
                      <Badge variant="outline" className={`text-[10px] ${task.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                        {task.status}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{conflicts.length} field conflict{conflicts.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {conflicts.slice(0, 3).map((c: any, ci: number) => (
                      <div key={ci} className="flex items-start gap-3 bg-muted/20 rounded-lg p-2.5 text-xs">
                        <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px] shrink-0">{c.field_key}</code>
                        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                          {(c.options ?? []).slice(0, 2).map((opt: any, oi: number) => (
                            <span key={oi} className="text-muted-foreground truncate max-w-[120px]">
                              <span className="text-[10px] text-muted-foreground/60 mr-1">opt{oi + 1}:</span>
                              {String(opt.value).slice(0, 30)}
                            </span>
                          ))}
                        </div>
                        {c.resolved && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">resolved</Badge>}
                      </div>
                    ))}
                    {conflicts.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-2">+{conflicts.length - 3} more conflicts…</p>
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

// ─── Tab 4: Context Packets ────────────────────────────────────────────────────
function ContextPacketsTab() {
  const [selectedId, setSelectedId] = useState("");
  const [inputId, setInputId] = useState("");

  const { data: evidenceList } = useQuery<EvidenceFile[]>({
    queryKey: ["/api/evidence"],
    select: (data: any) => (Array.isArray(data) ? data.map((e: any) => ({ id: e.id, fileName: e.fileName })) : []),
  });

  const { data: packet, isPending: isLoading, mutate: fetchPacket } = useMutation<ContextPacket, Error, string>({
    mutationFn: (id: string) => fetch(`/api/attention/context-packet/${id}`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
  });

  const handleFetch = (id: string) => {
    if (!id.trim()) return;
    setSelectedId(id.trim());
    fetchPacket(id.trim());
  };

  return (
    <div className="space-y-5">
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-primary" /> Context Packet Builder
          </CardTitle>
          <CardDescription className="text-xs">
            Select an evidence file to generate its fused Context Packet — the complete structured, unstructured,
            graph, and profile context assembled by Layer 5.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <select
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); if (e.target.value) handleFetch(e.target.value); }}
              data-testid="select-evidence-context"
            >
              <option value="">— Select an evidence file —</option>
              {evidenceList?.map(e => (
                <option key={e.id} value={e.id}>{e.fileName}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                placeholder="or paste evidence ID…"
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                className="w-56 text-sm h-9"
                data-testid="input-evidence-id"
              />
              <Button size="sm" onClick={() => handleFetch(inputId)} disabled={!inputId.trim() || isLoading} data-testid="button-fetch-packet">
                {isLoading ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : "Build"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      )}

      {packet && !isLoading && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="glass-panel border-0 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-bold">{packet.fileName}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">{packet.fileFormat}</Badge>
                  <Badge variant="outline" className="text-[10px]">{packet.docType}</Badge>
                  {packet.profile && (
                    <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                      {packet.profile.name} · {packet.profile.score}%
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Trust Score</p>
                <p className="text-xl font-bold text-primary">{Math.round(packet.trustScore * 100)}%</p>
              </div>
            </CardContent>
          </Card>

          {/* 3-column fusion view */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Structured Fields */}
            <Card className="glass-panel border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-blue-400" /> Structured Fields
                  <Badge variant="outline" className="text-[10px] ml-auto">{packet.structuredFields.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
                {packet.structuredFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No structured fields extracted.</p>
                ) : packet.structuredFields.map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/20 last:border-0">
                    <code className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded shrink-0">{f.field_key}</code>
                    <span className="text-muted-foreground truncate text-right">{String(f.value_normalized || f.value_raw || "—").slice(0, 25)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* RAG Chunks */}
            <Card className="glass-panel border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-purple-400" /> RAG Chunks
                  <Badge variant="outline" className="text-[10px] ml-auto">{packet.ragChunks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {packet.ragChunks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No chunks indexed for this file.</p>
                ) : packet.ragChunks.map((c, i) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Chunk {i + 1}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{c.tokenCount} tokens</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 bg-muted/20 rounded p-1.5 font-mono">{c.snippet}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Graph Nodes */}
            <Card className="glass-panel border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <Share2 className="w-3 h-3 text-emerald-400" /> Graph Nodes
                  <Badge variant="outline" className="text-[10px] ml-auto">{packet.graphNodes.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
                {packet.graphNodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No linked graph nodes found for this evidence.</p>
                ) : packet.graphNodes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/20 last:border-0">
                    <div>
                      <span className="font-medium">{n.displayName}</span>
                      <Badge variant="outline" className="text-[9px] ml-1.5">{n.label}</Badge>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{Math.round(n.confidence * 100)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="text-[10px] text-muted-foreground text-right">
            Context packet generated at {new Date(packet.fusedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IntelligenceLayer() {
  const [activeTab, setActiveTab] = useState("profiles");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Attention, Fusion &amp; Context</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Layer 5 — Dynamic profile attention, multi-source fusion, conflict resolution &amp; context packet assembly.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Neuro-Symbolic Engine Active
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass-panel border-0 p-1 h-auto flex-wrap gap-1">
          <TabsTrigger value="profiles"   className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Brain className="w-3 h-3" />Profile Attention</TabsTrigger>
          <TabsTrigger value="fusion"     className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Puzzle className="w-3 h-3" />Multi-Source Fusion</TabsTrigger>
          <TabsTrigger value="conflicts"  className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><AlertTriangle className="w-3 h-3" />Conflict Resolution</TabsTrigger>
          <TabsTrigger value="packets"    className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><PackageOpen className="w-3 h-3" />Context Packets</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles"  className="mt-5"><ProfileAttentionTab /></TabsContent>
        <TabsContent value="fusion"    className="mt-5"><FusionTab /></TabsContent>
        <TabsContent value="conflicts" className="mt-5"><ConflictResolutionTab /></TabsContent>
        <TabsContent value="packets"   className="mt-5"><ContextPacketsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
