import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ValidationTask, ExtractionRun, EvidenceFile, ConflictDetail, ConflictResolution } from "@shared/schema";
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, Clock, User, ArrowUpRight,
  Eye, Shield, ScanLine, Info, GitMerge, CheckCheck, ChevronDown, ChevronUp, Pencil
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusColors: Record<string, string> = {
  PENDING_EXTRACTION: "bg-muted text-muted-foreground border-border",
  PENDING_VALIDATION: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  APPROVED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  NEEDS_RESCAN: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  ESCALATED: "bg-primary/15 text-primary border-primary/30",
};

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  PENDING_EXTRACTION: Clock,
  PENDING_VALIDATION: AlertTriangle,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  NEEDS_RESCAN: ScanLine,
  ESCALATED: ArrowUpRight,
};

function ValidationCard({ task, extraction, evidence, onAction }: {
  task: ValidationTask;
  extraction?: ExtractionRun;
  evidence?: EvidenceFile;
  onAction: (task: ValidationTask) => void;
}) {
  const StatusIcon = statusIcons[task.status] ?? Clock;
  const trustPct = Math.round(task.trustScore * 100);
  const isPending = task.status === "PENDING_VALIDATION" || task.status === "ESCALATED";

  return (
    <Card data-testid={`card-validation-${task.id}`} className={`flex flex-col ${isPending ? "border-chart-5/40" : ""}`}>
      <CardContent className="p-4 space-y-3 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground font-mono">{task.taskCode}</p>
            <p className="text-xs text-muted-foreground truncate">{evidence?.fileName ?? "Unknown file"}</p>
          </div>
          <Badge variant="outline" className={`text-xs flex-shrink-0 gap-1 ${statusColors[task.status]}`}>
            <StatusIcon className="w-3 h-3" />
            {task.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Trust Score</span>
            <span className={`font-bold ${trustPct >= 75 ? "text-chart-3" : trustPct >= 50 ? "text-chart-5" : "text-destructive"}`}>{trustPct}%</span>
          </div>
          <Progress value={trustPct} className="h-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{task.assignedTo ?? "Unassigned"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Shield className="w-3 h-3 flex-shrink-0" />
            <span>Stage {task.approvalStage}/{task.maxApprovalStages}</span>
          </div>
        </div>

        {/* Conflict indicator */}
        {Array.isArray(task.conflictDetails) && (task.conflictDetails as ConflictDetail[]).length > 0 && (() => {
          const conflicts = task.conflictDetails as ConflictDetail[];
          const unresolved = conflicts.filter(d => !d.resolved).length;
          return (
            <div className="flex items-center gap-1.5">
              <GitMerge className="w-3 h-3 text-destructive" />
              <span className="text-xs text-destructive font-medium">
                {unresolved > 0 ? `${unresolved} conflict${unresolved !== 1 ? "s" : ""} to resolve` : "All conflicts resolved"}
              </span>
              {unresolved === 0 && <CheckCheck className="w-3 h-3 text-chart-3" />}
            </div>
          );
        })()}

        {task.fieldsToValidate && task.fieldsToValidate.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {[...new Set(task.fieldsToValidate)].slice(0, 3).map((f, i) => (
              <Badge key={`${i}-${f}`} variant="outline" className="text-xs h-5">{f}</Badge>
            ))}
            {task.fieldsToValidate.length > 3 && (
              <Badge variant="outline" className="text-xs h-5">+{task.fieldsToValidate.length - 3}</Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
          </span>
          {isPending && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAction(task)} data-testid={`button-review-${task.id}`}>
              <Eye className="w-3 h-3" /> Review
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Conflict resolution panel ───────────────────────────────────────────────
type ResolutionState = Record<string, { chosen_value: string; source: "option_a" | "option_b" | "custom"; custom_text: string }>;

function ConflictPanel({ task, onResolved }: { task: ValidationTask; onResolved: () => void }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const details: ConflictDetail[] = (task.conflictDetails as ConflictDetail[]) ?? [];
  const [resolutions, setResolutions] = useState<ResolutionState>(() =>
    Object.fromEntries(details.map(d => [d.field_key, { chosen_value: d.chosen_value, source: "option_a", custom_text: "" }]))
  );
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    setResolutions(Object.fromEntries(details.map(d => [d.field_key, { chosen_value: d.resolved_value ?? d.chosen_value, source: d.resolved_source ?? "option_a", custom_text: d.resolved_value ?? "" }])));
  }, [task.id]);

  const unresolvedDetails = details.filter(d => !d.resolved);
  const resolvedDetails   = details.filter(d => d.resolved);

  const resolveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/validation/${task.id}/resolve-conflict`, {
      resolutions: unresolvedDetails.map(d => ({
        field_key: d.field_key,
        chosen_value: resolutions[d.field_key]?.source === "custom"
          ? resolutions[d.field_key]?.custom_text
          : resolutions[d.field_key]?.chosen_value,
        source: resolutions[d.field_key]?.source ?? "option_a",
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation"] });
      toast({ title: "Conflicts resolved", description: "Your decisions have been applied and audited." });
      onResolved();
    },
    onError: () => toast({ title: "Error", description: "Failed to apply conflict resolutions.", variant: "destructive" }),
  });

  if (details.length === 0) return null;

  const selectOption = (fieldKey: string, idx: number) => {
    const d = details.find(x => x.field_key === fieldKey);
    if (!d) return;
    setResolutions(prev => ({
      ...prev,
      [fieldKey]: { chosen_value: d.options[idx]?.value ?? "", source: idx === 0 ? "option_a" : "option_b", custom_text: prev[fieldKey]?.custom_text ?? "" },
    }));
  };

  const selectCustom = (fieldKey: string, text: string) => {
    setResolutions(prev => ({
      ...prev,
      [fieldKey]: { chosen_value: text, source: "custom", custom_text: text },
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitMerge className="w-4 h-4 text-destructive" />
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
          Field Conflicts — {unresolvedDetails.length} unresolved
        </h4>
        {unresolvedDetails.length > 0 && (
          <Badge variant="outline" className="text-xs border-destructive/40 text-destructive bg-destructive/5 ml-auto">Needs Resolution</Badge>
        )}
      </div>

      {unresolvedDetails.map((d) => {
        const res = resolutions[d.field_key];
        return (
          <div key={d.field_key} className="rounded-lg border border-chart-5/30 bg-chart-5/3 p-3 space-y-2" data-testid={`conflict-field-${d.field_key}`}>
            <p className="text-xs font-semibold text-foreground capitalize">{d.field_key.replace(/_/g, " ")}</p>

            {d.options.map((opt, idx) => {
              const isSelected = res?.source === (idx === 0 ? "option_a" : "option_b");
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectOption(d.field_key, idx)}
                  data-testid={`conflict-option-${d.field_key}-${idx}`}
                  className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-md border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-background hover:border-primary/40 hover:bg-primary/3"
                  }`}
                >
                  <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${isSelected ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Option {String.fromCharCode(65 + idx)}
                      </span>
                      <Badge variant="outline" className={`text-[10px] h-4 px-1 ${opt.confidence >= 0.85 ? "border-chart-3/40 text-chart-3 bg-chart-3/5" : "border-chart-5/40 text-chart-5 bg-chart-5/5"}`}>
                        {Math.round(opt.confidence * 100)}% confidence
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">from: {opt.source_field}</span>
                    </div>
                    <p className="text-xs font-medium text-foreground mt-0.5 break-all">{opt.value}</p>
                  </div>
                </button>
              );
            })}

            {/* Custom value option */}
            <div
              className={`flex items-start gap-2.5 p-2.5 rounded-md border transition-colors cursor-pointer ${
                res?.source === "custom"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-background"
              }`}
              onClick={() => selectCustom(d.field_key, res?.custom_text ?? "")}
              data-testid={`conflict-custom-${d.field_key}`}
            >
              <span className={`mt-2 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${res?.source === "custom" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Custom Value</span>
                </div>
                <Input
                  value={res?.custom_text ?? ""}
                  onChange={(e) => { e.stopPropagation(); selectCustom(d.field_key, e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Type the correct value..."
                  className="h-7 text-xs"
                  data-testid={`conflict-custom-input-${d.field_key}`}
                />
              </div>
            </div>
          </div>
        );
      })}

      {unresolvedDetails.length > 0 && (
        <Button
          size="sm"
          className="w-full gap-2 bg-primary text-primary-foreground"
          disabled={resolveMutation.isPending || !can("REVIEWER") || unresolvedDetails.some(d => resolutions[d.field_key]?.source === "custom" && !resolutions[d.field_key]?.custom_text?.trim())}
          onClick={() => resolveMutation.mutate()}
          data-testid="button-apply-resolutions"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          {resolveMutation.isPending ? "Applying…" : `Apply ${unresolvedDetails.length} Resolution${unresolvedDetails.length !== 1 ? "s" : ""}`}
        </Button>
      )}

      {resolvedDetails.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowResolved(v => !v)}
            data-testid="toggle-resolved-conflicts"
          >
            {showResolved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {resolvedDetails.length} resolved conflict{resolvedDetails.length !== 1 ? "s" : ""}
          </button>
          {showResolved && (
            <div className="mt-2 space-y-1.5">
              {resolvedDetails.map(d => (
                <div key={d.field_key} className="flex items-center gap-2 p-2 rounded-md border border-chart-3/20 bg-chart-3/5 text-xs" data-testid={`resolved-conflict-${d.field_key}`}>
                  <CheckCheck className="w-3.5 h-3.5 text-chart-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium capitalize">{d.field_key.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-mono">{d.resolved_value}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {d.resolved_by} · {d.resolved_at ? new Date(d.resolved_at).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Review dialog ────────────────────────────────────────────────────────────
function ReviewDialog({ task, extraction, evidence, open, onClose }: {
  task: ValidationTask;
  extraction?: ExtractionRun;
  evidence?: EvidenceFile;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { can } = useAuth();
  const [notes, setNotes] = useState(task.validatorNotes ?? "");
  const [localTask, setLocalTask] = useState<ValidationTask>(task);

  // Re-fetch task when conflicts are resolved so the panel refreshes
  const { data: freshTask } = useQuery<ValidationTask>({
    queryKey: ["/api/validation", task.id],
    queryFn: () => fetch(`/api/validation/${task.id}`).then(r => r.json()),
    enabled: open,
    refetchInterval: false,
  });
  const displayTask = freshTask ?? localTask;

  const mutation = useMutation({
    mutationFn: ({ status, notes }: { status: string; notes: string }) =>
      apiRequest("PATCH", `/api/validation/${task.id}`, { status, validatorNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Validation updated", description: "Task status has been updated." });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to update validation task.", variant: "destructive" }),
  });

  const fields = (extraction?.extractedFields as Record<string, any>) ?? {};
  const entities = (extraction?.extractedEntities as any[]) ?? [];
  const hasConflicts = Array.isArray(displayTask.conflictDetails) && (displayTask.conflictDetails as ConflictDetail[]).length > 0;
  const unresolvedCount = hasConflicts ? (displayTask.conflictDetails as ConflictDetail[]).filter(d => !d.resolved).length : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            Human Validation — {task.taskCode}
            {unresolvedCount > 0 && (
              <Badge variant="outline" className="ml-2 text-xs border-destructive/40 text-destructive bg-destructive/5">
                {unresolvedCount} conflict{unresolvedCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted text-xs">
            <div><span className="text-muted-foreground">File:</span> <span className="font-medium">{evidence?.fileName ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{extraction?.docType ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Trust Score:</span>
              <span className={`font-medium ml-1 ${Math.round(task.trustScore * 100) >= 70 ? "text-chart-3" : "text-destructive"}`}>
                {Math.round(task.trustScore * 100)}%
              </span>
            </div>
            <div><span className="text-muted-foreground">Policy:</span> <span className="font-medium">{task.approvalPolicyRule ?? "—"}</span></div>
          </div>

          {task.approvalPolicyReason && (
            <div className="flex items-start gap-2 p-2.5 rounded-md border border-chart-5/30 bg-chart-5/5 text-xs text-chart-5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{task.approvalPolicyReason}</span>
            </div>
          )}

          {/* ── Conflict Resolution Panel ── */}
          {hasConflicts && (
            <>
              <Separator />
              <ConflictPanel
                task={displayTask}
                onResolved={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/validation"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/validation", task.id] });
                }}
              />
              <Separator />
            </>
          )}

          {/* ── Fields ── */}
          {Object.keys(fields).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Extracted Fields</h4>
              <div className="space-y-1.5">
                {Object.entries(fields).map(([key, val]) => {
                  const needsValidation = task.fieldsToValidate?.includes(key);
                  const isConflict = hasConflicts && (displayTask.conflictDetails as ConflictDetail[]).some(d => d.field_key === key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-2.5 rounded-md border text-xs ${
                        isConflict ? "border-destructive/30 bg-destructive/5" :
                        needsValidation ? "border-chart-5/40 bg-chart-5/5" : "border-border"
                      }`}
                      data-testid={`field-row-${key}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium capitalize">{key.replace(/_/g, " ")}</p>
                        <p className="text-muted-foreground truncate">{String(val)}</p>
                      </div>
                      {isConflict && <Badge variant="outline" className="text-xs border-destructive/40 text-destructive bg-destructive/5 ml-2 flex-shrink-0">Conflict</Badge>}
                      {!isConflict && needsValidation && <Badge variant="outline" className="text-xs border-chart-5/40 text-chart-5 bg-chart-5/5 ml-2 flex-shrink-0">Review</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Entities ── */}
          {entities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Extracted Entities</h4>
              <div className="space-y-1">
                {entities.slice(0, 5).map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted">
                    <span className="text-muted-foreground">{e.entity}</span>
                    <span className="font-medium text-foreground">{e.value}</span>
                    <Badge variant="outline" className="text-xs">{Math.round(e.confidence * 100)}%</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Validator Notes ── */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Validator Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this validation decision..."
              className="text-sm"
              data-testid="input-validator-notes"
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
            <Button
              size="sm"
              className="gap-2 bg-chart-3 text-white border-chart-3"
              disabled={mutation.isPending || !can("REVIEWER")}
              onClick={() => mutation.mutate({ status: "APPROVED", notes })}
              data-testid="button-approve"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              disabled={mutation.isPending || !can("REVIEWER")}
              onClick={() => mutation.mutate({ status: "REJECTED", notes })}
              data-testid="button-reject"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={mutation.isPending || !can("REVIEWER")}
              onClick={() => mutation.mutate({ status: "NEEDS_RESCAN", notes })}
              data-testid="button-needs-rescan"
            >
              <ScanLine className="w-3.5 h-3.5" /> Needs Rescan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={mutation.isPending || !can("REVIEWER")}
              onClick={() => mutation.mutate({ status: "ESCALATED", notes })}
              data-testid="button-escalate"
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Escalate
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Validation() {
  const [activeTab, setActiveTab] = useState("all");
  const [reviewTask, setReviewTask] = useState<ValidationTask | null>(null);

  const { data: tasks, isLoading } = useQuery<ValidationTask[]>({ queryKey: ["/api/validation"] });
  const { data: extractions } = useQuery<ExtractionRun[]>({ queryKey: ["/api/extractions"] });
  const { data: files } = useQuery<EvidenceFile[]>({ queryKey: ["/api/evidence"] });

  const extractionMap = new Map((extractions ?? []).map(e => [e.id, e]));
  const evidenceMap = new Map((files ?? []).map(f => [f.id, f]));

  const filterMap: Record<string, (t: ValidationTask) => boolean> = {
    all: () => true,
    pending: (t) => t.status === "PENDING_VALIDATION" || t.status === "ESCALATED",
    approved: (t) => t.status === "APPROVED",
    rejected: (t) => t.status === "REJECTED" || t.status === "NEEDS_RESCAN",
  };

  const filtered = (tasks ?? []).filter(filterMap[activeTab] ?? (() => true));

  const counts = {
    all: tasks?.length ?? 0,
    pending: tasks?.filter(t => t.status === "PENDING_VALIDATION" || t.status === "ESCALATED").length ?? 0,
    approved: tasks?.filter(t => t.status === "APPROVED").length ?? 0,
    rejected: tasks?.filter(t => t.status === "REJECTED" || t.status === "NEEDS_RESCAN").length ?? 0,
  };

  const reviewExtraction = reviewTask ? extractionMap.get(reviewTask.extractionRunId) : undefined;
  const reviewEvidence = reviewTask ? evidenceMap.get(reviewTask.evidenceId) : undefined;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="heading-validation">Trust & Validation</h1>
        <p className="text-sm text-muted-foreground mt-1">Human-in-the-loop validation workflow for extracted records</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-chart-2/30 bg-chart-2/5" data-testid="banner-validation-threshold">
        <Info className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">Automated triage — two conditions trigger human review</p>
          <p className="text-xs text-muted-foreground">
            Files are queued here when the trust score falls <strong className="text-foreground">below 70%</strong>, or when the AI detected
            <strong className="text-foreground"> conflicting values</strong> for the same field from different sources.
            Conflicts must be explicitly resolved by a human before the record is promoted to the CDM. Every resolution is fully audited.
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-center text-center ml-auto pl-3 border-l border-chart-2/20">
          <span className="text-xl font-bold text-chart-2">70%</span>
          <span className="text-[10px] text-muted-foreground leading-tight">threshold</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Tasks", value: counts.all, icon: CheckSquare, color: "text-foreground" },
          { label: "Pending Review", value: counts.pending, icon: AlertTriangle, color: "text-chart-5" },
          { label: "Approved", value: counts.approved, icon: CheckCircle2, color: "text-chart-3" },
          { label: "Rejected / Rescan", value: counts.rejected, icon: XCircle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{isLoading ? "—" : s.value}</p>
              </div>
              <s.icon className={`w-6 h-6 ${s.color} opacity-70`} />
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-xs gap-1.5">All <Badge variant="secondary" className="text-xs h-4 px-1">{counts.all}</Badge></TabsTrigger>
          <TabsTrigger value="pending" className="text-xs gap-1.5">
            Pending
            {counts.pending > 0 && <Badge variant="destructive" className="text-xs h-4 px-1">{counts.pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-xs gap-1.5">Approved <Badge variant="secondary" className="text-xs h-4 px-1">{counts.approved}</Badge></TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs gap-1.5">Rejected <Badge variant="secondary" className="text-xs h-4 px-1">{counts.rejected}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-36 w-full" /></CardContent></Card>)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
                <CheckSquare className="w-12 h-12 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium text-muted-foreground">No validation tasks in this category</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((task) => (
                <ValidationCard
                  key={task.id}
                  task={task}
                  extraction={extractionMap.get(task.extractionRunId)}
                  evidence={evidenceMap.get(task.evidenceId)}
                  onAction={setReviewTask}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {reviewTask && (
        <ReviewDialog
          key={reviewTask.id}
          task={reviewTask}
          extraction={reviewExtraction}
          evidence={reviewEvidence}
          open={!!reviewTask}
          onClose={() => setReviewTask(null)}
        />
      )}
    </div>
  );
}
