import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PublishedDataset, DatasetCard } from "@shared/schema";
import {
  Upload, Plus, Download, Archive, Globe, FileText, Package, GitBranch, Star, Database,
  Network, Layers, Brain, CheckCircle2, AlertTriangle, BarChart3, ChevronRight, Eye, Shield, Zap
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const statusColors: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PUBLISHED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

const artifactColors = {
  ml: { icon: BarChart3, color: "text-chart-1", bg: "bg-chart-1/10", label: "ML Features", desc: "Flat feature matrix for supervised ML training", ext: "Parquet/CSV" },
  kg: { icon: Network, color: "text-chart-2", bg: "bg-chart-2/10", label: "Knowledge Graph", desc: "Entities, identifiers, and relationship edges", ext: "JSONL" },
  rag: { icon: Brain, color: "text-chart-3", bg: "bg-chart-3/10", label: "RAG Chunks", desc: "Chunked text corpus for LLM/RAG pipelines", ext: "JSONL" },
  bundle: { icon: Package, color: "text-chart-5", bg: "bg-chart-5/10", label: "Bundle ZIP", desc: "All artifacts + dataset card in one download", ext: "ZIP" },
};

function ArtifactRow({ type, uri, counts }: {
  type: keyof typeof artifactColors;
  uri?: string;
  counts?: { rows?: number; count?: number };
}) {
  const config = artifactColors[type];
  const Icon = config.icon;
  const count = counts?.rows ?? counts?.count;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`artifact-row-${type}`}>
      <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${config.bg}`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{config.label}</span>
          <Badge variant="outline" className="text-xs">{config.ext}</Badge>
          {count !== undefined && <Badge variant="outline" className="text-xs">{count.toLocaleString()} rows</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{config.desc}</p>
      </div>
      {uri ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 flex-shrink-0"
          asChild
          data-testid={`button-download-${type}`}
        >
          <a href={uri} target="_blank" rel="noopener noreferrer">
            <Download className="w-3 h-3" /> Download
          </a>
        </Button>
      ) : (
        <Badge variant="outline" className="text-xs text-muted-foreground flex-shrink-0">Not generated</Badge>
      )}
    </div>
  );
}

function DatasetCardPanel({ card }: { card: DatasetCard }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 rounded-md bg-muted space-y-1">
          <p className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Generated</p>
          <p className="font-medium">{format(new Date(card.generated_at), "dd MMM yyyy, HH:mm")}</p>
        </div>
        <div className="p-2.5 rounded-md bg-muted space-y-1">
          <p className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Schema Version</p>
          <p className="font-medium">{card.schema_version}</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Quality Metrics</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "Total Records", value: card.quality_metrics.total_records.toLocaleString() },
            { label: "Avg Confidence", value: `${(card.quality_metrics.avg_confidence * 100).toFixed(0)}%` },
            { label: "Avg Trust Score", value: `${(card.quality_metrics.avg_trust_score * 100).toFixed(0)}%` },
            { label: "Approved", value: `${card.quality_metrics.approved_pct}%` },
            { label: "Pending", value: `${card.quality_metrics.pending_pct}%` },
            { label: "Normalized", value: `${card.quality_metrics.normalization_success_pct}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between p-2 rounded bg-muted">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Validation Summary</h4>
        <div className="space-y-1.5">
          {[
            { label: "Auto-Approved", value: card.validation_summary.auto_approved, color: "bg-chart-3" },
            { label: "Human-Approved", value: card.validation_summary.human_approved, color: "bg-chart-2" },
            { label: "Pending", value: card.validation_summary.pending, color: "bg-chart-5" },
            { label: "Rejected", value: card.validation_summary.rejected, color: "bg-destructive" },
          ].map(({ label, value, color }) => {
            const total = card.validation_summary.total_attributes;
            const pct = total > 0 ? Math.round(value / total * 100) : 0;
            return (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-28 text-muted-foreground flex-shrink-0">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right font-medium">{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><GitBranch className="w-3 h-3" /> Lineage</h4>
        <div className="text-xs space-y-1">
          {card.lineage.source_batches.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 flex-shrink-0">Source Batches</span>
              <div className="flex flex-wrap gap-1">{card.lineage.source_batches.map(b => <Badge key={b} variant="outline" className="text-xs font-mono">{b}</Badge>)}</div>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 flex-shrink-0">Evidence Files</span>
            <span className="font-medium">{card.lineage.source_evidence_ids.length} files</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 flex-shrink-0">Pipeline</span>
            <span className="font-medium">v{card.lineage.pipeline_version}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 flex-shrink-0">Model</span>
            <span className="font-medium">{card.lineage.extraction_model_version}</span>
          </div>
        </div>
      </div>

      {card.approvals && card.approvals.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield className="w-3 h-3" /> Approvals</h4>
          {card.approvals.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-chart-3" /><span className="font-medium">{a.user}</span><span className="text-muted-foreground">· {a.role}</span></div>
              <span className="text-muted-foreground">{format(new Date(a.timestamp), "dd MMM yyyy")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactCounts({ contents }: { contents: any }) {
  if (!contents) return null;
  return {
    ml: contents.ml_features?.length,
    kg_entities: contents.kg_entities?.length,
    kg_identifiers: contents.kg_identifiers?.length,
    kg_edges: contents.kg_edges?.length,
    rag_chunks: contents.rag_chunks?.length,
  };
}

function DatasetCard({ dataset }: { dataset: PublishedDataset }) {
  const { toast } = useToast();
  const [showDetail, setShowDetail] = useState(false);
  const qualityPct = Math.round(dataset.qualityScore * 100);
  const artifactUris = dataset.artifactUris as Record<string, string> | null;
  const artifactContents = dataset.artifactContents as any | null;
  const datasetCard = dataset.datasetCard as DatasetCard | null;

  const counts = {
    ml: artifactContents?.ml_features?.length,
    kg_entities: artifactContents?.kg_entities?.length,
    kg_identifiers: artifactContents?.kg_identifiers?.length,
    kg_edges: artifactContents?.kg_edges?.length,
    rag_chunks: artifactContents?.rag_chunks?.length,
  };

  const publishMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/datasets/${dataset.id}/publish`, { publishedBy: "Wills" }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Dataset published", description: `Generated ${data.ml} ML rows, ${data.kg_entities} KG entities, ${data.rag_chunks} RAG chunks.` });
    },
    onError: () => toast({ title: "Error", description: "Failed to publish dataset.", variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/datasets/${dataset.id}`, { status: "ARCHIVED" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/datasets"] }); toast({ title: "Dataset archived" }); },
  });

  return (
    <>
      <Card data-testid={`card-dataset-${dataset.id}`} className={`flex flex-col ${dataset.status === "PUBLISHED" ? "border-chart-3/30" : ""}`}>
        <CardContent className="p-4 space-y-3 flex flex-col h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{dataset.name}</p>
                <Badge variant="outline" className="text-xs flex-shrink-0 gap-1 font-mono">
                  <GitBranch className="w-2.5 h-2.5" /> v{dataset.version}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{dataset.datasetCode}</p>
            </div>
            <Badge variant="outline" className={`text-xs flex-shrink-0 ${statusColors[dataset.status]}`}>
              {dataset.status}
            </Badge>
          </div>

          {dataset.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{dataset.description}</p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Quality Score</span>
              <span className={`font-semibold ${qualityPct >= 75 ? "text-chart-3" : "text-chart-5"}`}>{qualityPct}%</span>
            </div>
            <Progress value={qualityPct} className="h-1.5" />
          </div>

          {artifactContents && (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {counts.ml !== undefined && <div className="p-1.5 rounded bg-chart-1/8 border border-chart-1/20"><p className="text-xs font-semibold text-chart-1">{counts.ml}</p><p className="text-xs text-muted-foreground">ML rows</p></div>}
              {counts.kg_entities !== undefined && <div className="p-1.5 rounded bg-chart-2/8 border border-chart-2/20"><p className="text-xs font-semibold text-chart-2">{counts.kg_entities}</p><p className="text-xs text-muted-foreground">KG ent.</p></div>}
              {counts.rag_chunks !== undefined && <div className="p-1.5 rounded bg-chart-3/8 border border-chart-3/20"><p className="text-xs font-semibold text-chart-3">{counts.rag_chunks}</p><p className="text-xs text-muted-foreground">RAG</p></div>}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border mt-auto flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">
              {dataset.publishedAt
                ? `Published ${formatDistanceToNow(new Date(dataset.publishedAt), { addSuffix: true })}`
                : `Created ${formatDistanceToNow(new Date(dataset.createdAt), { addSuffix: true })}`}
            </span>
            <div className="flex items-center gap-1">
              {dataset.status === "DRAFT" && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} data-testid={`button-publish-${dataset.id}`}>
                  {publishMutation.isPending ? <><Zap className="w-3 h-3 animate-pulse" /> Building...</> : <><Globe className="w-3 h-3" /> Publish</>}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowDetail(true)} data-testid={`button-detail-${dataset.id}`}>
                <Eye className="w-3 h-3" /> {dataset.status === "PUBLISHED" ? "Artifacts" : "Details"}
              </Button>
              {dataset.status === "PUBLISHED" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
                  <Archive className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              {dataset.name} — v{dataset.version}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="artifacts" className="flex-1 min-h-0">
            <TabsList className="w-full grid grid-cols-3 h-8">
              <TabsTrigger value="artifacts" className="text-xs">Artifacts</TabsTrigger>
              <TabsTrigger value="card" className="text-xs">Dataset Card</TabsTrigger>
              <TabsTrigger value="quality" className="text-xs">Quality Gates</TabsTrigger>
            </TabsList>

            <TabsContent value="artifacts" className="mt-3">
              <ScrollArea className="h-80">
                <div className="space-y-2 pr-2">
                  {dataset.status !== "PUBLISHED" || !artifactContents ? (
                    <div className="py-8 text-center">
                      <Package className="w-8 h-8 text-muted-foreground opacity-40 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Artifacts are generated when the dataset is published.</p>
                      <p className="text-xs text-muted-foreground mt-1">Publishing creates ML features, KG entities/edges, and RAG chunks.</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-muted-foreground mb-3 p-2.5 rounded-md bg-muted">
                        <span className="font-semibold text-foreground">One publish action → 3 fit-for-purpose artifacts</span>
                        <span className="ml-2">linked by dataset_version_id</span>
                      </div>
                      <ArtifactRow type="ml" uri={artifactUris?.ml} counts={{ rows: counts.ml }} />
                      <div className="pl-3 space-y-1.5">
                        <ArtifactRow type="kg" uri={artifactUris?.kg_entities} counts={{ count: (counts.kg_entities ?? 0) + (counts.kg_identifiers ?? 0) + (counts.kg_edges ?? 0) }} />
                        {counts.kg_entities !== undefined && (
                          <div className="grid grid-cols-3 gap-1.5 ml-2 text-xs">
                            <div className="p-2 rounded bg-muted text-center">
                              <p className="font-semibold text-foreground">{counts.kg_entities}</p>
                              <p className="text-muted-foreground">entities</p>
                              {artifactUris?.kg_entities && <a href={artifactUris.kg_entities} className="text-primary mt-0.5 flex items-center justify-center gap-0.5"><Download className="w-2.5 h-2.5" />JSONL</a>}
                            </div>
                            <div className="p-2 rounded bg-muted text-center">
                              <p className="font-semibold text-foreground">{counts.kg_identifiers}</p>
                              <p className="text-muted-foreground">identifiers</p>
                              {artifactUris?.kg_identifiers && <a href={artifactUris.kg_identifiers} className="text-primary mt-0.5 flex items-center justify-center gap-0.5"><Download className="w-2.5 h-2.5" />JSONL</a>}
                            </div>
                            <div className="p-2 rounded bg-muted text-center">
                              <p className="font-semibold text-foreground">{counts.kg_edges}</p>
                              <p className="text-muted-foreground">edges</p>
                              {artifactUris?.kg_edges && <a href={artifactUris.kg_edges} className="text-primary mt-0.5 flex items-center justify-center gap-0.5"><Download className="w-2.5 h-2.5" />JSONL</a>}
                            </div>
                          </div>
                        )}
                      </div>
                      <ArtifactRow type="rag" uri={artifactUris?.rag_chunks} counts={{ count: counts.rag_chunks }} />
                      <ArtifactRow type="bundle" uri={artifactUris?.bundle_zip} />
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="card" className="mt-3">
              <ScrollArea className="h-80">
                <div className="pr-2">
                  {datasetCard ? <DatasetCardPanel card={datasetCard} /> : (
                    <p className="text-xs text-muted-foreground text-center py-8">Dataset card generated on publish.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="quality" className="mt-3">
              <ScrollArea className="h-80">
                <div className="pr-2 space-y-3">
                  {(() => {
                    const qg = dataset.qualityGates as any;
                    if (!qg) return <p className="text-xs text-muted-foreground text-center py-8">No quality gates data.</p>;
                    return (
                      <>
                        <div className={`flex items-center gap-2 p-3 rounded-md border ${qg.passed ? "border-chart-3/40 bg-chart-3/5" : "border-destructive/40 bg-destructive/5"}`}>
                          {qg.passed ? <CheckCircle2 className="w-4 h-4 text-chart-3" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
                          <span className={`text-sm font-semibold ${qg.passed ? "text-chart-3" : "text-destructive"}`}>
                            Quality Gates {qg.passed ? "Passed" : "Failed"}
                          </span>
                        </div>
                        {(qg.checks ?? []).map((check: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 rounded-md border border-border" data-testid={`quality-check-${i}`}>
                            {check.passed ? <CheckCircle2 className="w-4 h-4 text-chart-3 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-chart-5 flex-shrink-0 mt-0.5" />}
                            <div>
                              <p className="text-xs font-semibold text-foreground">{check.rule}</p>
                              <p className="text-xs text-muted-foreground">{check.detail}</p>
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewDatasetDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: { name: "", description: "", version: "1.0.0", recordCount: "100", qualityScore: "0.85" }
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/datasets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      toast({ title: "Dataset created", description: "Draft created. Click Publish to generate all 3 artifacts." });
      setOpen(false);
      form.reset();
    },
    onError: () => toast({ title: "Error", description: "Failed to create dataset.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" data-testid="button-new-dataset">
          <Plus className="w-4 h-4" /> New Dataset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Dataset</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate({
            ...d, recordCount: parseInt(d.recordCount), qualityScore: parseFloat(d.qualityScore),
            formats: ["ML_FEATURES", "KG_ENTITIES", "KG_EDGES", "RAG_CHUNKS"],
            entityTypes: ["PERSON", "ORGANIZATION", "DOCUMENT"],
          }))} className="space-y-4">
            <FormField name="name" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>Dataset Name</FormLabel><FormControl><Input {...field} placeholder="Ministry Records 2025" data-testid="input-dataset-name" /></FormControl></FormItem>
            )} />
            <FormField name="description" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={2} placeholder="Describe the dataset..." data-testid="input-dataset-desc" /></FormControl></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField name="version" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Version</FormLabel><FormControl><Input {...field} placeholder="1.0.0" data-testid="input-dataset-version" /></FormControl></FormItem>
              )} />
              <FormField name="recordCount" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Record Count</FormLabel><FormControl><Input {...field} type="number" min="1" data-testid="input-record-count" /></FormControl></FormItem>
              )} />
            </div>
            <FormField name="qualityScore" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>Quality Score (0–1)</FormLabel><FormControl><Input {...field} type="number" min="0" max="1" step="0.01" data-testid="input-quality-score" /></FormControl></FormItem>
            )} />
            <p className="text-xs text-muted-foreground">Publishing will automatically generate ML features, KG entities/edges, and RAG chunks as separate artifacts.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-submit-dataset">
                {mutation.isPending ? "Creating..." : "Create Draft"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Publishing() {
  const { data: datasets, isLoading } = useQuery<PublishedDataset[]>({ queryKey: ["/api/datasets"] });

  const published = datasets?.filter(d => d.status === "PUBLISHED").length ?? 0;
  const drafts = datasets?.filter(d => d.status === "DRAFT").length ?? 0;
  const archived = datasets?.filter(d => d.status === "ARCHIVED").length ?? 0;
  const totalRecords = datasets?.reduce((acc, d) => acc + d.recordCount, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-publishing">Dataset Publishing</h1>
          <p className="text-sm text-muted-foreground mt-1">One publish action → 3 fit-for-purpose artifacts: ML features, Knowledge Graph, RAG corpus</p>
        </div>
        <NewDatasetDialog />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Published", value: published, icon: Globe, color: "text-chart-3" },
          { label: "Drafts", value: drafts, icon: FileText, color: "text-chart-5" },
          { label: "Archived", value: archived, icon: Archive, color: "text-muted-foreground" },
          { label: "Total Records", value: totalRecords.toLocaleString(), icon: Database, color: "text-primary" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className={`text-2xl font-bold ${s.color}`}>{isLoading ? "—" : s.value}</p></div>
              <s.icon className={`w-6 h-6 ${s.color} opacity-70`} />
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Multi-Artifact Publishing Architecture
          </CardTitle>
          <CardDescription className="text-xs">Each dataset version produces separate, fit-for-purpose artifacts — never mixed shapes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {Object.entries(artifactColors).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className={`flex flex-col gap-2 p-3.5 rounded-md border border-border ${config.bg}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                    <Badge variant="outline" className="text-xs ml-auto">{config.ext}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{config.desc}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>)}
        </div>
      ) : (datasets ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <Upload className="w-12 h-12 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No datasets yet</p>
            <p className="text-xs text-muted-foreground">Create a dataset and publish to generate ML, KG, and RAG artifacts</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(datasets ?? []).map((d) => <DatasetCard key={d.id} dataset={d} />)}
        </div>
      )}
    </div>
  );
}
