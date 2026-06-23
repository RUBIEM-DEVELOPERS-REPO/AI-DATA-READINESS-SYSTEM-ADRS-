import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Zap, Target, Award, CheckCircle2, XCircle, AlertCircle, ChevronRight, BarChart3, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FieldResult {
  field_key: string;
  expected: string;
  actual: string;
  match: "exact" | "partial" | "miss";
  normalized_correctly: boolean;
}

interface EvaluationReport {
  docType: string;
  totalFields: number;
  exactMatches: number;
  partialMatches: number;
  misses: number;
  precision: number;
  recall: number;
  f1Score: number;
  normalizationAccuracy: number;
  fieldBreakdown: FieldResult[];
}

const SAMPLE_GROUND_TRUTH = JSON.stringify(
  [
    { field_key: "vendor_name", expected_value: "Acme Corp Ltd", doc_type: "INVOICE" },
    { field_key: "total_amount", expected_value: "1500.00", doc_type: "INVOICE" },
    { field_key: "document_date", expected_value: "2024-01-15", doc_type: "INVOICE" },
  ],
  null,
  2
);

function KpiCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  const pct = Math.round(value * 100);
  const quality = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400";
  return (
    <Card className="glass-panel border-0 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
      <div className={`absolute inset-x-0 top-0 h-1 ${color}`} />
      <CardContent className="p-5 pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
          <div className="w-9 h-9 rounded-xl bg-foreground/5 flex items-center justify-center">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <div className={`text-4xl font-extrabold tracking-tight ${quality}`}>{pct}%</div>
        <Progress value={pct} className="h-1.5 mt-3" />
      </CardContent>
    </Card>
  );
}

function MatchBadge({ match }: { match: "exact" | "partial" | "miss" }) {
  if (match === "exact") return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Exact</Badge>;
  if (match === "partial") return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Partial</Badge>;
  return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs">Miss</Badge>;
}

export default function Evaluate() {
  const { toast } = useToast();
  const [runId, setRunId] = useState("");
  const [groundTruthJson, setGroundTruthJson] = useState(SAMPLE_GROUND_TRUTH);
  const [report, setReport] = useState<EvaluationReport | null>(null);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      let groundTruth;
      try {
        groundTruth = JSON.parse(groundTruthJson);
      } catch {
        throw new Error("Invalid JSON in Ground Truth input");
      }
      const res = await apiRequest("POST", "/api/evaluate", { extractionRunId: runId, groundTruth });
      return res.json();
    },
    onSuccess: (data: EvaluationReport) => {
      setReport(data);
      toast({ title: "Benchmark complete", description: `F1 Score: ${Math.round(data.f1Score * 100)}%` });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Evaluation failed", description: err.message });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Extraction Benchmarking
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare AI extraction output against ground truth to measure precision, recall, and F1 score.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5 border-primary/30 text-primary bg-primary/5">
          <Zap className="w-3 h-3" /> Evaluation Framework
        </Badge>
      </div>

      <Card className="glass-panel border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Run Configuration
          </CardTitle>
          <CardDescription className="text-xs">Provide an extraction run ID and expected ground truth values.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Extraction Run ID
            </label>
            <Input
              id="input-run-id"
              placeholder="e.g. 3f8a2b1c-..."
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Ground Truth (JSON Array)
            </label>
            <Textarea
              id="textarea-ground-truth"
              value={groundTruthJson}
              onChange={(e) => setGroundTruthJson(e.target.value)}
              rows={8}
              className="font-mono text-xs resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Each entry: <code className="text-primary">field_key</code>, <code className="text-primary">expected_value</code>, <code className="text-primary">doc_type</code>
            </p>
          </div>
          <Button
            id="button-run-benchmark"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending || !runId.trim()}
            className="gap-2"
          >
            <Target className="w-4 h-4" />
            {evaluateMutation.isPending ? "Running..." : "Run Benchmark"}
          </Button>
        </CardContent>
      </Card>

      {report && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold">Benchmark Results</h2>
            <Badge variant="outline" className="text-xs">{report.docType}</Badge>
            <Badge variant="outline" className="text-xs">{report.totalFields} fields evaluated</Badge>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Precision" value={report.precision} icon={Award} color="bg-gradient-to-r from-primary to-primary/60" />
            <KpiCard label="Recall" value={report.recall} icon={BarChart3} color="bg-gradient-to-r from-chart-2 to-chart-2/60" />
            <KpiCard label="F1 Score" value={report.f1Score} icon={Zap} color="bg-gradient-to-r from-chart-3 to-chart-3/60" />
            <KpiCard label="Normalization" value={report.normalizationAccuracy} icon={CheckCircle2} color="bg-gradient-to-r from-chart-4 to-chart-4/60" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Exact Matches", value: report.exactMatches, color: "text-emerald-400" },
              { label: "Partial Matches", value: report.partialMatches, color: "text-amber-400" },
              { label: "Misses", value: report.misses, color: "text-rose-400" },
            ].map((s) => (
              <Card key={s.label} className="glass-panel border-0 text-center p-4">
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </Card>
            ))}
          </div>

          <Card className="glass-panel border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Field-Level Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["Field", "Expected", "Extracted", "Match", "Normalized"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.fieldBreakdown.map((row, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-4 font-mono text-xs text-primary">{row.field_key}</td>
                        <td className="py-2.5 pr-4 text-xs text-foreground max-w-[140px] truncate">{row.expected || "—"}</td>
                        <td className="py-2.5 pr-4 text-xs text-muted-foreground max-w-[140px] truncate">{row.actual || <span className="text-rose-400 italic">not found</span>}</td>
                        <td className="py-2.5 pr-4"><MatchBadge match={row.match} /></td>
                        <td className="py-2.5">
                          {row.normalized_correctly
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <XCircle className="w-4 h-4 text-rose-400" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
