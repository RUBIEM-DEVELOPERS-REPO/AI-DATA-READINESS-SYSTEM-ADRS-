import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Search, Database, BarChart3,
  FileText, Network, Package, ChevronDown, ChevronUp
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { PublishedDataset } from "@shared/schema";

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls = pct >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : pct >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-rose-500/10 text-rose-400 border-rose-500/30";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{pct}% quality</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : status === "DRAFT" ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{status}</Badge>;
}

function ArtifactButton({ label, icon: Icon, href }: { label: string; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  return (
    <a href={href || "#"} download className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

function DatasetCard({ dataset }: { dataset: PublishedDataset }) {
  const [expanded, setExpanded] = useState(false);
  const card = dataset.datasetCard as any;
  const artifactUris = dataset.artifactUris as any;

  return (
    <Card className="glass-panel border-0 hover:shadow-xl transition-all duration-300 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={dataset.status} />
              <Badge variant="outline" className="text-xs">v{dataset.version}</Badge>
              {dataset.entityTypes?.map(t => (
                <Badge key={t} variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">{t}</Badge>
              ))}
            </div>
            <h3 className="text-sm font-bold text-foreground truncate">{dataset.name}</h3>
            {dataset.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dataset.description}</p>}
          </div>
          <QualityBadge score={dataset.qualityScore} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Records", value: dataset.recordCount },
            { label: "Formats", value: dataset.formats?.length ?? 0 },
            { label: "Published", value: dataset.publishedAt ? formatDistanceToNow(new Date(dataset.publishedAt), { addSuffix: true }) : "Draft" },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-lg bg-background/40 border border-border/30">
              <div className="text-lg font-bold text-foreground leading-tight">{s.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {artifactUris && (
          <div className="flex flex-wrap gap-2 mt-4">
            {artifactUris.ml && <ArtifactButton label="ML CSV" icon={BarChart3} href={artifactUris.ml} />}
            {artifactUris.kg_graph && <ArtifactButton label="KG Graph" icon={Network} href={artifactUris.kg_graph} />}
            {artifactUris.rag_chunks && <ArtifactButton label="RAG Chunks" icon={FileText} href={artifactUris.rag_chunks} />}
            {artifactUris.bundle_zip && <ArtifactButton label="Bundle ZIP" icon={Package} href={artifactUris.bundle_zip} />}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Hide Details</> : <><ChevronDown className="w-3.5 h-3.5" />View Details & Lineage</>}
        </Button>

        {expanded && (
          <div className="mt-4 space-y-4 border-t border-border/30 pt-4">
            {card?.quality_metrics && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Quality Metrics</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Avg Confidence", value: `${Math.round((card.quality_metrics.avg_confidence ?? 0) * 100)}%` },
                    { label: "Avg Trust Score", value: `${Math.round((card.quality_metrics.avg_trust_score ?? 0) * 100)}%` },
                    { label: "Approved", value: `${Math.round(card.quality_metrics.approved_pct ?? 0)}%` },
                    { label: "Normalization OK", value: `${Math.round(card.quality_metrics.normalization_success_pct ?? 0)}%` },
                  ].map(m => (
                    <div key={m.label} className="flex justify-between text-xs p-2 rounded-lg bg-background/40 border border-border/20">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {card?.lineage && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Lineage Chain</p>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                    <Database className="w-3 h-3 text-primary" />
                    {card.lineage.source_batches?.length ?? 0} Batches
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-2/5 border border-chart-2/20">
                    <FileText className="w-3 h-3 text-chart-2" />
                    {card.lineage.source_evidence_ids?.length ?? 0} Evidence Files
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-3/5 border border-chart-3/20">
                    <Package className="w-3 h-3 text-chart-3" />
                    Dataset v{dataset.version}
                  </div>
                </div>
              </div>
            )}
            {card?.artifacts && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Artifact Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {card.artifacts.ml_features && (
                    <div className="p-2 rounded-lg bg-background/40 border border-border/20">
                      <span className="text-muted-foreground">ML:</span>
                      <span className="ml-1 font-semibold">{card.artifacts.ml_features.rows} rows</span>
                    </div>
                  )}
                  {card.artifacts.kg_graph && (
                    <div className="p-2 rounded-lg bg-background/40 border border-border/20">
                      <span className="text-muted-foreground">KG:</span>
                      <span className="ml-1 font-semibold">{card.artifacts.kg_graph.node_count} nodes · {card.artifacts.kg_graph.edge_count} edges</span>
                    </div>
                  )}
                  {card.artifacts.rag_chunks && (
                    <div className="p-2 rounded-lg bg-background/40 border border-border/20">
                      <span className="text-muted-foreground">RAG:</span>
                      <span className="ml-1 font-semibold">{card.artifacts.rag_chunks.count} chunks</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Catalogue() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data: datasets, isLoading } = useQuery<PublishedDataset[]>({
    queryKey: ["/api/datasets"],
  });

  const filtered = (datasets ?? []).filter(d => {
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Data Catalogue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, explore, and download all AI-ready published datasets with full lineage tracking.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5 border-primary/30 text-primary bg-primary/5">
          <Database className="w-3 h-3" /> Layer 8 — Dataset Publishing
        </Badge>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="input-catalogue-search"
            placeholder="Search datasets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {["ALL", "PUBLISHED", "DRAFT", "ARCHIVED"].map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="text-xs" onClick={() => setStatusFilter(s)}>
            {s}
          </Button>
        ))}
        <Badge variant="outline" className="text-xs ml-auto">{filtered.length} datasets</Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="glass-panel border-0">
              <CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass-panel border-0">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">No datasets found</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Publish a dataset from the Publishing page to see it appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(d => <DatasetCard key={d.id} dataset={d} />)}
        </div>
      )}
    </div>
  );
}
