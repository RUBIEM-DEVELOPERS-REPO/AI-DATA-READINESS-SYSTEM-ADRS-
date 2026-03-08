import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import type { CdmEntity } from "@shared/schema";
import { Database, User, Building2, FileText, DollarSign, Package, Search, Star, Eye, Network, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const entityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  PERSON: User,
  ORGANIZATION: Building2,
  DOCUMENT: FileText,
  TRANSACTION: DollarSign,
  ASSET: Package,
};

const entityColors: Record<string, { bg: string; text: string; border: string }> = {
  PERSON: { bg: "bg-chart-1/10", text: "text-chart-1", border: "border-chart-1/30" },
  ORGANIZATION: { bg: "bg-chart-2/10", text: "text-chart-2", border: "border-chart-2/30" },
  DOCUMENT: { bg: "bg-chart-3/10", text: "text-chart-3", border: "border-chart-3/30" },
  TRANSACTION: { bg: "bg-chart-4/10", text: "text-chart-4", border: "border-chart-4/30" },
  ASSET: { bg: "bg-chart-5/10", text: "text-chart-5", border: "border-chart-5/30" },
};

function EntityCard({ entity }: { entity: CdmEntity }) {
  const [open, setOpen] = useState(false);
  const Icon = entityIcons[entity.entityType] ?? Database;
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
                {entity.isGoldenRecord && (
                  <Star className="w-3.5 h-3.5 text-chart-5 flex-shrink-0" />
                )}
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
            <div className="flex items-center gap-1">
              {entity.isGoldenRecord && (
                <Badge variant="outline" className="text-xs gap-1 border-chart-5/40 text-chart-5 bg-chart-5/5">
                  <Star className="w-2.5 h-2.5" /> Golden
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
              <div><span className="text-muted-foreground">Golden Record:</span> <span>{entity.isGoldenRecord ? "Yes" : "No"}</span></div>
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
                    <Badge key={id} variant="outline" className="text-xs font-mono">{id.slice(0, 8)}...</Badge>
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

export default function CdmExplorer() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("ALL");

  const { data: entities, isLoading } = useQuery<CdmEntity[]>({ queryKey: ["/api/cdm"] });

  const filtered = (entities ?? []).filter(e => {
    const matchSearch = !search || e.displayName.toLowerCase().includes(search.toLowerCase()) || e.entityCode.toLowerCase().includes(search.toLowerCase());
    const matchType = entityType === "ALL" || e.entityType === entityType;
    return matchSearch && matchType;
  });

  const counts = {
    ALL: entities?.length ?? 0,
    PERSON: entities?.filter(e => e.entityType === "PERSON").length ?? 0,
    ORGANIZATION: entities?.filter(e => e.entityType === "ORGANIZATION").length ?? 0,
    DOCUMENT: entities?.filter(e => e.entityType === "DOCUMENT").length ?? 0,
    TRANSACTION: entities?.filter(e => e.entityType === "TRANSACTION").length ?? 0,
    ASSET: entities?.filter(e => e.entityType === "ASSET").length ?? 0,
  };

  const goldenCount = entities?.filter(e => e.isGoldenRecord).length ?? 0;
  const avgConfidence = entities?.length ? Math.round(entities.reduce((acc, e) => acc + e.confidenceScore, 0) / entities.length * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="heading-cdm">CDM Explorer</h1>
        <p className="text-sm text-muted-foreground mt-1">Canonical Data Model entities — versioned, traceable, and governance-ready</p>
      </div>

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
            <div><p className="text-xs text-muted-foreground">Entity Types</p><p className="text-2xl font-bold">5</p></div>
            <Network className="w-6 h-6 text-chart-2 opacity-70" />
          </div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            data-testid="input-entity-search"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {["ALL", "PERSON", "ORGANIZATION", "DOCUMENT", "TRANSACTION", "ASSET"].map((type) => {
            const Icon = type === "ALL" ? Database : entityIcons[type] ?? Database;
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
                  {counts[type as keyof typeof counts]}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <Database className="w-12 h-12 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No CDM entities found</p>
            <p className="text-xs text-muted-foreground">Entities are created when evidence files are processed and validated</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entity) => <EntityCard key={entity.id} entity={entity} />)}
        </div>
      )}
    </div>
  );
}
