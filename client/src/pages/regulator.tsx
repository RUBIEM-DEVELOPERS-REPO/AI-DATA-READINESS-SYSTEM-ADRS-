import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInDays } from "date-fns";
import {
  Shield, Activity, FileText, CheckCircle, XCircle, Clock,
  Database, Globe, Search, AlertTriangle, BarChart3, Eye,
  RefreshCw, AlertCircle, Building2, Users, Calendar, Gavel,
  TrendingUp, ShieldCheck, Lock, Cpu, Zap, FileWarning,
  ChevronRight, Plus, Scale, BookOpen, ListChecks, MapPin, RotateCcw, Mail, Bot
} from "lucide-react";
import {
  PortalAlert,
  PortalKpiCard,
  PortalSection,
  PortalSectionNav,
  PortalWorkflowCard,
  portalNavItems,
} from "@/components/regulator/portal-layout";
import { InlineAgentWidget } from "@/components/inline-agent-widget";

// ─── Types ─────────────────────────────────────────────────────────────────────
type DataController = {
  id: string; controllerCode: string; name: string; contactEmail: string | null;
  organisation: string | null; type: string; sector: string | null;
  riskLevel: string; licenceStatus: string; licenceExpiryDate: string | null; createdAt: string;
};
type DataBreach = {
  id: string; breachCode: string; title: string; severity: string; status: string;
  slaStatus: string; slaDeadline: string | null; incidentDate: string; createdAt: string;
};
type DsrRequest = {
  id: string; requestCode: string; subjectName: string; requestType: string;
  status: string; deadline: string; complaintsCount: number; createdAt: string;
};
type ComplianceAudit = {
  id: string; auditCode: string; title: string; inspectionStatus: string;
  scheduledDate: string; score: number | null; enforcementStatus: string;
  fineAmount: number | null; targetControllerId: string | null; findings: string | null; createdAt: string;
};
type ExternalIntegration = {
  id: string;
  systemName: string;
  displayName?: string;
  integrationType: string;
  connectorType: string;
  enabled: boolean;
  status: string;
  healthStatus: string;
  lastError: string | null;
  nextSyncAt: string | null;
  lastSyncAt: string | null;
  syncLog: string | null;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
};
type ProcessingRecord = {
  id: string; recordCode: string; purpose: string | null; status: string;
  completenessScore: number; lawfulBasisVerified: boolean; excessiveDataDetected: boolean;
  ropaTemplate: string | null; createdAt: string;
};

// ─── Colors ────────────────────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  EXPIRED: "bg-red-500/10 text-red-400 border-red-500/30",
  PENDING_RENEWAL: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  SCHEDULED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  CLOSED: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  NONE: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  WARNING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  FINE_ISSUED: "bg-red-500/10 text-red-400 border-red-500/30",
  CONNECTED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  DISCONNECTED: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  ERROR: "bg-red-500/10 text-red-400 border-red-500/30",
  ON_TRACK: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  AT_RISK: "bg-yellow-500/10 text-yellow-500/30 text-yellow-400",
  BREACHED: "bg-red-500/10 text-red-400 border-red-500/30",
};

const getCompletenessWidthClass = (score: number) => {
  if (score >= 0.9) return "w-full";
  if (score >= 0.75) return "w-5/6";
  if (score >= 0.6) return "w-4/6";
  if (score >= 0.45) return "w-3/6";
  if (score >= 0.3) return "w-2/6";
  if (score >= 0.15) return "w-1/6";
  return "w-10";
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent = "primary" }: any) {
  const clr = (({
    primary: "text-primary border-primary/20 bg-primary/10",
    red: "text-red-400 border-red-500/20 bg-red-500/10",
    yellow: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10",
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
  } as Record<string, string>)[accent]) || "";
  return (
    <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${clr}`}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sector Heatmap ────────────────────────────────────────────────────────────
function SectorHeatmap({ controllers }: { controllers: DataController[] }) {
  const sectorMap: Record<string, { count: number; highRisk: number; expired: number }> = {};
  for (const c of controllers) {
    const s = c.sector || "OTHER";
    if (!sectorMap[s]) sectorMap[s] = { count: 0, highRisk: 0, expired: 0 };
    sectorMap[s].count++;
    if (c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL") sectorMap[s].highRisk++;
    if (c.licenceStatus === "EXPIRED") sectorMap[s].expired++;
  }
  const entries = Object.entries(sectorMap).sort((a, b) => b[1].count - a[1].count);

  const getSectorWidthClass = (count: number) => {
    const ratio = controllers.length ? count / controllers.length : 0;
    if (ratio >= 0.9) return "w-full";
    if (ratio >= 0.75) return "w-5/6";
    if (ratio >= 0.6) return "w-4/6";
    if (ratio >= 0.45) return "w-3/6";
    if (ratio >= 0.3) return "w-2/6";
    if (ratio >= 0.15) return "w-1/6";
    return "w-10";
  };

  return (
    <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />Sectoral Risk Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No controllers registered yet</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([sector, stats]) => {
              const riskScore = stats.count === 0 ? 0 : (stats.highRisk / stats.count);
              const color = riskScore > 0.6 ? "bg-red-500" : riskScore > 0.3 ? "bg-orange-500" : riskScore > 0.1 ? "bg-yellow-500" : "bg-emerald-500";
              return (
                <div key={sector} className="flex items-center gap-3 text-xs">
                  <span className="w-28 text-muted-foreground font-medium truncate">{sector}</span>
                  <div className="flex-1 h-3 rounded-full bg-muted/30 overflow-hidden">
                    <div className={`h-3 rounded-full transition-all ${color} ${getSectorWidthClass(stats.count)}`} />
                  </div>
                  <span className="w-4 text-foreground">{stats.count}</span>
                  {stats.highRisk > 0 && <span className="text-red-400">{stats.highRisk}⚠</span>}
                  {stats.expired > 0 && <span className="text-yellow-400">{stats.expired}✗</span>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tab 1: Overview Dashboard ─────────────────────────────────────────────────
function OverviewTab() {
  const { data: controllers = [] } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });
  const { data: breaches = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/breaches"],
    queryFn: () => apiRequest("GET", "/api/registry/breaches").then(r => r.json()),
  });
  const { data: dsrRequests = [] } = useQuery<DsrRequest[]>({
    queryKey: ["/api/registry/dsr-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-requests").then(r => r.json()),
  });
  const { data: audits = [] } = useQuery<ComplianceAudit[]>({
    queryKey: ["/api/registry/audits"],
    queryFn: () => apiRequest("GET", "/api/registry/audits").then(r => r.json()),
  });
  const { data: records = [] } = useQuery<ProcessingRecord[]>({
    queryKey: ["/api/registry/processing-records"],
    queryFn: () => apiRequest("GET", "/api/registry/processing-records").then(r => r.json()),
  });
  const { data: enforcements = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/enforcements"],
    queryFn: () => apiRequest("GET", "/api/registry/enforcements").then(r => r.json()),
  });
  const { data: appeals = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/appeals"],
    queryFn: () => apiRequest("GET", "/api/registry/appeals").then(r => r.json()),
  });
  const { data: investigations = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/investigations"],
    queryFn: () => apiRequest("GET", "/api/registry/investigations").then(r => r.json()),
  });

  const activeControllers = controllers.filter(c => c.licenceStatus === "ACTIVE").length;
  const expiredLicences = controllers.filter(c => c.licenceStatus === "EXPIRED").length;
  const openBreaches = breaches.filter(b => b.status !== "RESOLVED").length;
  const slaBreached = breaches.filter(b => b.slaStatus === "BREACHED").length;
  const pendingDsr = dsrRequests.filter(r => r.status !== "COMPLETED" && r.status !== "REJECTED").length;
  const overdueDsr = dsrRequests.filter(r => r.status !== "COMPLETED" && differenceInDays(new Date(r.deadline), new Date()) < 0).length;
  const scheduledAudits = audits.filter(a => a.inspectionStatus === "SCHEDULED").length;
  const excessiveDataAlerts = records.filter(r => r.excessiveDataDetected).length;
  const ropaIncomplete = records.filter(r => r.completenessScore < 0.7).length;

  // Section 6 Specific KPIs
  const lateBreachesCount = breaches.filter(b => b.isLate || b.is_late).length;
  const lateBreachPct = breaches.length ? Math.round((lateBreachesCount / breaches.length) * 100) : 0;

  const activeInvestigations = investigations.filter(i => i.status === "ACTIVE" || i.status === "OPEN").length;
  const closedInvestigations = investigations.filter(i => i.status === "CLOSED" || i.status === "RESOLVED").length;

  const level7Cases = enforcements.filter(e => e.penaltyBand === "LEVEL_7").length;
  const level11Cases = enforcements.filter(e => e.penaltyBand === "LEVEL_11").length;

  const appealBacklog = appeals.filter(a => a.status === "PENDING").length;

  const crossBorderTransfers = records.filter(r => {
    const rec = r as any;
    return rec.dataCategories && rec.dataCategories.some((c: string) => c.toLowerCase().includes("international") || c.toLowerCase().includes("cross_border"));
  }).length;

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Controllers" value={activeControllers} sub={`${expiredLicences} expired`} icon={Building2} accent="emerald" />
        <StatCard label="Open Breaches" value={openBreaches} sub={`${slaBreached} SLA breached`} icon={AlertTriangle} accent={openBreaches > 0 ? "red" : "emerald"} />
        <StatCard label="Pending DSR" value={pendingDsr} sub={`${overdueDsr} overdue`} icon={Users} accent={overdueDsr > 0 ? "yellow" : "primary"} />
        <StatCard label="Scheduled Audits" value={scheduledAudits} icon={Calendar} accent="primary" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Breach Late %" value={`${lateBreachPct}%`} sub={`${lateBreachesCount} late reports`} icon={AlertTriangle} accent={lateBreachPct > 20 ? "red" : "emerald"} />
        <StatCard label="Investigations" value={activeInvestigations} sub={`${closedInvestigations} closed`} icon={Search} accent={activeInvestigations > 0 ? "yellow" : "emerald"} />
        <StatCard label="Enforcement Cases" value={enforcements.length} sub={`${level11Cases} Lvl 11 · ${level7Cases} Lvl 7`} icon={Scale} accent={enforcements.length > 0 ? "red" : "emerald"} />
        <StatCard label="Appeal Backlog" value={appealBacklog} icon={Gavel} accent={appealBacklog > 0 ? "red" : "emerald"} />
      </div>

      {/* Charts / Heatmap */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectorHeatmap controllers={controllers} />

        {/* Recurring offenders (multiple breaches or complaints) */}
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-red-400" />Recurring Compliance Issues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {controllers.filter(c => c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No high-risk entities detected</p>
            ) : (
              controllers.filter(c => c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL").slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="font-medium text-foreground">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.sector && <span className="text-muted-foreground">{c.sector}</span>}
                    <Badge variant="outline" className={`text-[9px] px-1 ${RISK_COLORS[c.riskLevel]}`}>{c.riskLevel}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent breaches with SLA status */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" />Active Breach SLA Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          {breaches.filter(b => b.status !== "RESOLVED").length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-70" />
              <p className="text-xs">No active breaches. All systems clear.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {breaches.filter(b => b.status !== "RESOLVED").map(b => (
                <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-primary">{b.breachCode}</span>
                    <span className="text-foreground font-medium truncate max-w-[200px]">{b.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[9px] px-1 ${RISK_COLORS[b.severity]}`}>{b.severity}</Badge>
                    <Badge variant="outline" className={`text-[9px] px-1 ${STATUS_COLORS[b.slaStatus]}`}>SLA: {b.slaStatus}</Badge>
                    {b.slaDeadline && <span className={`text-[10px] ${differenceInDays(new Date(b.slaDeadline), new Date()) < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {differenceInDays(new Date(b.slaDeadline), new Date())}d
                    </span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Audit & Enforcement ─────────────────────────────────────────────────
function AuditTab() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [targetControllerId, setTargetControllerId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [findings, setFindings] = useState("");
  const [score, setScore] = useState("");
  const [enforcement, setEnforcement] = useState("NONE");
  const [fineAmount, setFineAmount] = useState("");

  const { data: controllers = [] } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });
  const { data: audits = [], isLoading } = useQuery<ComplianceAudit[]>({
    queryKey: ["/api/registry/audits"],
    queryFn: () => apiRequest("GET", "/api/registry/audits").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/audits", { title, description, targetControllerId: targetControllerId || null, scheduledDate }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/audits"] });
      setTitle(""); setDescription(""); setTargetControllerId(""); setScheduledDate("");
      toast({ title: "Audit scheduled", description: "Inspection has been added to the compliance calendar." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/registry/audits/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/audits"] });
      setSelectedAuditId(null); setFindings(""); setScore(""); setEnforcement("NONE"); setFineAmount("");
      toast({ title: "Audit updated", description: "Findings and enforcement status saved." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const selectedAudit = audits.find(a => a.id === selectedAuditId);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Schedule Compliance Inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Inspection Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q3 Annual Compliance Audit" /></div>
            <div className="space-y-2">
              <Label htmlFor="target-controller">Target Controller</Label>
              <select id="target-controller" title="Target Controller" aria-label="Target controller" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={targetControllerId} onChange={e => setTargetControllerId(e.target.value)}>
                <option value="">All controllers / General</option>
                {controllers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.controllerCode})</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>Scheduled Date *</Label><Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief audit scope" /></div>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title || !scheduledDate}>
            <Plus className="w-4 h-4 mr-2" />Schedule Audit
          </Button>
        </CardContent>
      </Card>

      {/* Audit list */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Scheduled & Active Inspections</h3>
          <ScrollArea className="h-[440px] pr-1">
            <div className="space-y-2">
              {isLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />) :
                audits.map(a => (
                  <Card key={a.id} className={`border-border/50 bg-card/40 cursor-pointer transition-all hover:border-primary/30 ${selectedAuditId === a.id ? "border-primary/60 bg-primary/5" : ""}`}
                    onClick={() => { setSelectedAuditId(a.id); setFindings(a.findings || ""); setScore(a.score?.toString() || ""); setEnforcement(a.enforcementStatus); setFineAmount(a.fineAmount?.toString() || ""); }}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-mono text-[10px] text-primary">{a.auditCode}</span>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className={`text-[9px] px-1 ${STATUS_COLORS[a.inspectionStatus]}`}>{a.inspectionStatus}</Badge>
                          {a.enforcementStatus !== "NONE" && <Badge variant="outline" className={`text-[9px] px-1 ${STATUS_COLORS[a.enforcementStatus]}`}>{a.enforcementStatus}</Badge>}
                        </div>
                      </div>
                      <p className="text-xs font-semibold">{a.title}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(a.scheduledDate), "dd MMM yyyy")}</span>
                        {a.score !== null && <span className={`font-bold ${a.score >= 70 ? "text-emerald-400" : "text-red-400"}`}>{a.score}/100</span>}
                        {a.fineAmount && <span className="text-red-400 font-bold">₦{a.fineAmount.toLocaleString()}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              {!isLoading && audits.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No audits scheduled yet.</p>}
            </div>
          </ScrollArea>
        </div>

        {/* Enforcement panel */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Enforcement & Findings</h3>
          {selectedAudit ? (
            <Card className="border-primary/30 bg-primary/5 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{selectedAudit.title}</CardTitle>
                <CardDescription className="text-[11px]">{selectedAudit.auditCode}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Inspection Findings</Label><Textarea value={findings} onChange={e => setFindings(e.target.value)} placeholder="Document inspection findings..." rows={4} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Compliance Score (0–100)</Label><Input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} placeholder="85" /></div>
                  <div className="space-y-2">
                    <Label htmlFor="enforcement-action">Enforcement Action</Label>
                    <select id="enforcement-action" title="Enforcement Action" aria-label="Enforcement action" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={enforcement} onChange={e => setEnforcement(e.target.value)}>
                      {["NONE", "WARNING", "FINE_ISSUED", "LICENCE_SUSPENDED", "LICENCE_REVOKED"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </div>
                </div>
                {(enforcement === "FINE_ISSUED") && (
                  <div className="space-y-2"><Label>Fine Amount (₦)</Label><Input type="number" value={fineAmount} onChange={e => setFineAmount(e.target.value)} placeholder="500000" /></div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => updateMutation.mutate({ id: selectedAudit.id, data: { findings, score: score ? parseFloat(score) : null, enforcementStatus: enforcement, fineAmount: fineAmount ? parseFloat(fineAmount) : null, inspectionStatus: "IN_PROGRESS" } })} disabled={updateMutation.isPending}>
                    <Scale className="w-4 h-4 mr-2" />Save Findings
                  </Button>
                  <Button variant="outline" onClick={() => updateMutation.mutate({ id: selectedAudit.id, data: { inspectionStatus: "COMPLETED" } })}>
                    <CheckCircle className="w-4 h-4 mr-2" />Close Audit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full min-h-[200px] rounded-xl border border-dashed border-border/40 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Select an audit to record findings & enforcement actions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3: ROPA Oversight ──────────────────────────────────────────────────────
function RopaOversightTab() {
  const { data: records = [], isLoading } = useQuery<ProcessingRecord[]>({
    queryKey: ["/api/registry/processing-records"],
    queryFn: () => apiRequest("GET", "/api/registry/processing-records").then(r => r.json()),
  });
  const [filter, setFilter] = useState<"ALL" | "ISSUES">("ALL");

  const filtered = filter === "ISSUES"
    ? records.filter(r => !r.lawfulBasisVerified || r.excessiveDataDetected || r.completenessScore < 0.7)
    : records;

  const avgScore = records.length ? records.reduce((a, b) => a + b.completenessScore, 0) / records.length : 0;
  const lawfulOk = records.filter(r => r.lawfulBasisVerified).length;
  const excessiveCount = records.filter(r => r.excessiveDataDetected).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{Math.round(avgScore * 100)}%</p>
            <p className="text-xs text-muted-foreground">Avg. ROPA Completeness</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400">{lawfulOk}</p>
            <p className="text-xs text-muted-foreground">Lawful Basis Verified</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{excessiveCount}</p>
            <p className="text-xs text-muted-foreground">Excessive Data Alerts</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setFilter("ALL")} className={`px-4 py-1.5 rounded-lg border text-xs font-medium transition-all ${filter === "ALL" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>All Records</button>
        <button onClick={() => setFilter("ISSUES")} className={`px-4 py-1.5 rounded-lg border text-xs font-medium transition-all ${filter === "ISSUES" ? "border-red-500 bg-red-500/10 text-red-400" : "border-border/50 text-muted-foreground"}`}>Issues Only ({records.filter(r => !r.lawfulBasisVerified || r.excessiveDataDetected || r.completenessScore < 0.7).length})</button>
      </div>

      <div className="space-y-2">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />) :
          filtered.map(r => (
            <Card key={r.id} className={`border-border/50 bg-card/40 ${r.excessiveDataDetected ? "border-red-500/30" : !r.lawfulBasisVerified ? "border-yellow-500/20" : ""}`}>
              <CardContent className="p-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-primary">{r.recordCode}</span>
                      {r.ropaTemplate && <Badge variant="outline" className="text-[9px] px-1 bg-blue-500/10 text-blue-400 border-blue-500/20">{r.ropaTemplate}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">{r.purpose || "No purpose specified"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-center text-[10px]">
                    <div className="w-16 h-1.5 rounded-full bg-muted/40 mb-0.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full bg-primary ${getCompletenessWidthClass(r.completenessScore)}`} />
                    </div>
                    <span className="text-muted-foreground">{Math.round(r.completenessScore * 100)}%</span>
                  </div>
                  {r.lawfulBasisVerified ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  {r.excessiveDataDetected && <AlertTriangle className="w-4 h-4 text-red-400" />}
                </div>
              </CardContent>
            </Card>
          ))}
        {!isLoading && filtered.length === 0 && <p className="text-xs text-center text-muted-foreground py-8">No records match the filter.</p>}
      </div>
    </div>
  );
}

// ─── Tab 4: DSR Oversight ──────────────────────────────────────────────────────
function DsrOversightTab() {
  const { data: dsrRequests = [], isLoading } = useQuery<DsrRequest[]>({
    queryKey: ["/api/registry/dsr-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-requests").then(r => r.json()),
  });

  const escalated = dsrRequests.filter(r => r.status === "ESCALATED").length;
  const overdue = dsrRequests.filter(r => r.status !== "COMPLETED" && differenceInDays(new Date(r.deadline), new Date()) < 0).length;
  const rejected = dsrRequests.filter(r => r.status === "REJECTED").length;
  const rejectionRate = dsrRequests.length ? ((rejected / dsrRequests.length) * 100).toFixed(1) : "0";
  const totalComplaints = dsrRequests.reduce((sum, r) => sum + r.complaintsCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Escalated DSRs" value={escalated} icon={AlertTriangle} accent={escalated > 0 ? "red" : "emerald"} />
        <StatCard label="Overdue" value={overdue} icon={Clock} accent={overdue > 0 ? "yellow" : "emerald"} />
        <StatCard label="Rejection Rate" value={`${rejectionRate}%`} icon={XCircle} accent={parseFloat(rejectionRate) > 20 ? "red" : "emerald"} />
        <StatCard label="Total Complaints" value={totalComplaints} icon={AlertCircle} accent={totalComplaints > 0 ? "yellow" : "emerald"} />
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">All DSR Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[440px] pr-1">
            <div className="space-y-2">
              {isLoading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />) :
                dsrRequests.map(r => {
                  const daysLeft = differenceInDays(new Date(r.deadline), new Date());
                  const isOverdue = r.status !== "COMPLETED" && daysLeft < 0;
                  return (
                    <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg text-xs transition-all ${isOverdue ? "bg-red-500/5 border border-red-500/20" : "bg-muted/20"}`}>
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-primary">{r.requestCode}</span>
                            <Badge variant="outline" className={`text-[9px] px-1 ${
                              r.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                              r.status === "REJECTED" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                              r.status === "ESCALATED" ? "bg-orange-500/10 text-orange-400 border-orange-500/30" :
                              "bg-blue-500/10 text-blue-400 border-blue-500/30"}`}>{r.status}</Badge>
                            <Badge variant="outline" className="text-[9px] px-1 bg-muted/30">{r.requestType}</Badge>
                          </div>
                          <p className="text-muted-foreground">{r.subjectName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        {r.complaintsCount > 0 && <span className="text-orange-400">{r.complaintsCount} complaint(s)</span>}
                        <span className={isOverdue ? "text-red-400 font-bold" : "text-muted-foreground"}>
                          {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {!isLoading && dsrRequests.length === 0 && <p className="text-xs text-center text-muted-foreground py-8">No DSR requests logged.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: API Integrations ────────────────────────────────────────────────────
function IntegrationsTab() {
  const { toast } = useToast();
  const { data: integrations = [], isLoading } = useQuery<ExternalIntegration[]>({
    queryKey: ["/api/registry/integrations"],
    queryFn: () => apiRequest("GET", "/api/registry/integrations").then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/integrations/${id}/sync`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      toast({ title: "Sync triggered", description: "Integration synchronisation started." });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
  });

  const [selectedIntegration, setSelectedIntegration] = useState<ExternalIntegration | null>(null);
  const [configJson, setConfigJson] = useState("{}");
  const [metadataJson, setMetadataJson] = useState("{}");
  const [editorOpen, setEditorOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [enabled, setEnabled] = useState(true);

  const eventQuery = useQuery<any[]>({
    queryKey: selectedIntegration ? ["/api/registry/integrations", selectedIntegration.id, "events"] : ["/api/registry/integrations", "events"],
    queryFn: () => selectedIntegration ? apiRequest("GET", `/api/registry/integrations/${selectedIntegration.id}/events`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedIntegration,
  });

  const saveIntegrationMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest("PATCH", `/api/registry/integrations/${selectedIntegration?.id}`, payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      if (selectedIntegration) queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations", selectedIntegration.id, "events"] });
      toast({ title: "Integration saved", description: "Integration parameters were updated." });
      setEditorOpen(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const INTEGRATION_ICONS: Record<string, any> = {
    GOVERNMENT: Globe, CYBERSECURITY: Shield, AUDIT: FileText, GENERIC: Cpu,
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <Zap className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          The API Integration Layer enables synchronisation with government portals (NIMC, NITDA) and cybersecurity telemetry platforms.
          OneTrust and TrustArc integrations are excluded per scope directive.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />) :
          integrations.map(i => {
            const Icon = INTEGRATION_ICONS[i.integrationType] || Cpu;
            return (
              <Card key={i.id} className={`border-border/50 bg-card/40 backdrop-blur-sm ${i.status === "CONNECTED" ? "border-emerald-500/20" : ""}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{i.displayName || i.systemName}</p>
                        <p className="text-[10px] text-muted-foreground">{i.integrationType} · {i.connectorType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${STATUS_COLORS[i.status]}`}>{i.status}</Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 bg-slate-100 text-slate-700 border-slate-200">{i.enabled ? "Enabled" : "Disabled"}</Badge>
                    </div>
                  </div>
                  {i.lastSyncAt && <p className="text-[10px] text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />Last sync: {format(new Date(i.lastSyncAt), "dd MMM yyyy HH:mm")}</p>}
                  {i.nextSyncAt && <p className="text-[10px] text-muted-foreground"><Calendar className="w-3 h-3 inline mr-1" />Next sync: {format(new Date(i.nextSyncAt), "dd MMM yyyy HH:mm")}</p>}
                  {i.lastError && <p className="text-[10px] text-red-400"><AlertCircle className="w-3 h-3 inline mr-1" />{i.lastError}</p>}
                  {i.syncLog && <pre className="text-[10px] bg-muted/20 rounded p-2 overflow-x-auto text-muted-foreground max-h-16 whitespace-pre-wrap">{i.syncLog}</pre>}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => syncMutation.mutate(i.id)} disabled={syncMutation.isPending}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync Now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      setSelectedIntegration(i);
                      setConfigJson(JSON.stringify(i.config || {}, null, 2));
                      setMetadataJson(JSON.stringify(i.metadata || {}, null, 2));
                      setDisplayName(i.displayName || "");
                      setEnabled(!!i.enabled);
                      setEditorOpen(true);
                    }}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        {!isLoading && integrations.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No integrations configured yet. Integrations will appear here once seeded.</p>
          </div>
        )}
      </div>
    </div>
  );
}


function DiscoveryTab() {
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<"api" | "database">("api");
  const [connectionString, setConnectionString] = useState("");
  const [queryText, setQueryText] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [queryPayload, setQueryPayload] = useState("{}");
  const [apiKey, setApiKey] = useState("");

  const [historyPage, setHistoryPage] = useState(1);

  // Fetch discovery history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/registry/discovery-history", historyPage],
    queryFn: () => apiRequest("GET", `/api/registry/discovery-history?limit=10&page=${historyPage}`).then(r => r.json()),
    staleTime: 30000,
  });

  // Execute discovery query
  const discoverMut = useMutation({
    mutationFn: async () => {
      let parsedHeaders: Record<string, string> | undefined;
      let parsedPayload: Record<string, any> | undefined;

      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch (e) {
          throw new Error("Invalid JSON in headers");
        }
      }

      if (queryPayload.trim() && queryPayload.trim() !== "{}") {
        try {
          parsedPayload = JSON.parse(queryPayload);
        } catch (e) {
          throw new Error("Invalid JSON in query payload");
        }
      }

      const payload: any = {
        sourceType,
        connectionString,
        ...(queryText.trim() ? { queryText: queryText.trim() } : {}),
      };

      if (sourceType === "api") {
        if (apiKey.trim()) payload.apiKey = apiKey.trim();
        if (parsedHeaders) payload.headers = parsedHeaders;
        if (parsedPayload) payload.queryPayload = parsedPayload;
      }

      return apiRequest("POST", "/api/registry/discover", payload).then(r => r.json());
    },
    onSuccess: (result) => {
      if (result.status === "success") {
        toast({ title: "Discovery Complete", description: `Found ${result.dataCount} records` });
        setConnectionString("");
        setQueryText("");
        setHeaders("{}");
        setQueryPayload("{}");
        setApiKey("");
      } else {
        toast({ title: "Discovery Error", description: result.error || "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/registry/discovery-history"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Query Input Panel */}
        <Card className="xl:col-span-2 rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              External Data Source
            </CardTitle>
            <CardDescription className="text-xs">Connect to APIs or databases to discover schema and query data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Source Type Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Source Type</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={sourceType === "api" ? "default" : "outline"}
                  onClick={() => setSourceType("api")}
                  className="flex-1 text-xs"
                >
                  <Globe className="w-4 h-4 mr-1" />
                  API Endpoint
                </Button>
                <Button
                  size="sm"
                  variant={sourceType === "database" ? "default" : "outline"}
                  onClick={() => setSourceType("database")}
                  className="flex-1 text-xs"
                >
                  <Database className="w-4 h-4 mr-1" />
                  Database
                </Button>
              </div>
            </div>

            {/* Connection String */}
            <div className="space-y-2">
              <Label htmlFor="conn-string" className="text-xs font-semibold">
                {sourceType === "api" ? "API Endpoint URL" : "Database Connection String"}
              </Label>
              <Input
                id="conn-string"
                placeholder={sourceType === "api" ? "https://api.example.com/data" : "postgresql://user:pass@host:5432/db"}
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                className="text-xs bg-muted/30 border-border/40"
              />
              <p className="text-[10px] text-muted-foreground">Max 2000 characters. HTTPS connections only for APIs.</p>
            </div>

            {sourceType === "api" && (
              <>
                {/* API Key */}
                <div className="space-y-2">
                  <Label htmlFor="api-key" className="text-xs font-semibold">
                    API Key (Optional)
                  </Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="text-xs bg-muted/30 border-border/40"
                  />
                </div>

                {/* Typed Query */}
                <div className="space-y-2">
                  <Label htmlFor="query-text" className="text-xs font-semibold">
                    Search terms or SQL query
                  </Label>
                  <Textarea
                    id="query-text"
                    placeholder={sourceType === "api"
                      ? "e.g. find records with name 'Amina' or details containing 'compliance'"
                      : "e.g. SELECT * FROM users WHERE name ILIKE '%Amina%'"
                    }
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    className="text-xs bg-muted/30 border-border/40 min-h-24"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Enter a searchable phrase, name/details filter, or SQL SELECT query. API searches use a query parameter and database searches will search common text columns when a raw phrase is provided.
                  </p>
                </div>

                {/* Headers */}
                <div className="space-y-2">
                  <Label htmlFor="headers" className="text-xs font-semibold">
                    Custom Headers (JSON)
                  </Label>
                  <Textarea
                    id="headers"
                    placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    className="text-xs bg-muted/30 border-border/40 min-h-20 font-mono"
                  />
                </div>

                {/* Advanced Payload */}
                <div className="space-y-2">
                  <Label htmlFor="query" className="text-xs font-semibold">
                    Advanced Request Payload (JSON)
                  </Label>
                  <Textarea
                    id="query"
                    placeholder='{"filters": {"status": "active"}, "limit": 50}'
                    value={queryPayload}
                    onChange={(e) => setQueryPayload(e.target.value)}
                    className="text-xs bg-muted/30 border-border/40 min-h-20 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Optional JSON payload used for API discovery requests.</p>
                </div>
              </>
            )}

            {/* Execute Button */}
            <Button
              className="w-full"
              size="sm"
              onClick={() => discoverMut.mutate()}
              disabled={!connectionString || discoverMut.isPending}
            >
              {discoverMut.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Discover
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Discovery Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {discoverMut.data ? (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    className="text-xs"
                    variant={discoverMut.data.status === "success" ? "default" : "destructive"}
                  >
                    {discoverMut.data.status === "success" ? "Success" : "Error"}
                  </Badge>
                </div>

                {discoverMut.data.status === "success" && (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Records Found</p>
                      <p className="text-2xl font-bold text-primary">{discoverMut.data.dataCount}</p>
                    </div>

                    {discoverMut.data.preview && discoverMut.data.preview.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <p className="text-xs font-semibold">Data Preview</p>
                        <div className="max-h-48 overflow-auto bg-muted/20 rounded-lg p-3 border border-border/40">
                          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
                            {JSON.stringify(discoverMut.data.preview.slice(0, 3), null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 mt-4">
                      <p className="text-xs text-muted-foreground">Discovered</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(discoverMut.data.timestamp), "dd MMM yyyy HH:mm")}
                      </p>
                    </div>
                  </>
                )}

                {discoverMut.data.status === "error" && (
                  <div className="space-y-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-400">Error</p>
                    <p className="text-xs text-red-300">{discoverMut.data.error}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <Search className="w-8 h-8 mx-auto opacity-20 mb-2" />
                <p className="text-xs">Run a discovery to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History Panel */}
      <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Discovery History
          </CardTitle>
          <CardDescription className="text-xs">Recent data discovery queries and results.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading history...</p>
          ) : historyData && historyData.length > 0 ? (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {historyData.map((item: any) => (
                  <Card key={item.discoverySessionId} className="bg-muted/20 border-border/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold truncate">{item.sourceType === "api" ? "API" : "DB"}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              item.status === "success"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                            }`}
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{item.connectionString}</p>
                        {item.dataCount && (
                          <p className="text-[10px] text-slate-400 mt-1">Records: {item.dataCount}</p>
                        )}
                        <p className="text-[10px] text-slate-500 mt-1">
                          {format(new Date(item.timestamp), "dd MMM HH:mm")}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="w-8 h-8 mx-auto opacity-20 mb-2" />
              <p className="text-xs">No discovery history yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Regulator Page ────────────────────────────────────────────────────────
export default function RegulatorPage() {
  const { data: controllers = [] } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });
  const { data: breaches = [] } = useQuery<DataBreach[]>({
    queryKey: ["/api/registry/breaches"],
    queryFn: () => apiRequest("GET", "/api/registry/breaches").then(r => r.json()),
  });
  const { data: dsrRequests = [] } = useQuery<DsrRequest[]>({
    queryKey: ["/api/registry/dsr-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-requests").then(r => r.json()),
  });
  const { data: audits = [] } = useQuery<ComplianceAudit[]>({
    queryKey: ["/api/registry/audits"],
    queryFn: () => apiRequest("GET", "/api/registry/audits").then(r => r.json()),
  });
  const { data: investigations = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/investigations"],
    queryFn: () => apiRequest("GET", "/api/registry/investigations").then(r => r.json()),
  });
  const { data: integrations = [] } = useQuery<ExternalIntegration[]>({
    queryKey: ["/api/registry/integrations"],
    queryFn: () => apiRequest("GET", "/api/registry/integrations").then(r => r.json()),
  });
  const { data: approvals = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/approvals"],
    queryFn: () => apiRequest("GET", "/api/registry/approvals").then(r => r.json()),
  });

  const activeControllers = controllers.filter(c => c.licenceStatus === "ACTIVE").length;
  const openBreaches = breaches.filter(b => b.status !== "RESOLVED").length;
  const slaBreached = breaches.filter(b => b.slaStatus === "BREACHED").length;
  const pendingDsr = dsrRequests.filter(r => r.status !== "COMPLETED" && r.status !== "REJECTED").length;
  const overdueDsr = dsrRequests.filter(r => r.status !== "COMPLETED" && differenceInDays(new Date(r.deadline), new Date()) < 0).length;
  const activeAudits = audits.filter(a => a.inspectionStatus !== "COMPLETED").length;
  const openInvestigations = investigations.filter(i => i.status === "OPEN" || i.status === "ACTIVE").length;
  const pendingApprovals = approvals.filter(a => a.decision === "PENDING").length;
  const connectedIntegrations = integrations.filter(i => i.status === "CONNECTED").length;
  const disconnectedIntegrations = integrations.filter(i => i.status !== "CONNECTED").length;
  const staleIntegrations = integrations.filter(i => i.lastSyncAt && differenceInDays(new Date(), new Date(i.lastSyncAt)) > 2).length;
  const overdueInvestigations = investigations.filter(i => i.escalationLevel === "HIGH" || i.priority === "HIGH").length;
  const nextAudit = [...audits]
    .filter(a => a.inspectionStatus !== "COMPLETED")
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];
  const urgentBreach = [...breaches]
    .filter(b => b.status !== "RESOLVED")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const approvalQueue = approvals.filter(a => a.decision === "PENDING").slice(0, 2);

  const alertItems = [
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      title: `${slaBreached} SLA breach${slaBreached === 1 ? "" : "es"}`,
      subtitle: "Review unresolved compliance incidents before they escalate.",
      variant: slaBreached > 0 ? "critical" : "info",
      ctaLabel: slaBreached > 0 ? "Review breaches" : "View breach summary",
      ctaHref: "#overview",
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: `${overdueDsr} overdue DSR request${overdueDsr === 1 ? "" : "s"}`,
      subtitle: "Timely response preserves regulatory confidence and avoids penalties.",
      variant: overdueDsr > 0 ? "warning" : "success",
      ctaLabel: "Open DSR oversight",
      ctaHref: "#dsr",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} pending`,
      subtitle: "Keep the review queue flowing with fast decisions.",
      variant: pendingApprovals > 0 ? "warning" : "info",
      ctaLabel: "Review approvals",
      ctaHref: "#approvals",
    },
  ];

  return (
    <div className="p-6 space-y-10 max-w-screen-2xl mx-auto scroll-smooth">
      <div className="space-y-6">
        <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Regulator Portal</p>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sovereign supervision, simplified.</h1>
                <p className="max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-400">Monitor critical compliance signals, manage inspection workflows, and resolve regulatory risk with a single dashboard designed for confidence and speed.</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Active controllers: {activeControllers}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Open breaches: {openBreaches}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Pending DSRs: {pendingDsr}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Connected feeds: {connectedIntegrations}/{integrations.length}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="sm" variant="outline"><a href="#audits">Plan audit</a></Button>
              <Button asChild size="sm"><a href="#investigations">Open investigation</a></Button>
            </div>
          </div>
        </Card>

        <PortalSection
          id="ai-workflows"
          title="Regulator AI workspace"
          description="Use scoped Copilot guidance and workflow agents for audits, investigations, approvals, and oversight."
        >
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Regulator Copilot</p>
                      <p className="text-[11px] text-muted-foreground">Context-aware help for supervision and enforcement workflows.</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Ask for summaries of breach context, likely next actions, or suggested follow-ups for audits, investigations, and approvals.
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-dashed border-primary/20 bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">
                  This assistant stays available only inside the regulator portal and is focused on oversight actions rather than general platform use.
                </p>
              </div>
            </Card>

            <Card className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm">
              <InlineAgentWidget
                layer="system"
                layerLabel="Regulator Workflow"
                maxTasks={4}
                defaultCollapsed={false}
              />
            </Card>
          </div>
          <div className="mt-6">
            <InlineAgentWidget
              layer="system"
              layerLabel="Regulator Workflow"
              maxTasks={4}
              defaultCollapsed={false}
            />
          </div>
        </PortalSection>

        <PortalSectionNav items={portalNavItems} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PortalWorkflowCard
            title="Schedule audit"
            description="Create a compliance inspection and assign a controller under review."
            href="#audits"
            icon={<Calendar className="w-5 h-5" />}
          />
          <PortalWorkflowCard
            title="Review DSRs"
            description="Focus on overdue data subject requests and reduce regulatory exposure."
            href="#dsr"
            icon={<Users className="w-5 h-5" />}
          />
          <PortalWorkflowCard
            title="Check integrations"
            description="Validate feed health and identify sync issues across external systems."
            href="#integrations"
            icon={<Database className="w-5 h-5" />}
          />
          <PortalWorkflowCard
            title="Open approvals"
            description="Access the authority queue to resolve pending sign-offs quickly."
            href="#approvals"
            icon={<Scale className="w-5 h-5" />}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.85fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PortalKpiCard
            title="Active controllers"
            value={activeControllers}
            description="Registered entities currently under supervision."
            icon={<Building2 className="w-5 h-5" />}
          />
          <PortalKpiCard
            title="Open breaches"
            value={openBreaches}
            description={slaBreached + " with SLA risk"}
            trend={slaBreached > 0 ? "Immediate attention" : "In healthy range"}
            icon={<AlertTriangle className="w-5 h-5" />}
            highlight={slaBreached > 0}
          />
          <PortalKpiCard
            title="Pending DSRs"
            value={pendingDsr}
            description={overdueDsr + " overdue responses"}
            trend={overdueDsr > 0 ? "At-risk" : "On track"}
            icon={<Users className="w-5 h-5" />}
            highlight={overdueDsr > 0}
          />
          <PortalKpiCard
            title="Open audits"
            value={activeAudits}
            description="Active inspections currently in process."
            icon={<Gavel className="w-5 h-5" />}
          />
        </div>

        <div className="space-y-4">
          {alertItems.map(alert => (
            <PortalAlert
              key={alert.title}
              icon={alert.icon}
              title={alert.title}
              subtitle={alert.subtitle}
              variant={alert.variant as any}
              ctaLabel={alert.ctaLabel}
              ctaHref={alert.ctaHref}
            />
          ))}
        </div>
      </div>

      <PortalSection
        id="overview"
        title="Compliance pulse"
        description="High-level signals to help you prioritize the next regulatory actions."
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Investigation load</p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{openInvestigations}</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{overdueInvestigations} high-priority cases</p>
                </div>
                <div className="rounded-3xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
            </Card>
            <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Integration health</p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{connectedIntegrations}/{integrations.length}</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Active synchronized feeds</p>
                </div>
                <div className="rounded-3xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Database className="w-6 h-6" />
                </div>
              </div>
            </Card>
          </div>

          <div className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Breach SLA tracker</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{slaBreached} breach{slaBreached === 1 ? "" : "es"} past SLA</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Always keep this number as close to zero as possible.</p>
              </div>
              <div className="rounded-3xl bg-red-50 p-3 text-red-600 dark:bg-red-500/10 dark:text-red-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Open breaches</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{openBreaches}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Pending approvals</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{pendingApprovals}</p>
              </div>
            </div>
          </div>
        </div>
      </PortalSection>

      <PortalSection
        id="focus"
        title="Regulatory focus"
        description="A short operating view of the next actions most likely to protect public confidence."
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Next action queue</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{nextAudit ? nextAudit.title : "No impending audits"}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {nextAudit
                    ? `Scheduled for ${format(new Date(nextAudit.scheduledDate), "dd MMM yyyy")} - ${nextAudit.inspectionStatus}`
                    : "The scheduler is currently clear."}
                </p>
              </div>
              <div className="rounded-3xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Open breach signals</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{openBreaches}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Pending approvals</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{pendingApprovals}</p>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Priority signals</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Most urgent breach</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{urgentBreach ? urgentBreach.title : "No active breach"}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {urgentBreach ? `${urgentBreach.severity} - ${urgentBreach.slaStatus}` : "All reported incidents are currently within SLA."}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Approval queue</p>
                {approvalQueue.length > 0 ? approvalQueue.map((item) => (
                  <div key={item.id} className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-foreground">{item.subjectType || "Pending request"}</span>
                    <span className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{item.decision}</span>
                  </div>
                )) : (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No pending approvals waiting for review.</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </PortalSection>

      <PortalSection
        id="audits"
        title="Audit planning"
        description="Keep investigations, inspections, and enforcement aligned in one place."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <PortalWorkflowCard
            title="Schedule new audit"
            description="Open a new inspection case and attach the right controller records." 
            href="#audits"
            icon={<Calendar className="w-5 h-5" />}
          />
          <PortalWorkflowCard
            title="Finalize enforcement"
            description="Convert completed audits into enforcement actions with one click." 
            href="#enforcement"
            icon={<Scale className="w-5 h-5" />}
          />
          <PortalWorkflowCard
            title="Resolve sensitive DSRs"
            description="Stay ahead of overdue data subject requests and maintain process integrity." 
            href="#dsr"
            icon={<Users className="w-5 h-5" />}
          />
        </div>
      </PortalSection>

      <PortalSection
        id="investigations"
        title="Investigations overview"
        description="Track active cases, find escalation risk, and close investigations faster."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Active investigations</p>
            <p className="mt-4 text-4xl font-semibold text-foreground">{openInvestigations}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Cases open across the supervision workflow.</p>
          </Card>
          <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">High-priority signals</p>
            <p className="mt-4 text-4xl font-semibold text-foreground">{overdueInvestigations}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Cases flagged for immediate review.</p>
          </Card>
          <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Regulatory throughput</p>
            <p className="mt-4 text-4xl font-semibold text-foreground">{activeAudits + openInvestigations}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Active audit and investigation workload.</p>
          </Card>
        </div>
      </PortalSection>

      <PortalSection
        id="dsr"
        title="DSR oversight"
        description="Monitor request response progress and stay ahead of overdue obligations."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <PortalKpiCard
            title="Pending DSRs"
            value={pendingDsr}
            description="Requests still waiting for completion."
            icon={<Users className="w-5 h-5" />}
            highlight={pendingDsr > 0}
          />
          <PortalKpiCard
            title="Overdue responses"
            value={overdueDsr}
            description="Requests past the regulatory deadline."
            icon={<AlertTriangle className="w-5 h-5" />}
            highlight={overdueDsr > 0}
          />
          <PortalKpiCard
            title="Active audits"
            value={activeAudits}
            description="Audits tied to DSR escalation."
            icon={<Gavel className="w-5 h-5" />}
          />
        </div>

        <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">DSR backlog</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">{overdueDsr} overdue request{overdueDsr === 1 ? "" : "s"}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Resolve the oldest requests first to reduce regulatory exposure.</p>
            </div>
            <div className="rounded-3xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
              <Zap className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {dsrRequests.filter(r => r.status !== "COMPLETED" && r.status !== "REJECTED").slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-3xl border border-border p-4 bg-slate-50 dark:bg-slate-900/80">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{request.subjectName || request.requestCode}</p>
                    <p className="text-xs text-muted-foreground">{request.requestType} • {request.status}</p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Due {format(new Date(request.deadline), "dd MMM")}</p>
                </div>
              </div>
            ))}
            {dsrRequests.filter(r => r.status !== "COMPLETED" && r.status !== "REJECTED").length === 0 && (
              <p className="text-sm text-muted-foreground">No active DSR requests waiting for review.</p>
            )}
          </div>
        </Card>
      </PortalSection>

      <PortalSection
        id="integrations"
        title="Integrations health"
        description="Keep external feeds synchronized and detect stale or disconnected systems quickly."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <PortalKpiCard
            title="Connected feeds"
            value={connectedIntegrations}
            description={"of " + integrations.length + " total"}
            icon={<Database className="w-5 h-5" />}
          />
          <PortalKpiCard
            title="Stale syncs"
            value={staleIntegrations}
            description="Not refreshed in 48+ hours."
            icon={<RotateCcw className="w-5 h-5" />}
            highlight={staleIntegrations > 0}
          />
          <PortalKpiCard
            title="Disconnections"
            value={disconnectedIntegrations}
            description="Feeds needing immediate attention."
            icon={<AlertCircle className="w-5 h-5" />}
            highlight={disconnectedIntegrations > 0}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {integrations.length > 0 ? (
            integrations.slice(0, 3).map(i => (
              <Card key={i.id} className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{i.systemName}</p>
                    <p className="text-xs text-muted-foreground">{i.integrationType}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={"text-[10px] px-2 " + (STATUS_COLORS[i.status] || "bg-slate-500/10 text-slate-400 border-slate-500/30")}
                  >
                    {i.status}
                  </Badge>
                </div>
                {i.lastSyncAt ? <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Last sync: {format(new Date(i.lastSyncAt), "dd MMM yyyy")}</p> : <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">No sync data available</p>}
              </Card>
            ))
          ) : (
            <div className="rounded-3xl border border-border bg-card/95 p-8 text-center text-sm text-muted-foreground">No integrations configured yet.</div>
          )}
        </div>
      </PortalSection>

      <PortalSection
        id="discovery"
        title="Discovery portal"
        description="Paste an API or database URL to discover schema, endpoints, and data structure from external sources."
      >
        <DiscoveryTab />
      </PortalSection>

      <PortalSection
        id="approvals"
        title="Approvals queue"
        description="Stay on top of pending decisions and preserve regulatory momentum."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <PortalKpiCard
            title="Pending approvals"
            value={pendingApprovals}
            description="Requests requiring regulatory sign-off."
            icon={<CheckCircle className="w-5 h-5" />}
            highlight={pendingApprovals > 0}
          />
          <PortalKpiCard
            title="Open breach signals"
            value={openBreaches}
            description={slaBreached + " past SLA"}
            icon={<ShieldCheck className="w-5 h-5" />}
          />
          <PortalKpiCard
            title="Regulatory backlog"
            value={activeAudits + openInvestigations}
            description="Active investigations and audits."
            icon={<ListChecks className="w-5 h-5" />}
          />
        </div>

        <Card className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Approval readiness</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">{pendingApprovals} decision{pendingApprovals === 1 ? "" : "s"} pending</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Clear approvals to reduce case latency and improve compliance response time.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href="#approvals">Review queue</a>
            </Button>
          </div>
        </Card>
      </PortalSection>
    </div>
  );
}

// ─── Approvals Tab ──────────────────────────────────────────────────────────────────────
function ApprovalsTab() {
  const { toast } = useToast();
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const { data: approvals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/approvals"],
    queryFn: () => apiRequest("GET", "/api/registry/approvals").then(r => r.json()),
  });
  const decideMut = useMutation({
    mutationFn: ({ id, decision, cond }: any) => apiRequest("PATCH", `/api/registry/approvals/${id}`, { decision, conditions: cond }).then(r => r.json()),
    onSuccess: (_: any, vars: any) => { toast({ title: `Decision: ${vars.decision}` }); queryClient.invalidateQueries({ queryKey: ["/api/registry/approvals"] }); },
  });
  const DECISION_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    REJECTED: "bg-red-500/10 text-red-400 border-red-500/30",
    CONDITIONAL: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const TYPE_LABELS: Record<string, string> = {
    TIA_EXCEPTION: "Trans-border Transfer (TIA)",
    ROPA_HIGH_RISK: "ROPA High-Risk Processing",
    PATIENT_ID_LINK: "Patient ID Linkage (s.12(8))",
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><CheckCircle className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Authority Approvals Queue</h2><p className="text-xs text-muted-foreground">Review TIA exceptions, ROPA high-risk, and Patient ID linkage requests.</p></div>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : approvals.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><CheckCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No pending approvals.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((a: any) => (
            <Card key={a.id} className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-300 border-slate-500/30">{TYPE_LABELS[a.subjectType] ?? a.subjectType}</Badge>
                      <Badge variant="outline" className={`text-xs ${DECISION_COLORS[a.decision] ?? ""}`}>{a.decision}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">ID: {a.subjectId}</p>
                    {a.decidedBy && <p className="text-xs text-muted-foreground mt-1">Decided by: {a.decidedBy}</p>}
                    {a.decision === "PENDING" && (
                      <div className="mt-2">
                        <input className="w-full text-xs bg-muted/30 border border-border/40 rounded px-2 py-1.5 mb-2" placeholder="Conditions (optional)" value={conditions[a.id] ?? ""} onChange={e => setConditions(prev => ({ ...prev, [a.id]: e.target.value }))} />
                        <div className="flex gap-1.5">
                          <Button id={`approve-${a.id}`} size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40 text-emerald-400" onClick={() => decideMut.mutate({ id: a.id, decision: "APPROVED", cond: conditions[a.id] })}>Approve</Button>
                          <Button id={`conditional-${a.id}`} size="sm" variant="outline" className="text-xs h-7 border-blue-500/40 text-blue-400" onClick={() => decideMut.mutate({ id: a.id, decision: "CONDITIONAL", cond: conditions[a.id] })}>Conditional</Button>
                          <Button id={`reject-${a.id}`} size="sm" variant="outline" className="text-xs h-7 border-red-500/40 text-red-400" onClick={() => decideMut.mutate({ id: a.id, decision: "REJECTED", cond: "" })}>Reject</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Adequacy Tab ───────────────────────────────────────────────────────────────────────────
function AdequacyTab() {
  const { toast } = useToast();
  const [countryName, setCountryName] = useState("");
  const [isAdequate, setIsAdequate] = useState(true);
  const [legalBasis, setLegalBasis] = useState("");
  const { data: countries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/adequacy"],
    queryFn: () => apiRequest("GET", "/api/registry/adequacy").then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/adequacy", { countryName, isAdequate, legalBasis: legalBasis || undefined }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Country Added" }); setCountryName(""); setLegalBasis(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/adequacy"] }); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/registry/adequacy/${id}`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Country Removed", variant: "destructive" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/adequacy"] }); },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><MapPin className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Adequacy Country List</h2><p className="text-xs text-muted-foreground">Manage countries with adequate protection per s.29 CDPA.</p></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <Card className="bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">Add Country</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Country Name</Label><input id="adequacy-country-name" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Kenya" value={countryName} onChange={e => setCountryName(e.target.value)} /></div>
            <div className="flex items-center gap-2"><input id="adequacy-is-adequate" type="checkbox" checked={isAdequate} onChange={e => setIsAdequate(e.target.checked)} title="Mark as adequate" aria-label="Mark as adequate" className="w-4 h-4 rounded" /><Label htmlFor="adequacy-is-adequate" className="text-xs">Mark as Adequate</Label></div>
            <div className="space-y-1.5"><Label className="text-xs">Legal Basis Notes</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. POPIA equivalent" value={legalBasis} onChange={e => setLegalBasis(e.target.value)} /></div>
            <Button id="add-adequacy-btn" size="sm" className="w-full" onClick={() => addMut.mutate()} disabled={!countryName || addMut.isPending}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
          </CardContent>
        </Card>
        <div className="xl:col-span-3">
          {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {countries.map((c: any) => (
                <Card key={c.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold">{c.countryName}</p>
                        <Badge variant="outline" className={`text-xs ${c.isAdequate ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>{c.isAdequate ? "ADEQUATE" : "NOT ADEQUATE"}</Badge>
                      </div>
                      {c.legalBasis && <p className="text-xs text-muted-foreground">{c.legalBasis}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-xs h-7 w-7 p-0 text-red-400 hover:text-red-300 shrink-0" onClick={() => removeMut.mutate(c.id)}><XCircle className="w-4 h-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Enforcement & Appeals Tab ──────────────────────────────────────────────────────────
function EnforcementAppealsTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"enforcement" | "appeals">("enforcement");
  const [respondent, setRespondent] = useState("");
  const [sections, setSections] = useState("");
  const [fine, setFine] = useState("");
  const [seizure, setSeizure] = useState(false);
  const [deletion, setDeletion] = useState(false);
  const [enfCaseId, setEnfCaseId] = useState("");
  const [courtRef, setCourtRef] = useState("");
  const { data: enforcements = [], isLoading: loadE } = useQuery<any[]>({ queryKey: ["/api/registry/enforcements"], queryFn: () => apiRequest("GET", "/api/registry/enforcements").then(r => r.json()) });
  const { data: appeals = [], isLoading: loadA } = useQuery<any[]>({ queryKey: ["/api/registry/appeals"], queryFn: () => apiRequest("GET", "/api/registry/appeals").then(r => r.json()) });
  const createEnfMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/enforcements", { respondentName: respondent, breachedSections: sections.split(",").map((s: string) => s.trim()), fineAmount: fine || undefined, seizureOrder: seizure, deletionOrder: deletion }).then(r => r.json()),
    onSuccess: (d: any) => { toast({ title: "Case Created", description: `Penalty Band: ${d.penaltyBand}` }); setRespondent(""); setSections(""); setFine(""); setSeizure(false); setDeletion(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/enforcements"] }); },
  });
  const createAppealMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/appeals", { enforcementCaseId: enfCaseId, courtReference: courtRef }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Appeal Logged" }); setEnfCaseId(""); setCourtRef(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/appeals"] }); },
  });
  const closeEnfMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/registry/enforcements/${id}`, { status: "CLOSED" }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Case Closed" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/enforcements"] }); },
  });
  const PENALTY_COLORS: Record<string, string> = { LEVEL_7: "bg-orange-500/10 text-orange-400 border-orange-500/30", LEVEL_11: "bg-red-500/10 text-red-400 border-red-500/30" };
  const ENF_STATUS: Record<string, string> = { OPEN: "bg-blue-500/10 text-blue-400 border-blue-500/30", APPEALED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", CLOSED: "bg-slate-500/10 text-slate-400 border-slate-500/30" };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Scale className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Enforcement &amp; Appeals</h2><p className="text-xs text-muted-foreground">Log s.33 violations with auto-suggested penalty bands. Track s.34 court appeals.</p></div>
      </div>
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={subTab === "enforcement" ? "default" : "outline"} onClick={() => setSubTab("enforcement")} className="text-xs"><Gavel className="w-3 h-3 mr-1" />Enforcement Cases</Button>
        <Button size="sm" variant={subTab === "appeals" ? "default" : "outline"} onClick={() => setSubTab("appeals")} className="text-xs"><Scale className="w-3 h-3 mr-1" />Court Appeals</Button>
      </div>
      {subTab === "enforcement" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-semibold">New Enforcement Case</CardTitle><CardDescription className="text-xs">s.7–s.12 breaches → Level 11. Others → Level 7.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Respondent</Label><input id="enf-respondent" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Company or Individual" value={respondent} onChange={e => setRespondent(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Breached Sections (comma-separated)</Label><input id="enf-sections" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="s.7, s.11, s.29" value={sections} onChange={e => setSections(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Fine Amount (USD)</Label><input id="enf-fine" type="number" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="0.00" value={fine} onChange={e => setFine(e.target.value)} /></div>
              <div className="flex items-center gap-4 py-1">
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={seizure} onChange={e => setSeizure(e.target.checked)} className="w-3.5 h-3.5" />Seizure Order</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={deletion} onChange={e => setDeletion(e.target.checked)} className="w-3.5 h-3.5" />Deletion Order</label>
              </div>
              <Button id="create-enforcement-btn" size="sm" className="w-full" onClick={() => createEnfMut.mutate()} disabled={!respondent || !sections || createEnfMut.isPending}><Plus className="w-3.5 h-3.5 mr-1" />Open Case</Button>
            </CardContent>
          </Card>
          <div className="xl:col-span-3 space-y-2">
            {loadE ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : enforcements.length === 0 ? (
              <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Gavel className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No enforcement cases.</p></CardContent></Card>
            ) : (
              <ScrollArea className="h-[500px]"><div className="space-y-2">
                {enforcements.map((e: any) => (
                  <Card key={e.id} className="bg-card/60 border-border/40">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <p className="font-semibold text-sm">{e.respondentName}</p>
                            <Badge variant="outline" className={`text-xs ${PENALTY_COLORS[e.penaltyBand] ?? ""}`}>{e.penaltyBand}</Badge>
                            <Badge variant="outline" className={`text-xs ${ENF_STATUS[e.status] ?? ""}`}>{e.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Sections: {Array.isArray(e.breachedSections) ? e.breachedSections.join(", ") : e.breachedSections}</p>
                          {e.fineAmount && <p className="text-xs text-orange-400 font-medium">Fine: USD {Number(e.fineAmount).toLocaleString()}</p>}
                        </div>
                        {e.status === "OPEN" && <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-slate-400 shrink-0" onClick={() => closeEnfMut.mutate(e.id)}>Close</Button>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div></ScrollArea>
            )}
          </div>
        </div>
      )}
      {subTab === "appeals" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Log Court Appeal (s.34)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="appeal-enf-case" className="text-xs">Enforcement Case</Label>
                <select id="appeal-enf-case" title="Enforcement case" aria-label="Enforcement case" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={enfCaseId} onChange={e => setEnfCaseId(e.target.value)}>
                  <option value="">Select case...</option>
                  {enforcements.map((e: any) => <option key={e.id} value={e.id}>{e.respondentName} ({e.penaltyBand})</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Court Reference</Label><input id="appeal-court-ref" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="ADM/2025/001" value={courtRef} onChange={e => setCourtRef(e.target.value)} /></div>
              <Button id="log-appeal-btn" size="sm" className="w-full" onClick={() => createAppealMut.mutate()} disabled={!enfCaseId || !courtRef || createAppealMut.isPending}><Scale className="w-3.5 h-3.5 mr-1" />Log Appeal</Button>
            </CardContent>
          </Card>
          <div className="xl:col-span-3 space-y-2">
            {loadA ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : appeals.length === 0 ? (
              <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Scale className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No court appeals on record.</p></CardContent></Card>
            ) : (
              <div className="space-y-2">
                {appeals.map((a: any) => (
                  <Card key={a.id} className="bg-card/60 border-border/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm font-mono">{a.courtReference}</p>
                            <Badge variant="outline" className={`text-xs ${a.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>{a.status}</Badge>
                          </div>
                          {a.outcome && <p className="text-xs text-muted-foreground">Outcome: {a.outcome}</p>}
                          <p className="text-xs text-muted-foreground">Filed {format(new Date(a.filedAt), "dd MMM yyyy")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
