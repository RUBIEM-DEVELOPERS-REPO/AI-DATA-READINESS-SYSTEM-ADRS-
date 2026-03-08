import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExtractionRun, EvidenceFile, NormalizedAttribute } from "@shared/schema";
import { Brain, TrendingUp, Eye, Tag, Zap, Activity, CheckCircle2, AlertTriangle, Shield, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const docTypeColors: Record<string, string> = {
  INVOICE: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  CONTRACT: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  REPORT: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  PERMIT: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  IDENTITY: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  FINANCIAL: "bg-primary/15 text-primary border-primary/30",
  CORRESPONDENCE: "bg-muted text-muted-foreground border-border",
  OTHER: "bg-muted text-muted-foreground border-border",
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${color}`}>{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

interface ExtractedEntity {
  entity: string;
  value: string;
  confidence: number;
  evidence_pointer?: string;
}

interface ExtractedTable {
  table_id: string;
  rows: string[][];
  confidence: number;
}

const validationStateConfig = {
  AUTO_APPROVED: { label: "Auto-Approved", color: "bg-chart-3/15 text-chart-3 border-chart-3/30", icon: CheckCircle2 },
  APPROVED: { label: "Approved", color: "bg-chart-2/15 text-chart-2 border-chart-2/30", icon: CheckCircle2 },
  PENDING: { label: "Pending Review", color: "bg-chart-5/15 text-chart-5 border-chart-5/30", icon: AlertTriangle },
  REJECTED: { label: "Rejected", color: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
};

const subjectColors: Record<string, string> = {
  DOCUMENT: "bg-chart-1/10 text-chart-1",
  PARTY: "bg-chart-2/10 text-chart-2",
  OBJECT: "bg-chart-4/10 text-chart-4",
  EVENT: "bg-chart-5/10 text-chart-5",
};

function NormalizedAttributeRow({ attr }: { attr: NormalizedAttribute }) {
  const state = validationStateConfig[attr.validation_state] ?? validationStateConfig.PENDING;
  const StateIcon = state.icon;
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-md border border-border" data-testid={`attr-row-${attr.field_key}`}>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground font-mono">{attr.field_key}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${subjectColors[attr.subject_type] ?? ""}`}>{attr.subject_type}</span>
          <Badge variant="outline" className="text-xs">{attr.normalized_value_type}</Badge>
          <Badge variant="outline" className={`text-xs ${state.color}`}><StateIcon className="w-2.5 h-2.5 mr-1" />{state.label}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground flex-shrink-0">Raw:</span>
          <span className="text-foreground truncate font-mono">{attr.value_raw}</span>
        </div>
        {attr.value_normalized !== attr.value_raw && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground flex-shrink-0">Normalized:</span>
            <span className="text-chart-3 truncate font-mono font-medium">{attr.value_normalized}</span>
          </div>
        )}
        {attr.normalization_status === "FAILED" && attr.normalization_error && (
          <p className="text-xs text-destructive">{attr.normalization_error}</p>
        )}
        {attr.approval_policy_reason && (
          <p className="text-xs text-muted-foreground italic">{attr.approval_policy_reason}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs font-semibold text-foreground">{Math.round(attr.confidence_score * 100)}%</span>
        <span className="text-xs text-muted-foreground">conf.</span>
      </div>
    </div>
  );
}

function ExtractionDetail({ run, evidenceFileName }: { run: ExtractionRun; evidenceFileName: string }) {
  const entities = (run.extractedEntities as ExtractedEntity[] | null) ?? [];
  const tables = (run.extractedTables as ExtractedTable[] | null) ?? [];
  const fields = (run.extractedFields as Record<string, any> | null) ?? {};
  const attrs = (run.extractedAttributes as NormalizedAttribute[] | null) ?? [];
  const qgReport = run.qualityGatesReport as any;
  const trustBreakdown = run.trustScoreBreakdown as Record<string, number> | null;

  const pendingAttrs = attrs.filter(a => a.validation_state === "PENDING").length;
  const approvedAttrs = attrs.filter(a => a.validation_state === "AUTO_APPROVED" || a.validation_state === "APPROVED").length;

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full grid grid-cols-5 h-9">
        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
        <TabsTrigger value="normalized" className="text-xs">
          Normalized {pendingAttrs > 0 && <span className="ml-1 px-1.5 rounded-full text-xs bg-chart-5/20 text-chart-5">{pendingAttrs}</span>}
        </TabsTrigger>
        <TabsTrigger value="entities" className="text-xs">Entities ({entities.length})</TabsTrigger>
        <TabsTrigger value="tables" className="text-xs">Tables ({tables.length})</TabsTrigger>
        <TabsTrigger value="text" className="text-xs">Raw Text</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trust Score Breakdown</h4>
            <ScoreBar label="OCR Confidence (×0.35)" value={run.ocrConfidence} color="text-chart-1" />
            <ScoreBar label="Extraction (×0.25)" value={run.extractionConfidence} color="text-chart-2" />
            <ScoreBar label="Completeness (×0.15)" value={run.completenessScore} color="text-chart-3" />
            <ScoreBar label="Consistency (×0.15)" value={run.consistencyScore} color="text-chart-4" />
            <ScoreBar label="Doc Quality (×0.10)" value={run.docQualityScore} color="text-chart-5" />
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Processing Info</h4>
            <div className="space-y-2">
              {[
                { label: "Document Type", value: run.docType },
                { label: "Type Confidence", value: `${Math.round(run.docTypeConfidence * 100)}%` },
                { label: "Model Version", value: run.modelVersion },
                { label: "Processing Time", value: `${run.processingTimeMs}ms` },
                { label: "Trust Score", value: `${Math.round(run.trustScore * 100)}%` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
            {qgReport && (
              <div className="mt-2 p-2.5 rounded-md border border-border">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield className="w-3 h-3 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Quality Gates</span>
                  <Badge variant="outline" className={`text-xs ml-auto ${qgReport.passed ? "text-chart-3 border-chart-3/30" : "text-destructive border-destructive/30"}`}>
                    {qgReport.passed ? "Passed" : "Failed"}
                  </Badge>
                </div>
                {(qgReport.checks ?? []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs mt-1">
                    {c.passed ? <CheckCircle2 className="w-3 h-3 text-chart-3 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 text-chart-5 flex-shrink-0" />}
                    <span className="text-muted-foreground">{c.rule}:</span>
                    <span className="text-foreground">{c.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {attrs.length > 0 && (
          <div className="flex items-center gap-3 p-2.5 rounded-md bg-muted text-xs">
            <span className="text-muted-foreground">Normalized attributes:</span>
            <span className="font-semibold text-chart-3">{approvedAttrs} auto-approved</span>
            {pendingAttrs > 0 && <span className="font-semibold text-chart-5">{pendingAttrs} need review</span>}
            <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
            <span className="text-muted-foreground">See Normalized tab →</span>
          </div>
        )}
        {Object.keys(fields).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Raw Extracted Fields</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(fields).map(([key, val]) => (
                <div key={key} className="flex flex-col gap-0.5 p-2 rounded bg-muted">
                  <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-xs font-medium text-foreground truncate">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="normalized" className="mt-4">
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-2">
            {attrs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No normalized attributes available</p>
            ) : (
              <>
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted text-xs mb-3">
                  <span className="text-muted-foreground">Subject types:</span>
                  {["DOCUMENT", "PARTY", "OBJECT", "EVENT"].map(t => {
                    const c = attrs.filter(a => a.subject_type === t).length;
                    return c > 0 ? (
                      <span key={t} className={`px-1.5 py-0.5 rounded font-medium ${subjectColors[t]}`}>{t}: {c}</span>
                    ) : null;
                  })}
                </div>
                {attrs.map((attr, i) => <NormalizedAttributeRow key={i} attr={attr} />)}
              </>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="entities" className="mt-4">
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-2">
            {entities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No entities extracted</p>
            ) : entities.map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-md border border-border" data-testid={`entity-item-${i}`}>
                <Tag className="w-3.5 h-3.5 text-chart-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{e.entity}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.value}</p>
                </div>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {Math.round(e.confidence * 100)}%
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="tables" className="mt-4">
        <ScrollArea className="h-72">
          <div className="space-y-4 pr-2">
            {tables.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tables extracted</p>
            ) : tables.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{t.table_id}</span>
                  <Badge variant="outline" className="text-xs">{Math.round(t.confidence * 100)}% confidence</Badge>
                </div>
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        {(t.rows[0] ?? []).map((cell, ci) => (
                          <th key={ci} className="px-2 py-1.5 text-left font-semibold text-foreground border-b border-border">{cell}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.slice(1).map((row, ri) => (
                        <tr key={ri} className="border-b border-border last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1.5 text-muted-foreground">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="text" className="mt-4">
        <ScrollArea className="h-72">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed p-1 pr-4">
            {run.rawText || "No raw text available"}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function RunCard({ run, evidence }: { run: ExtractionRun; evidence?: EvidenceFile }) {
  const [open, setOpen] = useState(false);
  const trustPct = Math.round(run.trustScore * 100);
  const trustColor = trustPct >= 75 ? "text-chart-3" : trustPct >= 50 ? "text-chart-5" : "text-destructive";

  return (
    <>
      <Card data-testid={`card-extraction-${run.id}`} className="flex flex-col">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{evidence?.fileName ?? "Unknown file"}</p>
              <p className="text-xs text-muted-foreground font-mono">{evidence?.evidenceCode ?? run.evidenceId.slice(0, 8)}</p>
            </div>
            <Badge variant="outline" className={`text-xs flex-shrink-0 ${docTypeColors[run.docType]}`}>
              {run.docType}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Brain className="w-3 h-3" /> Trust Score</span>
              <span className={`font-bold ${trustColor}`}>{trustPct}%</span>
            </div>
            <Progress value={trustPct} className="h-1.5" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-1.5 rounded bg-muted">
              <p className="text-xs font-semibold text-foreground">{Math.round(run.ocrConfidence * 100)}%</p>
              <p className="text-xs text-muted-foreground">OCR</p>
            </div>
            <div className="p-1.5 rounded bg-muted">
              <p className="text-xs font-semibold text-foreground">{Math.round(run.extractionConfidence * 100)}%</p>
              <p className="text-xs text-muted-foreground">Extraction</p>
            </div>
            <div className="p-1.5 rounded bg-muted">
              <p className="text-xs font-semibold text-foreground">{Math.round(run.completenessScore * 100)}%</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setOpen(true)} data-testid={`button-view-run-${run.id}`}>
              <Eye className="w-3 h-3" /> Details
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Extraction Report — {evidence?.fileName ?? "Unknown"}
            </DialogTitle>
          </DialogHeader>
          <ExtractionDetail run={run} evidenceFileName={evidence?.fileName ?? ""} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Intelligence() {
  const { data: runs, isLoading: runsLoading } = useQuery<ExtractionRun[]>({ queryKey: ["/api/extractions"] });
  const { data: files } = useQuery<EvidenceFile[]>({ queryKey: ["/api/evidence"] });

  const evidenceMap = new Map((files ?? []).map(f => [f.id, f]));

  const avgTrust = runs?.length ? (runs.reduce((acc, r) => acc + r.trustScore, 0) / runs.length) * 100 : 0;
  const highTrust = runs?.filter(r => r.trustScore >= 0.75).length ?? 0;
  const lowTrust = runs?.filter(r => r.trustScore < 0.5).length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="heading-intelligence">Document Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">OCR extraction results, entity detection, and confidence scoring</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Total Runs</p><p className="text-2xl font-bold">{runsLoading ? "—" : runs?.length ?? 0}</p></div>
            <Activity className="w-6 h-6 text-primary opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Avg Trust</p><p className="text-2xl font-bold">{runsLoading ? "—" : `${Math.round(avgTrust)}%`}</p></div>
            <Brain className="w-6 h-6 text-chart-2 opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">High Trust</p><p className="text-2xl font-bold text-chart-3">{runsLoading ? "—" : highTrust}</p></div>
            <TrendingUp className="w-6 h-6 text-chart-3 opacity-70" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">Low Trust</p><p className="text-2xl font-bold text-destructive">{runsLoading ? "—" : lowTrust}</p></div>
            <Zap className="w-6 h-6 text-destructive opacity-70" />
          </div>
        </CardContent></Card>
      </div>

      {runsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-36 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (runs ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <Brain className="w-12 h-12 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No extraction runs yet</p>
            <p className="text-xs text-muted-foreground">Ingest evidence files to trigger document intelligence processing</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(runs ?? []).map((run) => (
            <RunCard key={run.id} run={run} evidence={evidenceMap.get(run.evidenceId)} />
          ))}
        </div>
      )}
    </div>
  );
}
