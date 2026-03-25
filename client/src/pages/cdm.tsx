import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/context/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CdmEntity } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  Database, User, Building2, FileText, DollarSign, Package,
  Search, Star, Eye, Network, ShieldCheck, Sparkles, GitMerge,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const entityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  PERSON:       User,
  ORGANIZATION: Building2,
  DOCUMENT:     FileText,
  TRANSACTION:  DollarSign,
  ASSET:        Package,
};

const entityColors: Record<string, { bg: string; text: string; border: string }> = {
  PERSON:       { bg: "bg-chart-1/10", text: "text-chart-1", border: "border-chart-1/30" },
  ORGANIZATION: { bg: "bg-chart-2/10", text: "text-chart-2", border: "border-chart-2/30" },
  DOCUMENT:     { bg: "bg-chart-3/10", text: "text-chart-3", border: "border-chart-3/30" },
  TRANSACTION:  { bg: "bg-chart-4/10", text: "text-chart-4", border: "border-chart-4/30" },
  ASSET:        { bg: "bg-chart-5/10", text: "text-chart-5", border: "border-chart-5/30" },
};

function EntityCard({ entity }: { entity: CdmEntity }) {
  const [open, setOpen] = useState(false);
  const Icon   = entityIcons[entity.entityType] ?? Database;
  const colors = entityColors[entity.entityType] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  const fields = entity.canonicalFields as Record<string, any>;
  const fieldEntries = Object.entries(fields);
  const confidencePct = Math.round(entity.confidenceScore * 100);

  return (
    <>
      <Card data-testid={`card-entity-${entity.id}`} className="flex flex-col">
        <CardContent className="p-4 space-y-3 flex flex-col h-full">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
              <Icon className={`w-4.5 h-4.5 ${colors.text}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{entity.displayName}</p>
                {entity.isGoldenRecord && <Star className="w-3.5 h-3.5 text-chart-5 flex-shrink-0" />}
              </div>
              <p className="text-xs font-mono text-muted-foreground">{entity.entityCode}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className={`px-2 py-1.5 rounded border text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
              {entity.entityType}
            </div>
            <div className="px-2 py-1.5 rounded border border-border bg-muted text-xs text-muted-foreground">
              v{entity.schemaVersion}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <span className={`font-semibold ${confidencePct >= 75 ? "text-chart-3" : "text-chart-5"}`}>{confidencePct}%</span>
            </div>
            <Progress value={confidencePct} className="h-1" />
          </div>

          <div className="space-y-1 flex-1">
            {fieldEntries.slice(0, 3).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-medium text-foreground truncate max-w-28">{String(val)}</span>
              </div>
            ))}
            {fieldEntries.length > 3 && (
              <p className="text-xs text-muted-foreground">+{fieldEntries.length - 3} more fields</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
            <div className="flex items-center gap-1 flex-wrap">
              {entity.isGoldenRecord && (
                <Badge variant="outline" className="text-xs gap-1 border-chart-5/40 text-chart-5 bg-chart-5/5">
                  <Star className="w-2.5 h-2.5" /> Golden
                </Badge>
              )}
              {entity.goldenRecordId && (
                <Badge variant="outline" className="text-xs gap-1 border-muted-foreground/30 text-muted-foreground">
                  <GitMerge className="w-2.5 h-2.5" /> Merged
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(entity.createdAt), { addSuffix: true })}
              </span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setOpen(true)} data-testid={`button-view-entity-${entity.id}`}>
              <Eye className="w-3 h-3" /> View
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Icon className={`w-4 h-4 ${colors.text}`} />
              {entity.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-md bg-muted">
              <div><span className="text-muted-foreground">Code:</span> <span className="font-mono font-semibold">{entity.entityCode}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <span className="font-semibold">{entity.entityType}</span></div>
              <div><span className="text-muted-foreground">Version:</span> <span>v{entity.schemaVersion}</span></div>
              <div><span className="text-muted-foreground">Confidence:</span> <span className="font-semibold">{confidencePct}%</span></div>
              <div><span className="text-muted-foreground">Tenant:</span> <span>{entity.tenantId}</span></div>
              <div>
                <span className="text-muted-foreground">Golden Record:</span>{" "}
                <span className={entity.isGoldenRecord ? "text-chart-5 font-semibold" : ""}>{entity.isGoldenRecord ? "Yes ★" : "No"}</span>
              </div>
              {entity.goldenRecordId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Merged into:</span>{" "}
                  <span className="font-mono text-xs">{entity.goldenRecordId.slice(0, 16)}…</span>
                </div>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Canonical Fields</h4>
              <div className="space-y-2">
                {Object.entries(fields).map(([key, val]) => (
                  <div key={key} className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0 text-sm" data-testid={`entity-field-${key}`}>
                    <span className="text-muted-foreground capitalize flex-shrink-0">{key.replace(/_/g, " ")}</span>
                    <span className="font-medium text-foreground text-right">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
            {entity.sourceEvidenceIds && entity.sourceEvidenceIds.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Source Evidence</h4>
                <div className="flex flex-wrap gap-1">
                  {entity.sourceEvidenceIds.map((id) => (
                    <Badge key={id} variant="outline" className="text-xs font-mono">{id.slice(0, 8)}…</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Golden Record card ────────────────────────────────────────────────────────
interface GoldenSummary extends CdmEntity {
  absorbedCount: number;
  absorbed: Array<{ id: string; displayName: string; entityCode: string; entityType: string }>;
}

function GoldenCard({ entity }: { entity: GoldenSummary }) {
  const [open, setOpen] = useState(false);
  const Icon   = entityIcons[entity.entityType] ?? Database;
  const colors = entityColors[entity.entityType] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  const confidencePct = Math.round(entity.confidenceScore * 100);

  return (
    <>
      <Card data-testid={`card-golden-${entity.id}`} className="border-chart-5/30 bg-chart-5/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
              <Icon className={`w-4.5 h-4.5 ${colors.text}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{entity.displayName}</p>
                <Star className="w-3.5 h-3.5 text-chart-5 flex-shrink-0" />
              </div>
              <p className="text-xs font-mono text-muted-foreground">{entity.entityCode}</p>
            </div>
            <Badge variant="outline" className="text-xs border-chart-5/40 text-chart-5 bg-chart-5/5 flex-shrink-0">
              {entity.entityType}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitMerge className="w-3 h-3" />
              <span>Absorbed {entity.absorbedCount} duplicate{entity.absorbedCount !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="w-3 h-3" />
              <span>{confidencePct}% confidence</span>
            </div>
          </div>

          {entity.absorbed.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Merged records:</p>
              {entity.absorbed.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/50">
                  <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{a.displayName}</span>
                  <span className="text-muted-foreground font-mono flex-shrink-0">{a.entityCode}</span>
                </div>
              ))}
            </div>
          )}

          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 w-full" onClick={() => setOpen(true)}>
            <Eye className="w-3 h-3" /> View Full Record
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Star className="w-4 h-4 text-chart-5" />
              Golden Record — {entity.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-md bg-muted">
              <div><span className="text-muted-foreground">Code:</span> <span className="font-mono font-semibold">{entity.entityCode}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <span className="font-semibold">{entity.entityType}</span></div>
              <div><span className="text-muted-foreground">Confidence:</span> <span className="font-semibold">{confidencePct}%</span></div>
              <div><span className="text-muted-foreground">Absorbed:</span> <span className="font-semibold">{entity.absorbedCount} record(s)</span></div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Canonical Fields</h4>
              <div className="space-y-2">
                {Object.entries(entity.canonicalFields as Record<string, any>).map(([key, val]) => (
                  <div key={key} className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0 text-sm">
                    <span className="text-muted-foreground capitalize flex-shrink-0">{key.replace(/_/g, " ")}</span>
                    <span className="font-medium text-foreground text-right">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
            {entity.absorbed.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Merged Duplicates</h4>
                <div className="space-y-1">
                  {entity.absorbed.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-muted/50 border border-border">
                      <GitMerge className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{a.displayName}</span>
                      <span className="font-mono text-muted-foreground ml-auto">{a.entityCode}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CdmExplorer() {
  const [search, setSearch]         = useState("");
  const [entityType, setEntityType] = useState("ALL");
  const [reclassifyResult, setReclassifyResult] = useState<any>(null);
  const [goldenResult, setGoldenResult]         = useState<any>(null);
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const { data: entities, isLoading } = useQuery<CdmEntity[]>({ queryKey: ["/api/cdm"] });
  const { data: goldenRecords, isLoading: isLoadingGolden } = useQuery<GoldenSummary[]>({
    queryKey: ["/api/cdm/golden-records"],
  });

  const reclassifyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cdm/reclassify", {}),
    onSuccess: (data: any) => {
      setReclassifyResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/cdm"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/golden-records"] });
      toast({
        title: "Reclassification complete",
        description: `Fixed ${data.entitiesReclassified} entity type(s) and ${data.docTypesReclassified} doc type(s).`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Reclassification failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const goldenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cdm/golden-records/compute", {}),
    onSuccess: (data: any) => {
      setGoldenResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/cdm"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/golden-records"] });
      toast({
        title: "Golden records computed",
        description: `Found ${data.goldenGroupsFound} group(s), promoted ${data.entitiesPromoted} golden record(s).`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Computation failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const filtered = (entities ?? []).filter(e => {
    const matchSearch = !search || e.displayName.toLowerCase().includes(search.toLowerCase()) || e.entityCode.toLowerCase().includes(search.toLowerCase());
    const matchType   = entityType === "ALL" || e.entityType === entityType;
    return matchSearch && matchType;
  });

  const counts = {
    ALL:          entities?.length ?? 0,
    PERSON:       entities?.filter(e => e.entityType === "PERSON").length ?? 0,
    ORGANIZATION: entities?.filter(e => e.entityType === "ORGANIZATION").length ?? 0,
    DOCUMENT:     entities?.filter(e => e.entityType === "DOCUMENT").length ?? 0,
    TRANSACTION:  entities?.filter(e => e.entityType === "TRANSACTION").length ?? 0,
    ASSET:        entities?.filter(e => e.entityType === "ASSET").length ?? 0,
  };

  const goldenCount    = entities?.filter(e => e.isGoldenRecord).length ?? 0;
  const avgConfidence  = entities?.length
    ? Math.round(entities.reduce((acc, e) => acc + e.confidenceScore, 0) / entities.length * 100)
    : 0;
  const otherDocCount  = 0; // shown as badge on AI Fix button after reclassify

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-cdm">CDM Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">Canonical Data Model — versioned, traceable, governance-ready entities</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => reclassifyMutation.mutate()}
            disabled={reclassifyMutation.isPending || !can("ANALYST")}
            data-testid="button-reclassify"
          >
            {reclassifyMutation.isPending
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Sparkles className="w-3 h-3" />}
            AI Fix Types &amp; Doc Types
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => goldenMutation.mutate()}
            disabled={goldenMutation.isPending || !can("ANALYST")}
            data-testid="button-compute-golden"
          >
            {goldenMutation.isPending
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <GitMerge className="w-3 h-3" />}
            Compute Golden Records
          </Button>
        </div>
      </div>

      {reclassifyResult && (
        <Alert data-testid="alert-reclassify-result">
          <CheckCircle2 className="w-4 h-4" />
          <AlertDescription className="text-xs">
            <strong>AI Reclassification done:</strong>{" "}
            scanned {reclassifyResult.entitiesScanned} entities →{" "}
            fixed <strong>{reclassifyResult.entitiesReclassified}</strong> type(s);{" "}
            scanned {reclassifyResult.docTypesScanned} OTHER docs →{" "}
            reclassified <strong>{reclassifyResult.docTypesReclassified}</strong> doc type(s).
          </AlertDescription>
        </Alert>
      )}

      {goldenResult && (
        <Alert data-testid="alert-golden-result">
          <Star className="w-4 h-4 text-chart-5" />
          <AlertDescription className="text-xs">
            <strong>Golden Records:</strong>{" "}
            found <strong>{goldenResult.goldenGroupsFound}</strong> duplicate group(s),{" "}
            promoted <strong>{goldenResult.entitiesPromoted}</strong> golden record(s),{" "}
            merged <strong>{goldenResult.entitiesMerged}</strong> duplicate record(s).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Total Entities</p><p className="text-2xl font-bold">{isLoading ? "—" : counts.ALL}</p></div>
            <Database className="w-6 h-6 text-primary opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Golden Records</p><p className="text-2xl font-bold text-chart-5">{isLoading ? "—" : goldenCount}</p></div>
            <Star className="w-6 h-6 text-chart-5 opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Avg Confidence</p><p className="text-2xl font-bold">{isLoading ? "—" : `${avgConfidence}%`}</p></div>
            <ShieldCheck className="w-6 h-6 text-chart-3 opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Persons</p><p className="text-2xl font-bold">{isLoading ? "—" : counts.PERSON}</p></div>
            <User className="w-6 h-6 text-chart-1 opacity-70" />
          </div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="entities">
        <TabsList className="h-9">
          <TabsTrigger value="entities" className="text-xs" data-testid="tab-all-entities">All Entities</TabsTrigger>
          <TabsTrigger value="golden" className="text-xs gap-1" data-testid="tab-golden-records">
            <Star className="w-3 h-3" />
            Golden Records
            {goldenCount > 0 && (
              <Badge variant="secondary" className="text-xs h-4 px-1 ml-0.5">{goldenCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── All entities tab ─────────────────────────────────────────── */}
        <TabsContent value="entities" className="space-y-4 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search entities…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-entity-search"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {(["ALL", "PERSON", "ORGANIZATION", "DOCUMENT", "TRANSACTION", "ASSET"] as const).map((type) => {
                const Icon     = type === "ALL" ? Database : entityIcons[type] ?? Database;
                const isActive = entityType === type;
                return (
                  <Button
                    key={type}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className="h-8 text-xs gap-1"
                    onClick={() => setEntityType(type)}
                    data-testid={`filter-entity-${type.toLowerCase()}`}
                  >
                    <Icon className="w-3 h-3" />
                    {type === "ALL" ? "All" : type.charAt(0) + type.slice(1).toLowerCase()}
                    <Badge variant={isActive ? "secondary" : "outline"} className="text-xs h-4 px-1 ml-0.5">
                      {counts[type]}
                    </Badge>
                  </Button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
                <Database className="w-12 h-12 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium text-muted-foreground">No CDM entities found</p>
                <p className="text-xs text-muted-foreground">Entities are created when evidence files are processed</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((entity) => <EntityCard key={entity.id} entity={entity} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Golden Records tab ───────────────────────────────────────── */}
        <TabsContent value="golden" className="space-y-4 mt-4">
          {goldenCount === 0 && !isLoadingGolden ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <GitMerge className="w-12 h-12 text-muted-foreground opacity-40" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No golden records yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Compute Golden Records" above to identify and merge duplicate entities
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => goldenMutation.mutate()}
                  disabled={goldenMutation.isPending}
                  data-testid="button-compute-golden-empty"
                >
                  {goldenMutation.isPending
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <GitMerge className="w-3.5 h-3.5" />}
                  Compute Golden Records
                </Button>
              </CardContent>
            </Card>
          ) : isLoadingGolden ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="w-4 h-4 text-chart-5" />
                <span><strong className="text-foreground">{goldenRecords?.length ?? 0}</strong> golden record(s) — each represents a unique, deduplicated entity</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(goldenRecords ?? []).map((entity) => (
                  <GoldenCard key={entity.id} entity={entity} />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
