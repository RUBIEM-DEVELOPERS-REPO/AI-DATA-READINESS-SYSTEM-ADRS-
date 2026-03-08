import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderOpen, CheckSquare, Database, Upload, TrendingUp, Clock, ArrowRight, Shield,
  Brain, BarChart3, Activity, FileText, AlertTriangle
} from "lucide-react";
import type { AuditLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface DashboardStats {
  totalEvidence: number;
  pendingValidation: number;
  publishedDatasets: number;
  cdmEntities: number;
  avgTrustScore: number;
  recentActivity: AuditLog[];
}

function StatCard({ title, value, subtitle, icon: Icon, trend, color, href }: {
  title: string; value: string | number; subtitle?: string; icon: React.ComponentType<{ className?: string }>;
  trend?: string; color: string; href?: string;
}) {
  return (
    <Card className="relative" data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
            <span className="text-3xl font-bold text-foreground">{value}</span>
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            {trend && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3 text-chart-3" />
                {trend}
              </span>
            )}
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {href && (
          <Link href={href}>
            <span className="mt-3 flex items-center gap-1 text-xs text-muted-foreground cursor-pointer group-hover:text-foreground transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineStageCard({ stage, label, count, status }: {
  stage: number; label: string; count: number; status: "active" | "warning" | "success" | "muted";
}) {
  const colors = {
    active: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-destructive/10 text-destructive border-destructive/20",
    success: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-md border ${colors[status]}`} data-testid={`pipeline-stage-${stage}`}>
      <span className="w-6 h-6 rounded-full bg-current/10 flex items-center justify-center text-xs font-bold flex-shrink-0">{stage}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
      </div>
      <Badge variant="outline" className="text-xs border-current/30 text-current bg-transparent">
        {count}
      </Badge>
    </div>
  );
}

function ActivityItem({ log }: { log: AuditLog }) {
  const actionColors: Record<string, string> = {
    EVIDENCE_INGESTED: "text-chart-1",
    VALIDATION_APPROVED: "text-chart-3",
    VALIDATION_REJECTED: "text-destructive",
    DATASET_PUBLISHED: "text-chart-2",
    ENTITY_CREATED: "text-chart-4",
    BATCH_CREATED: "text-chart-5",
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0" data-testid={`activity-item-${log.id}`}>
      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground font-medium leading-snug">
          <span className={actionColors[log.action] || "text-foreground"}>{log.action.replace(/_/g, " ")}</span>
          {log.resourceId && <span className="text-muted-foreground"> · {log.resourceId.slice(0, 8)}...</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{log.userId} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const avgTrust = stats?.avgTrustScore ?? 0;
  const trustPct = Math.round(avgTrust * 100);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-dashboard">Data Readiness System</h1>
          <p className="text-sm text-muted-foreground mt-1">End-to-end pipeline from raw evidence to AI-ready datasets</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-online" />
            All Systems Operational
          </Badge>
          <Badge variant="outline" className="text-xs">v1.0 · DRS</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard
              title="Evidence Files"
              value={stats?.totalEvidence ?? 0}
              subtitle="Ingested & immutable"
              icon={FolderOpen}
              color="bg-primary/10 text-primary"
              href="/evidence"
            />
            <StatCard
              title="Pending Validation"
              value={stats?.pendingValidation ?? 0}
              subtitle="Awaiting human review"
              icon={CheckSquare}
              color="bg-destructive/10 text-destructive"
              href="/validation"
            />
            <StatCard
              title="CDM Entities"
              value={stats?.cdmEntities ?? 0}
              subtitle="Canonical records"
              icon={Database}
              color="bg-chart-2/10 text-chart-2"
              href="/cdm"
            />
            <StatCard
              title="Published Datasets"
              value={stats?.publishedDatasets ?? 0}
              subtitle="AI-ready exports"
              icon={Upload}
              color="bg-chart-3/10 text-chart-3"
              href="/publishing"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Pipeline Overview
            </CardTitle>
            <CardDescription className="text-xs">Data flow through the DRS processing stages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : (
              <>
                <PipelineStageCard stage={1} label="Physical Operations & Custody" count={3} status="success" />
                <PipelineStageCard stage={2} label="Ingestion & Immutable Evidence" count={stats?.totalEvidence ?? 0} status="active" />
                <PipelineStageCard stage={3} label="Document Intelligence (OCR + Extraction)" count={stats?.totalEvidence ?? 0} status="active" />
                <PipelineStageCard stage={4} label="Trust Scoring & HITL Validation" count={stats?.pendingValidation ?? 0} status={stats?.pendingValidation ? "warning" : "success"} />
                <PipelineStageCard stage={5} label="Canonical Data Model Mapping" count={stats?.cdmEntities ?? 0} status="success" />
                <PipelineStageCard stage={6} label="Dataset Publishing & Export" count={stats?.publishedDatasets ?? 0} status="success" />
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-chart-2" />
                Average Trust Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-20 w-full" /> : (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-foreground" data-testid="text-trust-score">{trustPct}%</span>
                    <span className="text-sm text-muted-foreground mb-1">confidence</span>
                  </div>
                  <Progress value={trustPct} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>OCR + Extraction + Completeness</span>
                    <span className={trustPct >= 75 ? "text-chart-3 font-medium" : trustPct >= 50 ? "text-chart-5 font-medium" : "text-destructive font-medium"}>
                      {trustPct >= 75 ? "High" : trustPct >= 50 ? "Medium" : "Low"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-chart-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-5 pb-3">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
                ) : stats?.recentActivity?.length ? (
                  stats.recentActivity.slice(0, 6).map((log) => (
                    <ActivityItem key={log.id} log={log} />
                  ))
                ) : (
                  <div className="py-6 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">No recent activity</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-4">
                <Link href="/audit">
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                    View Full Audit Log <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Ingest Evidence", icon: FileText, href: "/evidence", desc: "Upload & manage files" },
              { label: "Review Queue", icon: AlertTriangle, href: "/validation", desc: "Validate extractions" },
              { label: "Browse Entities", icon: Database, href: "/cdm", desc: "Canonical data model" },
              { label: "Publish Dataset", icon: Upload, href: "/publishing", desc: "Export AI-ready data" },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <div
                  className="flex flex-col gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate transition-colors"
                  data-testid={`button-quickaction-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <action.icon className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
