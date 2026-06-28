import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Cpu, Database, FileText, Search, Zap, Layers, BarChart3,
  Hash, Clock, ChevronLeft, ChevronRight, Sparkles, Network,
  ArrowRight, Box, Tag, Binary,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FeatureStats {
  totalChunkEmbeddings: number;
  totalEntityEmbeddings: number;
  totalEvidenceFiles: number;
  totalExtractionRuns: number;
  embeddingCoveragePct: number;
  vectorDimensions: number;
  modelVersion: string;
  avgTokenCount: number;
  maxTokenCount: number;
  totalTokensIndexed: number;
  modelBreakdown: { model: string; count: number }[];
}

interface ChunkRow {
  id: string;
  evidenceId: string;
  modelVersion: string;
  tokenCount: number;
  createdAt: string;
  fileName: string | null;
  fileFormat: string | null;
  chunkText: string | null;
}

interface EntityRow {
  id: string;
  entityId: string;
  modelVersion: string;
  createdAt: string;
  displayName: string | null;
  entityType: string | null;
  confidence: number | null;
}

interface SearchResult {
  score: number;
  text: string;
  fileName: string;
  fileFormat: string;
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card className={`glass-panel border bg-gradient-to-br ${color} hover:-translate-y-1 transition-all duration-300`}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-background/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function EntityTypeBadge({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    PERSON:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ORGANIZATION: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    DOCUMENT:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
    TRANSACTION:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    ASSET:        "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${colors[type ?? ""] ?? "bg-muted text-muted-foreground"}`}>
      {type ?? "—"}
    </Badge>
  );
}

// ─── Tab 1: Feature Metadata ────────────────────────────────────────────────────
function FeatureMetadataTab({ stats }: { stats: FeatureStats | undefined }) {
  if (!stats) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  const FEATURE_TYPES = [
    {
      icon: FileText, label: "Text Embeddings",
      color: "from-blue-500/20 to-blue-600/5 border-blue-500/20",
      desc: "384-dim dense vectors via all-MiniLM-L6-v2. Used for semantic search, RAG, and similarity ranking.",
      status: "ACTIVE", detail: `${stats.totalChunkEmbeddings} chunks indexed`,
    },
    {
      icon: Network, label: "Entity Embeddings",
      color: "from-purple-500/20 to-purple-600/5 border-purple-500/20",
      desc: "CDM entity vectors generated from concatenated canonical fields. Used for entity resolution and KG traversal.",
      status: "ACTIVE", detail: `${stats.totalEntityEmbeddings} entities embedded`,
    },
    {
      icon: Clock, label: "Temporal Features",
      color: "from-amber-500/20 to-amber-600/5 border-amber-500/20",
      desc: "Date/time fields normalised into ISO-8601. Day-of-week, month, year-quarter extracted as structured features.",
      status: "ACTIVE", detail: "Extracted from attributes",
    },
    {
      icon: Zap, label: "Transaction Features",
      color: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
      desc: "Amount, currency, invoice number, bank account — weighted ×1.5 in the Financial extraction profile.",
      status: "ACTIVE", detail: "Financial profile weighted",
    },
    {
      icon: Box, label: "Relationship Features",
      color: "from-rose-500/20 to-rose-600/5 border-rose-500/20",
      desc: "KG edge types (ISSUED_BY, SUBJECT_OF, etc.) encoded as one-hot features. Node degree and centrality included.",
      status: "KG-DERIVED", detail: "From knowledge graph edges",
    },
    {
      icon: Binary, label: "Graph Embeddings",
      color: "from-cyan-500/20 to-cyan-600/5 border-cyan-500/20",
      desc: "Structural feature vector: in-degree, out-degree, neighbour entity types, edge diversity score.",
      status: "STRUCTURAL", detail: "Node2vec-style structural vectors",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" /> Embedding Model Schema
          </CardTitle>
          <CardDescription className="text-xs">Active vector model configuration and index statistics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {[
              { k: "Model",               v: stats.modelVersion },
              { k: "Dimensions",          v: stats.vectorDimensions },
              { k: "Distance Metric",     v: "Cosine (pgvector)" },
              { k: "Index Type",          v: "HNSW ivfflat" },
              { k: "Avg Tokens/Chunk",    v: stats.avgTokenCount },
              { k: "Max Tokens/Chunk",    v: stats.maxTokenCount },
              { k: "Total Tokens",        v: stats.totalTokensIndexed.toLocaleString() },
              { k: "Embedding Coverage",  v: `${stats.embeddingCoveragePct}%` },
            ].map(({ k, v }) => (
              <div key={k} className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{k}</p>
                <p className="text-sm font-bold font-mono">{v}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Embedding Coverage</p>
              <span className="text-xs font-bold text-primary">{stats.embeddingCoveragePct}%</span>
            </div>
            <Progress value={stats.embeddingCoveragePct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1.5">{stats.embeddingCoveragePct}% of extraction runs have indexed chunk vectors in pgvector</p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Feature Type Registry
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {FEATURE_TYPES.map((ft) => (
            <Card key={ft.label} className={`glass-panel border bg-gradient-to-br ${ft.color} hover:-translate-y-1 transition-all duration-300`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-xl bg-background/30 flex items-center justify-center flex-shrink-0">
                    <ft.icon className="w-4 h-4" />
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-background/20 shrink-0">{ft.status}</Badge>
                </div>
                <div>
                  <p className="text-sm font-bold">{ft.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{ft.desc}</p>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground border-t border-border/30 pt-2">{ft.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Feature Store ──────────────────────────────────────────────────────
function FeatureStoreTab() {
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading } = useQuery<{ chunks: ChunkRow[]; total: number; page: number }>({
    queryKey: ["/api/features/chunks", page],
    queryFn: () => fetch(`/api/features/chunks?page=${page}&limit=${limit}`, { credentials: "include" }).then(r => r.json()),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data ? `${data.total.toLocaleString()} chunk embedding vectors` : "Loading…"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0">
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7 w-7 p-0">
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : !data?.chunks.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No chunk embeddings indexed yet</p>
              <p className="text-xs mt-1">Run an extraction on an evidence file to generate vectors.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["ID", "Source File", "Format", "Model", "Tokens", "Text Snippet", "Indexed At"].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.chunks.map((c) => (
                    <tr key={c.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4"><code className="text-[10px] text-muted-foreground font-mono">{c.id.slice(0, 8)}…</code></td>
                      <td className="py-2.5 px-4"><span className="text-xs font-medium truncate max-w-[140px] block">{c.fileName ?? "—"}</span></td>
                      <td className="py-2.5 px-4"><Badge variant="outline" className="text-[10px] uppercase">{c.fileFormat ?? "—"}</Badge></td>
                      <td className="py-2.5 px-4"><Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">{c.modelVersion}</Badge></td>
                      <td className="py-2.5 px-4"><span className="text-xs font-mono">{c.tokenCount}</span></td>
                      <td className="py-2.5 px-4 max-w-[220px]"><p className="text-[11px] text-muted-foreground truncate">{c.chunkText ?? "—"}</p></td>
                      <td className="py-2.5 px-4"><span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 3: Entity Embeddings ──────────────────────────────────────────────────
function EntityEmbeddingsTab() {
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading } = useQuery<{ entities: EntityRow[]; total: number }>({
    queryKey: ["/api/features/entities", page],
    queryFn: () => fetch(`/api/features/entities?page=${page}&limit=${limit}`, { credentials: "include" }).then(r => r.json()),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data ? `${data.total} entity embedding vectors stored` : "Loading…"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0">
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7 w-7 p-0">
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : !data?.entities.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Network className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No entity embeddings found</p>
              <p className="text-xs mt-1">Run CDM entity resolution to generate entity vectors.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Entity Name", "Type", "Model", "Confidence", "Embedding ID", "Created"].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.entities.map((e) => (
                    <tr key={e.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4"><span className="text-xs font-semibold">{e.displayName ?? "—"}</span></td>
                      <td className="py-2.5 px-4"><EntityTypeBadge type={e.entityType} /></td>
                      <td className="py-2.5 px-4"><Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">{e.modelVersion}</Badge></td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <Progress value={(e.confidence ?? 0) * 100} className="h-1.5 w-16" />
                          <span className="text-xs font-mono">{Math.round((e.confidence ?? 0) * 100)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4"><code className="text-[10px] text-muted-foreground font-mono">{e.id.slice(0, 8)}…</code></td>
                      <td className="py-2.5 px-4"><span className="text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: Semantic Search Playground ────────────────────────────────────────
function SemanticSearchTab() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isPending, mutate } = useMutation<{ results: SearchResult[]; count: number }, Error, string>({
    mutationFn: (q: string) =>
      apiRequest("POST", "/api/features/search", { query: q, limit: 10 }).then(r => r.json()),
  });

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
    mutate(q);
  };

  const scoreColor = (s: number) => {
    if (s >= 0.8) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (s >= 0.6) return "text-blue-400 border-blue-500/30 bg-blue-500/10";
    if (s >= 0.4) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-rose-400 border-rose-500/30 bg-rose-500/10";
  };

  return (
    <div className="space-y-5">
      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" /> RAG Semantic Search Playground
          </CardTitle>
          <CardDescription className="text-xs">
            Enter a natural language query. The system embeds it via all-MiniLM-L6-v2 and retrieves the most
            semantically similar chunks from the indexed corpus using cosine distance via pgvector.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. invoice total amount, employee name, company registration number…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 text-sm"
              data-testid="input-semantic-search"
            />
            <Button onClick={handleSearch} disabled={!query.trim() || isPending} className="gap-2" data-testid="button-semantic-search">
              {isPending ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-muted-foreground">Try:</span>
            {["invoice total amount", "employee national ID", "company registration", "contract signature date"].map(ex => (
              <button key={ex} onClick={() => setQuery(ex)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border/50 hover:border-primary/30 hover:text-primary transition-colors text-muted-foreground">
                {ex}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {submitted && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">
              {isPending ? "Embedding & searching…" : `${data?.count ?? 0} results for "${submitted}"`}
            </p>
            {!isPending && data && data.count > 0 && (
              <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">pgvector cosine similarity</Badge>
            )}
          </div>
          {isPending ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : !data?.results.length ? (
            <Card className="glass-panel border-0">
              <CardContent className="flex flex-col items-center py-12 gap-3">
                <Search className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No results found</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">No indexed chunks match this query. Ingest and process documents first.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.results.map((r, i) => (
                <Card key={i} className="glass-panel border-0 hover:-translate-y-0.5 transition-all duration-200">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">#{i + 1}</span>
                        </div>
                        <span className="text-xs font-semibold">{r.fileName}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{r.fileFormat}</Badge>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-mono ${scoreColor(r.score)}`}>
                        {(r.score * 100).toFixed(1)}% match
                      </Badge>
                    </div>
                    <Progress value={r.score * 100} className="h-1" />
                    <p className="text-xs text-muted-foreground leading-relaxed font-mono bg-muted/30 rounded-lg p-3 line-clamp-4">
                      {r.text}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 5: Feature Engineering Pipeline ──────────────────────────────────────
function FeatureEngineeringTab({ stats }: { stats: FeatureStats | undefined }) {
  const steps = [
    { icon: FileText,   label: "Raw Text Extraction",    color: "border-blue-500/30 bg-blue-500/5",    desc: "OCR / Vision / Whisper transcription produces raw text stored in extraction_texts.",              metric: stats ? `${stats.totalExtractionRuns} runs` : "—" },
    { icon: Cpu,        label: "Chunking & Tokenisation", color: "border-purple-500/30 bg-purple-500/5", desc: "Text segmented into overlapping chunks. Token count tracked for context-window management.",     metric: stats ? `avg ${stats.avgTokenCount} tokens` : "—" },
    { icon: Hash,       label: "Vector Embedding",        color: "border-amber-500/30 bg-amber-500/5",  desc: "Each chunk passes through all-MiniLM-L6-v2 → 384-dim unit vector via mean pooling + normalise.", metric: `${stats?.vectorDimensions ?? 384}D vectors` },
    { icon: Database,   label: "pgvector Indexing",       color: "border-emerald-500/30 bg-emerald-500/5", desc: "Vectors stored in chunk_embeddings. HNSW index enables sub-millisecond approximate NN search.", metric: stats ? `${stats.totalChunkEmbeddings.toLocaleString()} indexed` : "—" },
    { icon: Network,    label: "Entity Vectorisation",    color: "border-rose-500/30 bg-rose-500/5",    desc: "CDM entities embedded from canonical fields → stored in entity_embeddings for resolution & KG.",  metric: stats ? `${stats.totalEntityEmbeddings} entities` : "—" },
    { icon: Sparkles,   label: "Relevance Weighting",     color: "border-cyan-500/30 bg-cyan-500/5",    desc: "Profile-specific weights applied. Financial fields ×1.5, Identity fields ×2.0 via attention.ts.", metric: "3 active profiles" },
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        End-to-end feature engineering pipeline: from raw evidence text to indexed vectors ready for semantic search, RAG, and ML training.
      </p>
      <div className="space-y-3 relative">
        <div className="absolute left-7 top-8 bottom-8 w-px bg-border/40 z-0" />
        {steps.map((s, i) => (
          <div key={s.label} className="flex gap-4">
            <div className="z-10 flex-shrink-0">
              <div className={`w-14 h-14 rounded-2xl border ${s.color} flex flex-col items-center justify-center gap-1 shadow-sm bg-background`}>
                <s.icon className="w-5 h-5" />
                <span className="text-[9px] font-bold text-muted-foreground">{i + 1}</span>
              </div>
            </div>
            <Card className={`flex-1 glass-panel border ${s.color} hover:-translate-y-0.5 transition-all duration-200`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 font-mono">{s.metric}</Badge>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FeatureRepresentation() {
  const [activeTab, setActiveTab] = useState("metadata");

  const { data: stats } = useQuery<FeatureStats>({
    queryKey: ["/api/features/stats"],
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">AI Feature &amp; Representation</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Layer 4 — Vectorisation, embedding store, semantic search &amp; feature engineering pipeline.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5 border-amber-500/30 text-amber-400 bg-amber-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          all-MiniLM-L6-v2 · 384D · pgvector
        </Badge>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Database}    label="Chunk Vectors"   value={stats?.totalChunkEmbeddings ?? "—"}               sub="Text embeddings indexed"         color="from-blue-500/10 to-blue-600/5 border-blue-500/15"     />
        <StatCard icon={Network}     label="Entity Vectors"  value={stats?.totalEntityEmbeddings ?? "—"}              sub="CDM entity embeddings"           color="from-purple-500/10 to-purple-600/5 border-purple-500/15"/>
        <StatCard icon={BarChart3}   label="Coverage"        value={stats ? `${stats.embeddingCoveragePct}%` : "—"}   sub="Extraction runs with vectors"    color="from-emerald-500/10 to-emerald-600/5 border-emerald-500/15"/>
        <StatCard icon={Hash}        label="Tokens Indexed"  value={stats ? stats.totalTokensIndexed.toLocaleString() : "—"} sub={`avg ${stats?.avgTokenCount ?? 0} per chunk`} color="from-amber-500/10 to-amber-600/5 border-amber-500/15" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass-panel border-0 p-1 h-auto flex-wrap gap-1">
          <TabsTrigger value="metadata"    className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Tag className="w-3 h-3" />Feature Metadata</TabsTrigger>
          <TabsTrigger value="store"       className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Database className="w-3 h-3" />Feature Store</TabsTrigger>
          <TabsTrigger value="entities"    className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Network className="w-3 h-3" />Entity Embeddings</TabsTrigger>
          <TabsTrigger value="search"      className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Search className="w-3 h-3" />Semantic Search</TabsTrigger>
          <TabsTrigger value="engineering" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2"><Layers className="w-3 h-3" />Feature Engineering</TabsTrigger>
        </TabsList>

        <TabsContent value="metadata"    className="mt-5"><FeatureMetadataTab stats={stats} /></TabsContent>
        <TabsContent value="store"       className="mt-5"><FeatureStoreTab /></TabsContent>
        <TabsContent value="entities"    className="mt-5"><EntityEmbeddingsTab /></TabsContent>
        <TabsContent value="search"      className="mt-5"><SemanticSearchTab /></TabsContent>
        <TabsContent value="engineering" className="mt-5"><FeatureEngineeringTab stats={stats} /></TabsContent>
      </Tabs>
    </div>
  );
}
