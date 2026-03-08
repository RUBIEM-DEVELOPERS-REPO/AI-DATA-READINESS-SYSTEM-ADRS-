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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PublishedDataset } from "@shared/schema";
import {
  Upload, Plus, Download, Eye, Archive, CheckCircle2, FileText, Package, GitBranch, Star, Database, ChevronRight, Globe
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const statusColors: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PUBLISHED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

const formatColors: Record<string, string> = {
  CSV: "text-chart-1",
  JSONL: "text-chart-2",
  PARQUET: "text-chart-3",
};

function DatasetCard({ dataset }: { dataset: PublishedDataset }) {
  const { toast } = useToast();
  const qualityPct = Math.round(dataset.qualityScore * 100);

  const publishMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/datasets/${dataset.id}`, { status: "PUBLISHED", publishedAt: new Date().toISOString(), publishedBy: "Wills" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Dataset published", description: `${dataset.name} v${dataset.version} is now live.` });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/datasets/${dataset.id}`, { status: "ARCHIVED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      toast({ title: "Dataset archived" });
    },
  });

  const card = dataset.datasetCard as Record<string, any> | null;

  return (
    <Card data-testid={`card-dataset-${dataset.id}`} className="flex flex-col">
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

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="w-3 h-3 flex-shrink-0" />
            <span>{dataset.recordCount.toLocaleString()} records</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Star className="w-3 h-3 flex-shrink-0 text-chart-5" />
            <span>Quality {qualityPct}%</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Data Quality</span>
            <span className={`font-semibold ${qualityPct >= 75 ? "text-chart-3" : "text-chart-5"}`}>{qualityPct}%</span>
          </div>
          <Progress value={qualityPct} className="h-1" />
        </div>

        <div className="flex flex-wrap gap-1">
          {(dataset.formats ?? []).map((fmt) => (
            <Badge key={fmt} variant="outline" className={`text-xs ${formatColors[fmt] ?? ""}`}>{fmt}</Badge>
          ))}
          {(dataset.entityTypes ?? []).map((et) => (
            <Badge key={et} variant="outline" className="text-xs">{et}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border mt-auto flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {dataset.publishedAt
              ? `Published ${formatDistanceToNow(new Date(dataset.publishedAt), { addSuffix: true })}`
              : `Created ${formatDistanceToNow(new Date(dataset.createdAt), { addSuffix: true })}`}
          </span>
          <div className="flex items-center gap-1">
            {dataset.status === "DRAFT" && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} data-testid={`button-publish-${dataset.id}`}>
                <Globe className="w-3 h-3" /> Publish
              </Button>
            )}
            {dataset.status === "PUBLISHED" && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" data-testid={`button-download-${dataset.id}`}>
                  <Download className="w-3 h-3" /> Download
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
                  <Archive className="w-3 h-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
      toast({ title: "Dataset created", description: "New dataset created as draft. Review and publish when ready." });
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
            ...d,
            recordCount: parseInt(d.recordCount),
            qualityScore: parseFloat(d.qualityScore),
            formats: ["CSV", "JSONL", "PARQUET"],
            entityTypes: ["PERSON", "ORGANIZATION", "DOCUMENT"],
            datasetCard: { schema_version: "1.0", lineage: "ADRS Pipeline", validated: true },
          }))} className="space-y-4">
            <FormField name="name" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Dataset Name</FormLabel>
                <FormControl><Input {...field} placeholder="Ministry Finance Records 2024" data-testid="input-dataset-name" /></FormControl>
              </FormItem>
            )} />
            <FormField name="description" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} rows={2} placeholder="Describe the dataset contents..." data-testid="input-dataset-desc" /></FormControl>
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField name="version" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Version</FormLabel>
                  <FormControl><Input {...field} placeholder="1.0.0" data-testid="input-dataset-version" /></FormControl>
                </FormItem>
              )} />
              <FormField name="recordCount" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Record Count</FormLabel>
                  <FormControl><Input {...field} type="number" min="1" data-testid="input-record-count" /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField name="qualityScore" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Quality Score (0–1)</FormLabel>
                <FormControl><Input {...field} type="number" min="0" max="1" step="0.01" data-testid="input-quality-score" /></FormControl>
              </FormItem>
            )} />
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
          <p className="text-sm text-muted-foreground mt-1">Generate, version, and export AI-ready datasets with full lineage</p>
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
            <Package className="w-4 h-4 text-primary" />
            Supported Export Formats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { fmt: "CSV", desc: "Tabular features for ML training pipelines", icon: FileText, color: "text-chart-1" },
              { fmt: "JSONL", desc: "Knowledge graph entities and relationships", icon: Package, color: "text-chart-2" },
              { fmt: "PARQUET", desc: "Columnar format for data warehouses and analytics", icon: Database, color: "text-chart-3" },
            ].map(({ fmt, desc, icon: Icon, color }) => (
              <div key={fmt} className="flex items-start gap-3 p-3 rounded-md border border-border">
                <Icon className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">{fmt}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
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
            <p className="text-xs text-muted-foreground">Create a dataset from validated CDM entities</p>
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
