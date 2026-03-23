import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ValidationTask, ExtractionRun, EvidenceFile } from "@shared/schema";
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, Clock, User, ArrowUpRight, Eye, Shield, ScanLine, Info
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

function ReviewDialog({ task, extraction, evidence, open, onClose }: {
  task: ValidationTask;
  extraction?: ExtractionRun;
  evidence?: EvidenceFile;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(task.validatorNotes ?? "");

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            Human Validation — {task.taskCode}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted text-xs">
            <div><span className="text-muted-foreground">File:</span> <span className="font-medium">{evidence?.fileName ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{extraction?.docType ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Trust Score:</span> <span className="font-medium">{Math.round(task.trustScore * 100)}%</span></div>
            <div><span className="text-muted-foreground">Assigned:</span> <span className="font-medium">{task.assignedTo ?? "—"}</span></div>
          </div>

          {Object.keys(fields).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fields to Validate</h4>
              <div className="space-y-2">
                {Object.entries(fields).map(([key, val]) => {
                  const needsValidation = task.fieldsToValidate?.includes(key);
                  return (
                    <div key={key} className={`flex items-center justify-between p-2.5 rounded-md border ${needsValidation ? "border-chart-5/40 bg-chart-5/5" : "border-border"}`} data-testid={`field-row-${key}`}>
                      <div>
                        <p className="text-xs font-medium text-foreground capitalize">{key.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">{String(val)}</p>
                      </div>
                      {needsValidation && <Badge variant="outline" className="text-xs border-chart-5/40 text-chart-5 bg-chart-5/5">Review</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
            <Button
              size="sm"
              className="gap-2 bg-chart-3 text-white border-chart-3"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ status: "APPROVED", notes })}
              data-testid="button-approve"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ status: "REJECTED", notes })}
              data-testid="button-reject"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ status: "NEEDS_RESCAN", notes })}
              data-testid="button-needs-rescan"
            >
              <ScanLine className="w-3.5 h-3.5" /> Needs Rescan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={mutation.isPending}
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
          <p className="text-sm font-semibold text-foreground">Automated triage — only low-trust files require human review</p>
          <p className="text-xs text-muted-foreground">
            Files extracted with a trust score of <strong className="text-foreground">70% or above</strong> are automatically accepted and promoted to the CDM — no human review needed.
            Only files scoring <strong className="text-foreground">below 70%</strong> are queued here for human validation, regardless of whether field conflicts are present.
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
