import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuditLog } from "@shared/schema";
import { Shield, Search, Filter, FileText, CheckCircle2, Upload, Database, Lock, User, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  EVIDENCE_INGESTED: FileText,
  BATCH_CREATED: FileText,
  VALIDATION_APPROVED: CheckCircle2,
  VALIDATION_REJECTED: AlertTriangle,
  VALIDATION_ESCALATED: AlertTriangle,
  DATASET_PUBLISHED: Upload,
  DATASET_CREATED: Upload,
  ENTITY_CREATED: Database,
  EXTRACTION_COMPLETED: Database,
  LOGIN: User,
  LOGOUT: User,
};

const actionColors: Record<string, string> = {
  EVIDENCE_INGESTED: "text-chart-1 bg-chart-1/10",
  BATCH_CREATED: "text-chart-2 bg-chart-2/10",
  VALIDATION_APPROVED: "text-chart-3 bg-chart-3/10",
  VALIDATION_REJECTED: "text-destructive bg-destructive/10",
  VALIDATION_ESCALATED: "text-chart-4 bg-chart-4/10",
  DATASET_PUBLISHED: "text-chart-5 bg-chart-5/10",
  DATASET_CREATED: "text-primary bg-primary/10",
  ENTITY_CREATED: "text-chart-2 bg-chart-2/10",
  EXTRACTION_COMPLETED: "text-chart-1 bg-chart-1/10",
  LOGIN: "text-muted-foreground bg-muted",
  LOGOUT: "text-muted-foreground bg-muted",
};

const resourceTypeColors: Record<string, string> = {
  EVIDENCE: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  BATCH: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  VALIDATION: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  DATASET: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  CDM: "bg-primary/10 text-primary border-primary/20",
  EXTRACTION: "bg-chart-4/10 text-chart-4 border-chart-4/20",
};

function AuditRow({ log }: { log: AuditLog }) {
  const Icon = actionIcons[log.action] ?? Clock;
  const iconClasses = actionColors[log.action] ?? "text-muted-foreground bg-muted";
  const resColor = resourceTypeColors[log.resourceType] ?? "bg-muted text-muted-foreground border-border";
  const details = log.details as Record<string, any> | null;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0" data-testid={`row-audit-${log.id}`}>
      <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${iconClasses}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{log.action.replace(/_/g, " ")}</span>
          <Badge variant="outline" className={`text-xs ${resColor}`}>{log.resourceType}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> {log.userId}
          </span>
          {log.resourceId && (
            <span className="text-xs text-muted-foreground font-mono">#{log.resourceId.slice(0, 8)}</span>
          )}
          {log.ipAddress && (
            <span className="text-xs text-muted-foreground">{log.ipAddress}</span>
          )}
        </div>
        {details && Object.keys(details).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(details).slice(0, 3).map(([k, v]) => (
              <span key={k} className="text-xs text-muted-foreground">
                <span className="opacity-60">{k}:</span> {String(v)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{format(new Date(log.createdAt), "HH:mm:ss")}</p>
      </div>
    </div>
  );
}

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("ALL");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({ queryKey: ["/api/audit"] });

  const filtered = (logs ?? []).filter(l => {
    const matchSearch = !search || l.action.toLowerCase().includes(search.toLowerCase()) || l.userId.toLowerCase().includes(search.toLowerCase()) || (l.resourceId && l.resourceId.toLowerCase().includes(search.toLowerCase()));
    const matchResource = resourceFilter === "ALL" || l.resourceType === resourceFilter;
    return matchSearch && matchResource;
  });

  const counts = {
    total: logs?.length ?? 0,
    today: logs?.filter(l => new Date(l.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length ?? 0,
    security: logs?.filter(l => l.action.includes("LOGIN") || l.action.includes("ACCESS")).length ?? 0,
    validation: logs?.filter(l => l.resourceType === "VALIDATION").length ?? 0,
  };

  const resourceTypes = ["ALL", ...Array.from(new Set((logs ?? []).map(l => l.resourceType)))];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="heading-audit">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Tamper-evident record of all system actions for compliance and governance</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: counts.total, icon: Shield, color: "text-primary" },
          { label: "Last 24h", value: counts.today, icon: Clock, color: "text-chart-2" },
          { label: "Security Events", value: counts.security, icon: Lock, color: "text-chart-5" },
          { label: "Validation Events", value: counts.validation, icon: CheckCircle2, color: "text-chart-3" },
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Event Log
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-8 w-48 text-xs"
                  data-testid="input-audit-search"
                />
              </div>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-resource-filter">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resourceTypes.map(t => <SelectItem key={t} value={t} className="text-xs">{t === "ALL" ? "All Resources" : t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
          ) : filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Shield className="w-10 h-10 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No audit events found</p>
            </div>
          ) : (
            <div>
              {filtered.map((log) => <AuditRow key={log.id} log={log} />)}
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Showing {filtered.length} of {logs?.length ?? 0} events
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
