import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow, format, addDays, differenceInDays } from "date-fns";
import {
  Building2, Database, Plus, RefreshCw, Shield, AlertTriangle, CheckCircle,
  XCircle, Clock, FileText, Users, Lock, AlertCircle, RotateCcw,
  FileWarning, ShieldCheck, Calendar, Mail, User, ChevronRight, Zap,
  Activity, BookOpen, Globe, Eye, EyeOff, Gavel, Scale, Bell, Trash2, ExternalLink,
  Cpu, BarChart3, Search, PauseCircle, X
} from "lucide-react";
import {
  PrivacyNoticeTab,
  NotificationWizardTab,
  AuthorisationRequestsTab,
  AccountabilityDashboardTab,
  AdmRegisterTab,
  SecurityDpaTab,
  RepresentationTab,
  CodeOfConductSubmitTab,
  ProcessorInstructionTab,
  RetentionComplianceTab,
  PurposeRegisterTab,
  WhistleblowerNoticeTab,
  DpoConfigTab,
} from "./registry-v3-tabs";

import DpoToolbar from "@/components/regulator/dpo-toolbar";
import DpoDataDiscoveryPage from "./dpo-data-discovery";

// ─── Types ────────────────────────────────────────────────────────────────────
type DataController = {
  id: string; controllerCode: string; name: string; contactName: string | null;
  contactEmail: string | null; organisation: string | null; address: string | null;
  type: string; sector: string | null; riskLevel: string; licenceStatus: string;
  licenceExpiryDate: string | null; tenantId: string; createdAt: string;
};
type ProcessingRecord = {
  id: string; recordCode: string; controllerId: string | null; purpose: string | null;
  lawfulBasis: string | null; dataCategories: string[]; status: string;
  ropaTemplate: string | null; completenessScore: number; lawfulBasisVerified: boolean;
  lawfulBasisVerificationNotes: string | null; retentionExpiryDate: string | null;
  excessiveDataDetected: boolean; excessiveDataNotes: string | null; createdAt: string;
};
type DataBreach = {
  id: string; breachCode: string; title: string; description: string;
  incidentDate: string; detectedDate: string; severity: string; status: string;
  impactAssessment: string | null; rootCause: string | null; remediationActions: string | null;
  slaDeadline: string | null; slaStatus: string; createdAt: string;
};
type DsrRequest = {
  id: string; requestCode: string; subjectName: string; subjectEmail: string;
  requestType: string; details: string | null; status: string; rejectionReason: string | null;
  escalationNotes: string | null; deadline: string; responseSentAt: string | null;
  complaintsCount: number; createdAt: string;
};
type DsrComplaint = {
  id: string; complaintCode: string; requestId: string | null; complainantName: string;
  complainantEmail: string; details: string; status: string; resolutionDetails: string | null; createdAt: string;
};

type ExternalIntegration = {
  id: string;
  systemName: string;
  displayName: string;
  integrationType: string;
  connectorType: string;
  status: string;
  enabled: boolean;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  lastError?: string | null;
  syncLog?: string | null;
  config: any;
  metadata: any;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  MEDIUM: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  HIGH: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40",
  CRITICAL: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  EXPIRED: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
  PENDING_RENEWAL: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  REPORTED: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
  INVESTIGATING: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  CONTAINED: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40",
  RESOLVED: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  RECEIVED: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  COMPLETED: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  REJECTED: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
  ESCALATED: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40",
  OPEN: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
  UNDER_REVIEW: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
};

const ROPA_TEMPLATES = [
  { value: "HR_RECORDS", label: "HR Records", fields: ["Employee contract management", "Payroll & benefits administration", "Performance evaluations", "NDPA legitimate interest"], icon: Users },
  { value: "CUSTOMER_DATA", label: "Customer Data Processing", fields: ["CRM & customer profiles", "Transactional history", "Marketing communications", "Consent basis"], icon: Building2 },
  { value: "MARKETING_METRICS", label: "Marketing & Analytics", fields: ["Website analytics", "Ad targeting", "Email campaign metrics", "Consent / legitimate interest"], icon: Activity },
  { value: "FINANCIAL_LEDGER", label: "Financial Ledger", fields: ["Accounts receivable/payable", "Tax compliance", "Fraud prevention", "Legal obligation basis"], icon: Database },
  { value: "OTHER", label: "Other / Custom", fields: ["Define your own purpose", "Specify custom data categories", "Manually enter lawful basis"], icon: FileText },
];

const SECTORS = ["FINANCE", "HEALTHCARE", "TELECOM", "PUBLIC_SECTOR", "RETAIL", "EDUCATION", "INSURANCE", "TECHNOLOGY", "OTHER"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const DSR_TYPES = ["ACCESS", "ERASURE", "PORTABILITY", "RECTIFICATION", "RESTRICTION"];
const LAWFUL_BASES = ["CONSENT", "CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTERESTS", "PUBLIC_TASK", "LEGITIMATE_INTERESTS"];

function SectionHeader({ icon: Icon, title, sub, color = "text-primary" }: any) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Tab 1: Controllers & Processors ──────────────────────────────────────────
function ControllersTab() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("CONTROLLER");
  const [sector, setSector] = useState("OTHER");
  const [riskLevel, setRiskLevel] = useState("LOW");

  const { data: controllers = [], isLoading } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/controllers", { name, contactEmail: email, organisation: org, address, type, sector, riskLevel }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/controllers"] });
      setName(""); setEmail(""); setOrg(""); setAddress("");
      toast({ title: "Registered successfully", description: `${type === "CONTROLLER" ? "Data Controller" : "Data Processor"} has been added to the registry.` });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const renewMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/controllers/renew/${id}`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/controllers"] });
      toast({ title: "Licence renewed", description: "Licence extended by 1 year from today." });
    },
    onError: (e: any) => toast({ title: "Renewal failed", description: e?.message, variant: "destructive" }),
  });

  const getLicenceDays = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    return differenceInDays(new Date(expiryDate), new Date());
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Register New Entity</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label className="text-sm font-semibold">Entity Type</Label>
              <div className="flex gap-3">
                {["CONTROLLER", "PROCESSOR"].map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${type === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}>
                    {t === "CONTROLLER" ? "Data Controller" : "Data Processor"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label className="text-sm font-medium">Full Name *</Label><Input placeholder="ACME Data Services" value={name} onChange={e => setName(e.target.value)} className="h-10" /></div>
            <div className="space-y-2"><Label className="text-sm font-medium">Contact Email</Label><Input type="email" placeholder="dpo@acme.com" value={email} onChange={e => setEmail(e.target.value)} className="h-10" /></div>
            <div className="space-y-2"><Label className="text-sm font-medium">Organisation</Label><Input placeholder="ACME Corporation" value={org} onChange={e => setOrg(e.target.value)} className="h-10" /></div>
            <div className="space-y-2"><Label className="text-sm font-medium">Address</Label><Input placeholder="123 Compliance Ave" value={address} onChange={e => setAddress(e.target.value)} className="h-10" /></div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sector</Label>
              <select className="w-full rounded-lg border border-input bg-background px-3 py-2.5 h-10 text-sm" value={sector} onChange={e => setSector(e.target.value)}>
                {SECTORS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Risk Level</Label>
              <select className="w-full rounded-lg border border-input bg-background px-3 py-2.5 h-10 text-sm" value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
                {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name.trim()} className="h-10 w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />Register {type === "CONTROLLER" ? "Controller" : "Processor"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {isLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />) :
          controllers.map(c => {
            const days = getLicenceDays(c.licenceExpiryDate);
            const isExpiring = days !== null && days < 30;
            return (
              <Card key={c.id} className={`border-border/50 bg-card/40 backdrop-blur-sm transition-all hover:shadow-md hover:border-primary/30 ${isExpiring ? "border-yellow-500/30" : ""}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-primary font-semibold tracking-wide">{c.controllerCode}</span>
                        <Badge variant="outline" className="text-xs px-2 py-1 bg-primary/10 text-primary border-primary/30">{c.type}</Badge>
                        <Badge variant="outline" className={`text-xs px-2 py-1 ${SEVERITY_COLORS[c.riskLevel] || ""}`}>Risk: {c.riskLevel}</Badge>
                        <Badge variant="outline" className={`text-xs px-2 py-1 ${STATUS_COLORS[c.licenceStatus] || ""}`}>{c.licenceStatus}</Badge>
                        {c.sector && <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40">{c.sector}</Badge>}
                      </div>
                      <p className="font-semibold text-sm text-foreground">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.organisation ?? "—"} · {c.contactEmail ?? "—"}</p>
                      {c.licenceExpiryDate && (
                        <p className={`text-sm flex items-center gap-1 font-medium ${isExpiring ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          Licence expires: {format(new Date(c.licenceExpiryDate), "dd MMM yyyy")}
                          {days !== null && ` (${days} days)`}
                          {isExpiring && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                        </p>
                      )}
                    </div>
                    {(c.licenceStatus !== "ACTIVE" || isExpiring) && (
                      <Button size="sm" variant="outline" onClick={() => renewMutation.mutate(c.id)} disabled={renewMutation.isPending} className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60 h-9 px-3">
                        <RotateCcw className="w-4 h-4 mr-2" />Renew Licence
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        {!isLoading && controllers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No registered entities. Register the first data controller or processor above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: ROPA Management ──────────────────────────────────────────────────
function RopaTab() {
  const { toast } = useToast();
  const [controllerId, setControllerId] = useState("");
  const [ropaTemplate, setRopaTemplate] = useState("OTHER");
  const [purpose, setPurpose] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("CONSENT");
  const [dataCategories, setDataCategories] = useState("");

  const { data: controllers = [] } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });
  const { data: records = [], isLoading } = useQuery<ProcessingRecord[]>({
    queryKey: ["/api/registry/processing-records"],
    queryFn: () => apiRequest("GET", "/api/registry/processing-records").then(r => r.json()),
  });

  const selectedTemplate = ROPA_TEMPLATES.find(t => t.value === ropaTemplate);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/processing-records", {
      controllerId, ropaTemplate, purpose, lawfulBasis,
      dataCategories: dataCategories.split(",").map(s => s.trim()).filter(Boolean),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/processing-records"] });
      setPurpose(""); setLawfulBasis("CONSENT"); setDataCategories(""); setControllerId("");
      toast({ title: "ROPA record created", description: "Processing activity record submitted for review." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />New Processing Activity (ROPA)</CardTitle>
          <CardDescription className="text-xs">AI validates completeness, lawful basis, and data minimisation after submission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label>ROPA Template</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {ROPA_TEMPLATES.map(t => (
                <button key={t.value} onClick={() => setRopaTemplate(t.value)}
                  className={`p-3 rounded-xl border text-left transition-all group ${ropaTemplate === t.value ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/30"}`}>
                  <t.icon className={`w-4 h-4 mb-1.5 ${ropaTemplate === t.value ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                  <p className={`text-[11px] font-semibold ${ropaTemplate === t.value ? "text-primary" : "text-foreground"}`}>{t.label}</p>
                </button>
              ))}
            </div>
            {selectedTemplate && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border/30 mt-2">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">Template guidance:</p>
                <ul className="space-y-0.5">{selectedTemplate.fields.map(f => <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ChevronRight className="w-3 h-3 text-primary" />{f}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Data Controller *</Label>
            <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={controllerId} onChange={e => setControllerId(e.target.value)}>
              <option value="">Select controller</option>
              {controllers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.controllerCode})</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Lawful Basis *</Label>
              <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={lawfulBasis} onChange={e => setLawfulBasis(e.target.value)}>
                {LAWFUL_BASES.map(b => <option key={b} value={b}>{b.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Data Categories (comma-separated)</Label>
              <Input value={dataCategories} onChange={e => setDataCategories(e.target.value)} placeholder="PERSONAL_DATA, CONTACT_DETAILS" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Processing Purpose *</Label>
            <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Describe in detail what this data is used for and why..." rows={3} />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !controllerId || !purpose.trim()}>
            <Zap className="w-4 h-4 mr-2" />Submit for AI Validation
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Processing Activity Records</h3>
        {isLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />) :
          records.map(r => (
            <Card key={r.id} className={`border-border/50 bg-card/40 backdrop-blur-sm ${r.excessiveDataDetected ? "border-red-500/30" : ""}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono text-xs text-primary font-semibold">{r.recordCode}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.ropaTemplate && <Badge variant="outline" className="text-[10px] px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20">{r.ropaTemplate}</Badge>}
                    <Badge variant="outline" className={`text-[10px] px-1.5 ${STATUS_COLORS[r.status] || ""}`}>{r.status}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1 p-2 rounded-lg bg-muted/20">
                    <p className="text-muted-foreground font-medium">Completeness</p>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/40">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${r.completenessScore * 100}%` }} />
                      </div>
                      <span className="font-bold text-foreground">{Math.round(r.completenessScore * 100)}%</span>
                    </div>
                  </div>
                  <div className={`space-y-1 p-2 rounded-lg ${r.lawfulBasisVerified ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    <p className="text-muted-foreground font-medium">Lawful Basis</p>
                    <div className="flex items-center gap-1">
                      {r.lawfulBasisVerified ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      <span className={r.lawfulBasisVerified ? "text-emerald-400" : "text-red-400"}>{r.lawfulBasisVerified ? "Verified" : "Failed"}</span>
                    </div>
                  </div>
                  <div className="space-y-1 p-2 rounded-lg bg-muted/20">
                    <p className="text-muted-foreground font-medium">Retention</p>
                    <p className="text-foreground">{r.retentionExpiryDate ? format(new Date(r.retentionExpiryDate), "MMM yyyy") : "—"}</p>
                  </div>
                  <div className={`space-y-1 p-2 rounded-lg ${r.excessiveDataDetected ? "bg-red-500/10" : "bg-muted/20"}`}>
                    <p className="text-muted-foreground font-medium">Data Min.</p>
                    <div className="flex items-center gap-1">
                      {r.excessiveDataDetected ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      <span className={r.excessiveDataDetected ? "text-red-400 text-[10px]" : "text-emerald-400"}>{r.excessiveDataDetected ? "Alert" : "OK"}</span>
                    </div>
                  </div>
                </div>
                {r.excessiveDataNotes && <p className={`text-[11px] px-2 py-1 rounded ${r.excessiveDataDetected ? "bg-red-500/10 text-red-400" : "text-muted-foreground"}`}>{r.excessiveDataNotes}</p>}
                {r.lawfulBasisVerificationNotes && !r.lawfulBasisVerified && <p className="text-[11px] px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">{r.lawfulBasisVerificationNotes}</p>}
                {r.purpose && <p className="text-[11px] text-muted-foreground truncate">{r.purpose}</p>}
              </CardContent>
            </Card>
          ))}
        {!isLoading && records.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No processing records yet. Submit your first ROPA record above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Breach Reporting ──────────────────────────────────────────────────
function BreachTab() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [detectedDate, setDetectedDate] = useState("");

  const { data: breaches = [], isLoading } = useQuery<DataBreach[]>({
    queryKey: ["/api/registry/breaches"],
    queryFn: () => apiRequest("GET", "/api/registry/breaches").then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/registry/breaches/${id}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/registry/breaches"] }); toast({ title: "Breach record updated" }); },
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/breaches", { title, description, incidentDate, detectedDate }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/breaches"] });
      setTitle(""); setDescription(""); setIncidentDate(""); setDetectedDate("");
      toast({ title: "Breach reported", description: "AI severity classification applied. SLA clock started." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const NEXT_STATUS: Record<string, string> = { REPORTED: "INVESTIGATING", INVESTIGATING: "CONTAINED", CONTAINED: "RESOLVED" };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />Report a Data Breach</CardTitle>
          <CardDescription className="text-xs">AI will auto-classify severity and set the appropriate regulatory SLA timer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2"><Label className="text-sm font-medium">Breach Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Unauthorised access to customer database" className="h-10" /></div>
          <div className="space-y-2"><Label className="text-sm font-medium">Description *</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the breach: data types involved, affected parties, suspected cause..." rows={4} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="text-sm font-medium">Incident Date *</Label><Input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} className="h-10" /></div>
            <div className="space-y-2"><Label className="text-sm font-medium">Detection Date *</Label><Input type="date" value={detectedDate} onChange={e => setDetectedDate(e.target.value)} className="h-10" /></div>
          </div>
          <Button variant="destructive" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title || !description || !incidentDate || !detectedDate} className="h-10 w-full">
            <AlertCircle className="w-4 h-4 mr-2" />Report Breach & Start SLA
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />) :
          breaches.map(b => {
            const slaHoursLeft = b.slaDeadline ? differenceInDays(new Date(b.slaDeadline), new Date()) : null;
            return (
              <Card key={b.id} className={`border-border/50 bg-card/40 backdrop-blur-sm ${b.slaStatus === "BREACHED" ? "border-red-500/40" : ""}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-primary font-semibold">{b.breachCode}</span>
                        <Badge variant="outline" className={`text-xs px-2 py-1 ${SEVERITY_COLORS[b.severity]}`}>⚡ {b.severity}</Badge>
                        <Badge variant="outline" className={`text-xs px-2 py-1 ${STATUS_COLORS[b.status]}`}>{b.status}</Badge>
                        {b.slaStatus === "BREACHED" && <Badge variant="outline" className="text-xs px-2 py-1 bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40">⏰ SLA BREACHED</Badge>}
                      </div>
                      <p className="font-semibold text-sm">{b.title}</p>
                    </div>
                    {NEXT_STATUS[b.status] && (
                      <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={() => updateMutation.mutate({ id: b.id, data: { status: NEXT_STATUS[b.status] } })}>
                        Mark {NEXT_STATUS[b.status]}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{b.description}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-muted/20"><span className="text-muted-foreground">Incident: </span><span className="font-medium">{format(new Date(b.incidentDate), "dd MMM yyyy")}</span></div>
                    <div className="p-2.5 rounded bg-muted/20"><span className="text-muted-foreground">Detected: </span><span className="font-medium">{format(new Date(b.detectedDate), "dd MMM yyyy")}</span></div>
                    {b.slaDeadline && <div className={`p-2.5 rounded ${slaHoursLeft !== null && slaHoursLeft < 1 ? "bg-red-500/10" : "bg-muted/20"}`}><span className="text-muted-foreground">SLA: </span><span className="font-medium">{slaHoursLeft !== null && slaHoursLeft >= 0 ? `${slaHoursLeft}d left` : "Overdue"}</span></div>}
                  </div>
                  {b.impactAssessment && <p className="text-xs text-muted-foreground"><span className="text-foreground/60 font-medium">Impact: </span>{b.impactAssessment}</p>}
                </CardContent>
              </Card>
            );
          })}
        {!isLoading && breaches.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No breaches reported. Use the form above to report a new incident.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: DSR & Complaints ──────────────────────────────────────────────────
function DsrTab() {
  const { toast } = useToast();
  const [subjectName, setSubjectName] = useState("");
  const [subjectEmail, setSubjectEmail] = useState("");
  const [requestType, setRequestType] = useState("ACCESS");
  const [details, setDetails] = useState("");
  const [complainantName, setComplainantName] = useState("");
  const [complainantEmail, setComplainantEmail] = useState("");
  const [complaintDetails, setComplaintDetails] = useState("");
  const [linkedRequestId, setLinkedRequestId] = useState("");
  const [activeForm, setActiveForm] = useState<"dsr" | "complaint">("dsr");

  const { data: requests = [], isLoading: reqLoading } = useQuery<DsrRequest[]>({
    queryKey: ["/api/registry/dsr-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-requests").then(r => r.json()),
  });
  const { data: complaints = [], isLoading: cmpLoading } = useQuery<DsrComplaint[]>({
    queryKey: ["/api/registry/dsr-complaints"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-complaints").then(r => r.json()),
  });

  const createDsrMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/dsr-requests", { subjectName, subjectEmail, requestType, details }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/dsr-requests"] });
      setSubjectName(""); setSubjectEmail(""); setDetails("");
      toast({ title: "DSR logged", description: "30-day response clock started." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const updateDsrMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/registry/dsr-requests/${id}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/registry/dsr-requests"] }); toast({ title: "DSR status updated" }); },
  });

  const createComplaintMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/dsr-complaints", { complainantName, complainantEmail, details: complaintDetails, requestId: linkedRequestId || null }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/dsr-complaints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/dsr-requests"] });
      setComplainantName(""); setComplainantEmail(""); setComplaintDetails(""); setLinkedRequestId("");
      toast({ title: "Complaint logged", description: "Complaint recorded and linked to the DSR request." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const DSR_STATUS_FLOW: Record<string, string> = { RECEIVED: "IN_PROGRESS", IN_PROGRESS: "COMPLETED" };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button onClick={() => setActiveForm("dsr")} className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${activeForm === "dsr" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
          <User className="w-4 h-4 inline mr-2" />New DSR Request
        </button>
        <button onClick={() => setActiveForm("complaint")} className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${activeForm === "complaint" ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-border/50 text-muted-foreground"}`}>
          <AlertCircle className="w-4 h-4 inline mr-2" />File a Complaint
        </button>
      </div>

      {activeForm === "dsr" ? (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label className="text-sm font-medium">Subject Name *</Label><Input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="Jane Doe" className="h-10" /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">Subject Email *</Label><Input type="email" value={subjectEmail} onChange={e => setSubjectEmail(e.target.value)} placeholder="jane@example.com" className="h-10" /></div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Request Type</Label>
              <div className="flex flex-wrap gap-2">
                {DSR_TYPES.map(t => (
                  <button key={t} onClick={() => setRequestType(t)}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${requestType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label className="text-sm font-medium">Details</Label><Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe what data the subject is requesting..." rows={3} className="resize-none" /></div>
            <Button onClick={() => createDsrMutation.mutate()} disabled={createDsrMutation.isPending || !subjectName || !subjectEmail} className="h-10 w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />Log DSR Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-orange-500/20 bg-orange-500/5 backdrop-blur-sm">
          <CardContent className="p-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label className="text-sm font-medium">Complainant Name *</Label><Input value={complainantName} onChange={e => setComplainantName(e.target.value)} placeholder="John Smith" className="h-10" /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">Complainant Email *</Label><Input type="email" value={complainantEmail} onChange={e => setComplainantEmail(e.target.value)} placeholder="john@example.com" className="h-10" /></div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link to DSR Request (Optional)</Label>
              <select className="w-full rounded-lg border border-input bg-background px-3 py-2.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={linkedRequestId} onChange={e => setLinkedRequestId(e.target.value)}>
                <option value="">None (standalone complaint)</option>
                {requests.map(r => <option key={r.id} value={r.id}>{r.requestCode} – {r.subjectName}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label className="text-sm font-medium">Complaint Details *</Label><Textarea value={complaintDetails} onChange={e => setComplaintDetails(e.target.value)} placeholder="Describe the nature of the complaint..." rows={3} className="resize-none" /></div>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white h-10 w-full sm:w-auto" onClick={() => createComplaintMutation.mutate()} disabled={createComplaintMutation.isPending || !complainantName || !complaintDetails}>
              <AlertCircle className="w-4 h-4 mr-2" />Submit Complaint
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><User className="w-4 h-4" />DSR Requests ({requests.length})</h3>
          <ScrollArea className="h-[380px] pr-1">
            <div className="space-y-2">
              {reqLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />) :
                requests.map(r => {
                  const daysLeft = differenceInDays(new Date(r.deadline), new Date());
                  return (
                    <Card key={r.id} className={`border-border/50 bg-card/40 ${daysLeft < 5 ? "border-orange-500/30" : ""}`}>
                      <CardContent className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-primary font-semibold">{r.requestCode}</span>
                            <Badge variant="outline" className={`text-xs px-2 py-1 ${STATUS_COLORS[r.status]}`}>{r.status}</Badge>
                            <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40">{r.requestType}</Badge>
                          </div>
                          {DSR_STATUS_FLOW[r.status] && (
                            <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => updateDsrMutation.mutate({ id: r.id, data: { status: DSR_STATUS_FLOW[r.status] } })}>
                              → {DSR_STATUS_FLOW[r.status]}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs font-semibold">{r.subjectName} <span className="text-muted-foreground font-normal">· {r.subjectEmail}</span></p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className={daysLeft < 5 ? "text-orange-600 dark:text-orange-400 font-medium" : ""}><Clock className="w-3 h-3 inline mr-1" />{daysLeft}d left</span>
                          {r.complaintsCount > 0 && <span className="text-red-600 dark:text-red-400 font-medium"><AlertCircle className="w-3 h-3 inline mr-1" />{r.complaintsCount} complaint(s)</span>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </ScrollArea>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-400" />Complaints ({complaints.length})</h3>
          <ScrollArea className="h-[380px] pr-1">
            <div className="space-y-2">
              {cmpLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />) :
                complaints.map(c => (
                  <Card key={c.id} className="border-orange-500/20 bg-orange-500/5">
                    <CardContent className="p-3.5 space-y-1.5">
                      <div className="flex items-center gap-2"><span className="font-mono text-xs text-orange-600 dark:text-orange-400 font-semibold">{c.complaintCode}</span><Badge variant="outline" className={`text-xs px-2 py-1 ${STATUS_COLORS[c.status]}`}>{c.status}</Badge></div>
                      <p className="text-xs font-semibold">{c.complainantName}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.details}</p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 5: DPO & Local Representatives ────────────────────────────────────────
function DpoTab() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState("");
  const [isZw, setIsZw] = useState(true);
  const [repName, setRepName] = useState("");
  const [repEmail, setRepEmail] = useState("");

  const { data: controllers = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()),
  });
  const { data: dpos = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/registry/dpos"],
    queryFn: () => apiRequest("GET", "/api/registry/dpos").then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/dpos", { orgId, name, email, isZimbabweEstablished: isZw, localRepName: repName || undefined, localRepEmail: repEmail || undefined }).then(r => r.json()),
    onSuccess: () => { toast({ title: "DPO Appointed", description: "DPO appointment recorded. Notify authority to complete registration." }); setName(""); setEmail(""); setOrgId(""); setRepName(""); setRepEmail(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/dpos"] }); },
  });
  const notifyMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/dpos/${id}/notify`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Authority Notified" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/dpos"] }); },
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/dpos/${id}/revoke`).then(r => r.json()),
    onSuccess: () => { toast({ title: "DPO Appointment Revoked", variant: "destructive" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/dpos"] }); },
  });

  const DPO_STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
    NOTIFIED: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    REVOKED: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
  };

  const [sourceType, setSourceType] = useState<"api" | "database">("api");
  const [connectionString, setConnectionString] = useState("");
  const [queryText, setQueryText] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [queryPayload, setQueryPayload] = useState("{}");
  const [apiKey, setApiKey] = useState("");

  const { data: discoveryHistory = [], isLoading: discoveryHistoryLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/discovery-history"],
    queryFn: () => apiRequest("GET", "/api/registry/discovery-history?limit=5").then(r => r.json()),
  });

  const discoveryMut = useMutation({
    mutationFn: async () => {
      let parsedHeaders: Record<string, string> | undefined;
      let parsedPayload: Record<string, any> | undefined;

      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch {
          throw new Error("Invalid JSON in headers");
        }
      }

      if (queryPayload.trim() && queryPayload.trim() !== "{}") {
        try {
          parsedPayload = JSON.parse(queryPayload);
        } catch {
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
        toast({ title: "Discovery complete", description: `Found ${result.dataCount} records` });
        setConnectionString("");
        setQueryText("");
        setHeaders("{}");
        setQueryPayload("{}");
        setApiKey("");
      } else {
        toast({ title: "Discovery failed", description: result.error || "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/registry/discovery-history"] });
    },
    onError: (err: any) => {
      toast({ title: "Discovery error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">DPO & Local Representatives</h2></div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">Appoint DPO</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Organisation</Label>
              <select id="dpo-org" className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2.5 h-10 focus:outline-none focus:ring-2 focus:ring-primary/50" value={orgId} onChange={e => setOrgId(e.target.value)}>
                <option value="">Select controller...</option>
                {controllers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">DPO Full Name</Label>
              <Input id="dpo-name" placeholder="Dr. Jane Doe" value={name} onChange={e => setName(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">DPO Email</Label>
              <Input id="dpo-email" type="email" placeholder="dpo@organisation.co.zw" value={email} onChange={e => setEmail(e.target.value)} className="h-10" />
            </div>
            <div className="flex items-center gap-2 py-2">
              <input id="dpo-zw" type="checkbox" checked={isZw} onChange={e => setIsZw(e.target.checked)} className="w-4 h-4 rounded cursor-pointer" />
              <Label htmlFor="dpo-zw" className="text-sm font-medium cursor-pointer">Controller is established in Zimbabwe</Label>
            </div>
            {!isZw && (
              <div className="border border-amber-500/40 rounded-lg p-4 space-y-3 bg-amber-500/5">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">⚠ Local Representative Required (s.4(3))</p>
                <Input placeholder="Rep Name" value={repName} onChange={e => setRepName(e.target.value)} className="h-10" />
                <Input type="email" placeholder="Rep Email" value={repEmail} onChange={e => setRepEmail(e.target.value)} className="h-10" />
              </div>
            )}
            <Button id="dpo-appoint-btn" size="sm" className="w-full h-10" onClick={() => createMut.mutate()} disabled={!name || !email || !orgId || createMut.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" />Appoint DPO
            </Button>
          </CardContent>
        </Card>
        <div className="xl:col-span-3 space-y-3">
          {isLoading ? <div className="text-xs text-muted-foreground p-4">Loading...</div> : dpos.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No DPO appointments on record.</p></CardContent></Card>
          ) : dpos.map((d: any) => (
            <Card key={d.id} className="bg-card/60 border-border/40">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{d.name}</p>
                      <Badge variant="outline" className={`text-xs whitespace-nowrap ${DPO_STATUS_COLORS[d.status] ?? ""}`}>{d.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{d.email}</p>
                    {!d.isZimbabweEstablished && d.localRepName && <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">📍 Rep: {d.localRepName}</p>}
                    <p className="text-xs text-muted-foreground">Appointed {format(new Date(d.appointedAt), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {d.status === "PENDING" && <Button size="sm" variant="outline" className="text-xs h-9 px-3" onClick={() => notifyMut.mutate(d.id)}>Notify Authority</Button>}
                    {d.status !== "REVOKED" && <Button size="sm" variant="ghost" className="text-xs h-9 px-3 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300" onClick={() => revokeMut.mutate(d.id)}>Revoke</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />Discovery Workspace
          </CardTitle>
          <CardDescription className="text-xs">Use typed queries to inspect external APIs or databases for the evidence you need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={sourceType === "api" ? "default" : "outline"} onClick={() => setSourceType("api")}>API Endpoint</Button>
            <Button size="sm" variant={sourceType === "database" ? "default" : "outline"} onClick={() => setSourceType("database")}>Database</Button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{sourceType === "api" ? "API Endpoint URL" : "Database Connection String"}</Label>
            <Input
              placeholder={sourceType === "api" ? "https://api.example.com/data" : "postgresql://user:pass@host:5432/db"}
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">What are you looking for?</Label>
            <Textarea
              placeholder={sourceType === "api"
                ? "e.g. return active customer profiles created in the last 30 days"
                : "e.g. SELECT table_name, row_count FROM information_schema.tables WHERE table_schema = 'public'"
              }
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              className="min-h-24"
            />
          </div>

          {sourceType === "api" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">API Key (Optional)</Label>
                <Input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Custom Headers (JSON)</Label>
                <Textarea placeholder='{"Authorization": "Bearer token"}' value={headers} onChange={(e) => setHeaders(e.target.value)} className="min-h-20 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Advanced Payload (JSON)</Label>
                <Textarea placeholder='{"filters": {"status": "active"}, "limit": 50}' value={queryPayload} onChange={(e) => setQueryPayload(e.target.value)} className="min-h-20 font-mono" />
              </div>
            </>
          )}

          <Button className="w-full" onClick={() => discoveryMut.mutate()} disabled={!connectionString || discoveryMut.isPending}>
            {discoveryMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Discovering...</> : <><Search className="w-4 h-4 mr-2" />Discover</>}
          </Button>

          {discoveryMut.data && (
            <div className={`rounded-lg border p-3 text-sm ${discoveryMut.data.status === "success" ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              <p className="font-medium">{discoveryMut.data.status === "success" ? "Discovery complete" : "Discovery error"}</p>
              <p className="text-xs mt-1">{discoveryMut.data.status === "success" ? `Found ${discoveryMut.data.dataCount} records` : discoveryMut.data.error}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Recent discovery history</p>
            {discoveryHistoryLoading ? <p className="text-xs text-muted-foreground">Loading history...</p> : discoveryHistory.length > 0 ? (
              <div className="space-y-2">
                {discoveryHistory.map((item: any) => (
                  <div key={item.discoverySessionId || item.createdAt} className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.sourceType === "api" ? "API" : "DB"}</span>
                      <Badge variant="outline" className={item.status === "success" ? "border-emerald-500/30 text-emerald-500" : "border-red-500/30 text-red-500"}>{item.status}</Badge>
                    </div>
                    <p className="text-muted-foreground truncate mt-1">{item.connectionString}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(item.timestamp || item.createdAt), "dd MMM HH:mm")}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No discovery history yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 6: Consent & Patient Identifiers ─────────────────────────────────────
function ConsentPatientTab() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"consent" | "patient">("consent");
  const [orgId, setOrgId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectEmail, setSubjectEmail] = useState("");
  const [tier, setTier] = useState("NON_SENSITIVE");
  const [method, setMethod] = useState("IMPLIED");
  const [legalBasis, setLegalBasis] = useState("CONSENT");
  const [justification, setJustification] = useState("");
  const [custodian, setCustodian] = useState("");

  const { data: controllers = [] } = useQuery<any[]>({ queryKey: ["/api/registry/controllers"], queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()) });
  const { data: consents = [], isLoading: loadingC, refetch: refetchC } = useQuery<any[]>({ queryKey: ["/api/registry/consents"], queryFn: () => apiRequest("GET", "/api/registry/consents").then(r => r.json()) });
  const { data: pids = [], isLoading: loadingP, refetch: refetchP } = useQuery<any[]>({ queryKey: ["/api/registry/patient-ids"], queryFn: () => apiRequest("GET", "/api/registry/patient-ids").then(r => r.json()) });

  const createConsentMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/consents", { orgId, dataSubjectName: subjectName, dataSubjectEmail: subjectEmail, sensitivityTier: tier, method, legalBasisCode: legalBasis, justification }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Consent Recorded" }); setSubjectName(""); setSubjectEmail(""); setJustification(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/consents"] }); },
  });
  const withdrawMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/consents/${id}/withdraw`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Consent Withdrawn", variant: "destructive" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/consents"] }); },
  });
  const generatePidMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/patient-ids", { orgId, dataSubjectName: subjectName, dataSubjectEmail: subjectEmail, healthProfessionalCustodian: custodian }).then(r => r.json()),
    onSuccess: (d: any) => { toast({ title: "Patient ID Generated", description: `Unique ID: ${d.identifierValue}` }); setSubjectName(""); setSubjectEmail(""); setCustodian(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/patient-ids"] }); },
  });

  const TIER_COLORS: Record<string, string> = {
    NON_SENSITIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    SENSITIVE: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    HEALTH_GENETIC_BIOMETRIC: "bg-red-500/10 text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <Button id="consent-section-btn" size="sm" variant={activeSection === "consent" ? "default" : "outline"} onClick={() => setActiveSection("consent")} className="text-xs"><Lock className="w-3 h-3 mr-1" />Consent Records</Button>
        <Button id="patient-section-btn" size="sm" variant={activeSection === "patient" ? "default" : "outline"} onClick={() => setActiveSection("patient")} className="text-xs"><User className="w-3 h-3 mr-1" />Patient Identifiers</Button>
      </div>
      {activeSection === "consent" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Record Consent</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Organisation</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={orgId} onChange={e => setOrgId(e.target.value)}>
                  <option value="">Select...</option>
                  {controllers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Subject Name</Label><Input className="text-xs bg-muted/30" value={subjectName} onChange={e => setSubjectName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Subject Email</Label><Input type="email" className="text-xs bg-muted/30" value={subjectEmail} onChange={e => setSubjectEmail(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sensitivity Tier</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={tier} onChange={e => setTier(e.target.value)}>
                  <option value="NON_SENSITIVE">Non-Sensitive</option>
                  <option value="SENSITIVE">Sensitive</option>
                  <option value="HEALTH_GENETIC_BIOMETRIC">Health / Genetic / Biometric</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Consent Method</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="IMPLIED">Implied Consent</option>
                  <option value="EXPRESS_WRITTEN">Express Written Consent</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Legal Basis Code</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={legalBasis} onChange={e => setLegalBasis(e.target.value)}>
                  {["CONSENT","CONTRACT","LEGAL_OBLIGATION","VITAL_INTERESTS","PUBLIC_TASK","LEGITIMATE_INTERESTS","RESEARCH_STATISTICS","HEALTH_TREATMENT"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Justification</Label><Textarea className="text-xs bg-muted/30 min-h-[60px]" value={justification} onChange={e => setJustification(e.target.value)} /></div>
              <Button id="record-consent-btn" size="sm" className="w-full" onClick={() => createConsentMut.mutate()} disabled={!subjectName || !subjectEmail || !orgId || createConsentMut.isPending}>
                <Plus className="w-3.5 h-3.5 mr-1" />Record Consent
              </Button>
            </CardContent>
          </Card>
          <div className="xl:col-span-3 space-y-2">
            {loadingC ? <div className="text-xs text-muted-foreground p-4">Loading...</div> : consents.length === 0 ? (
              <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Lock className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No consent records.</p></CardContent></Card>
            ) : (
              <ScrollArea className="h-[480px]">
                <div className="space-y-2">
                  {consents.map((c: any) => (
                    <Card key={c.id} className={`bg-card/60 border-border/40 ${c.withdrawnAt ? 'opacity-60' : ''}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{c.dataSubjectName}</p>
                              <Badge variant="outline" className={`text-xs ${TIER_COLORS[c.sensitivityTier] ?? ""}`}>{c.sensitivityTier.replace(/_/g, " ")}</Badge>
                              {c.withdrawnAt && <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">WITHDRAWN</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{c.legalBasisCode} · {c.method} · {format(new Date(c.givenAt), "dd MMM yyyy")}</p>
                          </div>
                          {!c.withdrawnAt && <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-red-400 hover:text-red-300" onClick={() => withdrawMut.mutate(c.id)}>Withdraw</Button>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}
      {activeSection === "patient" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 bg-card/60 border-border/40">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Generate Patient Identifier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Organisation</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={orgId} onChange={e => setOrgId(e.target.value)}>
                  <option value="">Select...</option>
                  {controllers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Patient Name</Label><Input className="text-xs bg-muted/30" value={subjectName} onChange={e => setSubjectName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Patient Email</Label><Input type="email" className="text-xs bg-muted/30" value={subjectEmail} onChange={e => setSubjectEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Health Custodian</Label><Input className="text-xs bg-muted/30" placeholder="e.g. Hospital Name" value={custodian} onChange={e => setCustodian(e.target.value)} /></div>
              <Button id="generate-pid-btn" size="sm" className="w-full" onClick={() => generatePidMut.mutate()} disabled={!subjectName || !subjectEmail || !orgId || !custodian || generatePidMut.isPending}>
                <Zap className="w-3.5 h-3.5 mr-1" />Generate Patient ID
              </Button>
            </CardContent>
          </Card>
          <div className="xl:col-span-3 space-y-2">
            {loadingP ? <div className="text-xs text-muted-foreground p-4">Loading...</div> : pids.length === 0 ? (
              <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><User className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No identifiers generated.</p></CardContent></Card>
            ) : (
              <ScrollArea className="h-[480px]"><div className="space-y-2">
                {pids.map((p: any) => (
                  <Card key={p.id} className="bg-card/60 border-border/40">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.dataSubjectName}</p>
                          <p className="text-xs font-mono text-primary mt-0.5">{p.identifierValue}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.createdAt), "dd MMM yyyy")}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div></ScrollArea>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 7: Trans-border Transfers (TIAs) ─────────────────────────────────────
function TransferTab() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState("");
  const [country, setCountry] = useState("");
  const [derogation, setDerogation] = useState("");
  const [justification, setJustification] = useState("");

  const { data: controllers = [] } = useQuery<any[]>({ queryKey: ["/api/registry/controllers"], queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()) });
  const { data: transfers = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/transfers"], queryFn: () => apiRequest("GET", "/api/registry/transfers").then(r => r.json()) });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/transfers", { orgId, destinationCountry: country, derogationCode: derogation || undefined, justification }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Transfer Recorded" });
      setCountry(""); setDerogation(""); setJustification(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/transfers"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">File Transfer Impact Assessment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Organisation</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={orgId} onChange={e => setOrgId(e.target.value)}>
                <option value="">Select...</option>
                {controllers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Destination Country</Label><Input className="text-xs bg-muted/30" placeholder="e.g. South Africa" value={country} onChange={e => setCountry(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Derogation</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={derogation} onChange={e => setDerogation(e.target.value)}>
                <option value="">None</option>
                <option value="s29_a">s.29(a) — Consent</option>
                <option value="s29_b">s.29(b) — Contract</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Justification</Label><Textarea className="text-xs bg-muted/30 min-h-[60px]" value={justification} onChange={e => setJustification(e.target.value)} /></div>
            <Button size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!country || !orgId || createMut.isPending}>
              <FileText className="w-3.5 h-3.5 mr-1" />File TIA
            </Button>
          </CardContent>
        </Card>
        <div className="xl:col-span-3 space-y-2">
          {isLoading ? <div className="text-xs text-muted-foreground p-4">Loading...</div> : (
            <ScrollArea className="h-[480px]"><div className="space-y-2">
              {transfers.map((t: any) => (
                <Card key={t.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.destinationCountry}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "dd MMM yyyy")}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div></ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 8: Whistleblowing ─────────────────────────────────────────────────────
function DpoIntegrationsTab() {
  const { toast } = useToast();
  const { data: integrations = [], isLoading } = useQuery<ExternalIntegration[]>({
    queryKey: ["/api/registry/integrations"],
    queryFn: () => apiRequest("GET", "/api/registry/integrations").then(r => r.json()),
  });

  const [selectedFilter, setSelectedFilter] = useState("ALL");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState("Salesforce");
  const [newSystemName, setNewSystemName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [introAccepted, setIntroAccepted] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<"signin" | "request" | "manual">("signin");
  const [monitoringScope, setMonitoringScope] = useState<string[]>(["personal_info", "sensitive_info", "retention", "retention_expiry", "access_changes", "exports"]);
  const [monitoringFrequency, setMonitoringFrequency] = useState("continuous");
  const [requestedOwner, setRequestedOwner] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState<ExternalIntegration | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<ExternalIntegration | null>(null);

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/registry/integrations/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      setDeleteDialogOpen(false);
      setIntegrationToDelete(null);
      setEditorOpen(false);
      toast({ title: "System unlinked", description: "The integration was removed and its connector credentials were revoked." });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/integrations/${id}/sync`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      toast({ title: "Monitoring check started", description: "IntelliNexus is running a fresh review." });
    },
    onError: (e: any) => toast({ title: "Check failed", description: e?.message, variant: "destructive" }),
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => apiRequest("PATCH", `/api/registry/integrations/${id}`, payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      toast({ title: "Monitoring updated", description: "The system settings were adjusted successfully." });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const createIntegrationMutation = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/registry/integrations", payload).then(r => r.json()),
    onSuccess: (createdIntegration: ExternalIntegration) => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      setWizardOpen(false);
      setWizardStep(1);
      setIntroAccepted(false);
      setSelectedSystem("Salesforce");
      setNewSystemName("");
      setNewDisplayName("");
      setMonitoringScope(["personal_info", "sensitive_info", "retention", "retention_expiry", "access_changes", "exports"]);
      setSelectedIntegration(createdIntegration);
      setEditorOpen(true);
      setShowTechnicalDetails(false);
      toast({ title: "System connected", description: `${createdIntegration.displayName || createdIntegration.systemName} is now in your Connected Systems workspace. IntelliNexus will run an initial review shortly.` });
    },
    onError: (e: any) => toast({ title: "Connection failed", description: e?.message, variant: "destructive" }),
  });

  const INTEGRATION_ICONS: Record<string, any> = {
    GOVERNMENT: Globe, CYBERSECURITY: Shield, AUDIT: FileText, GENERIC: Cpu,
  };

  const categories = ["ALL", "Customer Management", "Finance and Accounting", "Human Resources and Payroll", "Business Intelligence and Reporting", "Databases", "Document and File Storage", "Email and Collaboration", "Cloud Platforms", "Security and Audit Systems", "Healthcare Systems", "Government Systems", "Other"];
  const systemOptions = [
    { name: "Salesforce", category: "Customer Management", type: "CRM" },
    { name: "Microsoft Dynamics", category: "Customer Management", type: "CRM" },
    { name: "SAP", category: "Finance and Accounting", type: "ERP" },
    { name: "Oracle ERP", category: "Finance and Accounting", type: "ERP" },
    { name: "Microsoft Power BI", category: "Business Intelligence and Reporting", type: "Analytics" },
    { name: "Tableau", category: "Business Intelligence and Reporting", type: "Analytics" },
    { name: "PostgreSQL", category: "Databases", type: "Database" },
    { name: "Microsoft SQL Server", category: "Databases", type: "Database" },
    { name: "Google Workspace", category: "Email and Collaboration", type: "Collaboration" },
    { name: "Microsoft 365", category: "Email and Collaboration", type: "Collaboration" },
    { name: "SharePoint", category: "Document and File Storage", type: "Documents" },
    { name: "AWS", category: "Cloud Platforms", type: "Cloud" },
  ];
  const scopeOptions = [
    { key: "personal_info", label: "Personal information discovery", description: "Find names, addresses and contact details." },
    { key: "sensitive_info", label: "Sensitive information discovery", description: "Surface IDs, health and financial data." },
    { key: "retention", label: "Data retention period compliance", description: "Monitor records against defined retention policies and flag overdue deletions." },
    { key: "retention_expiry", label: "Retention expiry tracking", description: "Alert when data is approaching or past retention deadline." },
    { key: "access_changes", label: "Access and permission changes", description: "Track unusual changes in access rights." },
    { key: "exports", label: "Unusual downloads and exports", description: "Spot large or risky data exports." },
  ];

  const friendlyStatus = (item: ExternalIntegration) => {
    const status = (item.status || "").toUpperCase();
    if (status === "CONNECTED" || status === "HEALTHY") return "Operating Normally";
    if (status === "DEGRADED") return "Monitoring";
    if (status === "DISCONNECTED" || status === "FAILED" || status === "ERROR") return "Needs Attention";
    if (status === "PAUSED") return "Monitoring Paused";
    return "Setup Incomplete";
  };

  const statusTone = (item: ExternalIntegration) => {
    const status = friendlyStatus(item);
    if (status === "Operating Normally") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (status === "Monitoring") return "bg-sky-500/15 text-sky-700 border-sky-500/30";
    if (status === "Needs Attention") return "bg-orange-500/15 text-orange-700 border-orange-500/30";
    if (status === "Monitoring Paused") return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  };

  const summaryCards = [
    { key: "ALL", title: "Connected Systems", value: integrations.length, caption: "Organisations monitored", filter: "ALL" },
    { key: "healthy", title: "Operating Normally", value: integrations.filter(i => friendlyStatus(i) === "Operating Normally" || friendlyStatus(i) === "Monitoring").length, caption: "Systems with healthy monitoring", filter: "healthy" },
    { key: "attention", title: "Needs Attention", value: integrations.filter(i => friendlyStatus(i) === "Needs Attention").length, caption: "Systems to review", filter: "attention" },
    { key: "data", title: "Data Locations Found", value: integrations.reduce((sum, item) => sum + ((item.metadata as any)?.dataLocations || 3), 0), caption: "Business data areas discovered", filter: "data" },
    { key: "privacy", title: "Open Privacy Concerns", value: integrations.reduce((sum, item) => sum + ((item.metadata as any)?.privacyConcerns || 1), 0), caption: "Issues needing review", filter: "privacy" },
    { key: "retention", title: "Retention Period Violations", value: integrations.reduce((sum, item) => sum + ((item.metadata as any)?.retentionIssues || 0), 0), caption: "Records past or approaching retention deadline", filter: "retention" },
    { key: "breach", title: "Breach Alerts", value: integrations.reduce((sum, item) => sum + ((item.metadata as any)?.breachAlerts || 0), 0), caption: "Potential incidents", filter: "breach" },
  ];

  const filteredIntegrations = integrations.filter((item) => {
    const matchesFilter = selectedFilter === "ALL"
      ? true
      : selectedFilter === "healthy"
        ? friendlyStatus(item) === "Operating Normally" || friendlyStatus(item) === "Monitoring"
        : selectedFilter === "attention"
          ? friendlyStatus(item) === "Needs Attention"
          : selectedFilter === "data"
            ? ((item.metadata as any)?.dataLocations || 3) >= 3
            : selectedFilter === "privacy"
              ? ((item.metadata as any)?.privacyConcerns || 0) > 0
              : selectedFilter === "retention"
                ? ((item.metadata as any)?.retentionIssues || 0) > 0
                : selectedFilter === "breach"
                  ? ((item.metadata as any)?.breachAlerts || 0) > 0
                  : true;
    const matchesSearch = !searchQuery || (item.displayName || item.systemName || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const visibleSystems = systemOptions.filter((system) => {
    const categoryMatch = selectedCategory === "ALL" || system.category === selectedCategory;
    const queryMatch = !searchQuery || system.name.toLowerCase().includes(searchQuery.toLowerCase()) || system.category.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && queryMatch;
  });

  const toggleScope = (scope: string) => {
    setMonitoringScope((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  };

  const handleCreateConnection = () => {
    const chosenName = newDisplayName.trim() || selectedSystem;
    createIntegrationMutation.mutate({
      systemName: newSystemName.trim() || selectedSystem.replace(/\s+/g, "_").toUpperCase(),
      displayName: chosenName,
      integrationType: selectedSystem.includes("SQL") || selectedSystem.includes("Postgre") ? "GENERIC" : selectedSystem.includes("Sales") || selectedSystem.includes("Dynamics") ? "GENERIC" : "GENERIC",
      connectorType: connectionMethod === "manual" ? "DATABASE" : "API",
      enabled: true,
      status: "DISCONNECTED",
      metadata: {
        portalVisible: true,
        createdFromPortal: true,
        connectionMethod,
        monitoringScope,
        monitoringFrequency,
        privacyConcerns: 1,
        retentionIssues: 0,
        breachAlerts: 0,
        dataLocations: 5,
        owner: requestedOwner || "Business owner",
        lastCheckedLabel: "Just connected",
      },
      config: {
        monitoringFrequency,
        monitoringScope,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Connected Systems</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">Connect and monitor the systems that hold or process personal information. IntelliNexus helps discover data, identify privacy risks and track compliance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setWizardOpen(true); setWizardStep(1); }}>
              <Plus className="w-4 h-4 mr-2" />Connect a System
            </Button>
            <Button variant="outline">
              <Shield className="w-4 h-4 mr-2" />View Privacy Overview
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <button key={card.key} onClick={() => setSelectedFilter(card.filter)} className={`rounded-2xl border p-4 text-left transition-all ${selectedFilter === card.filter ? "border-primary bg-primary/10" : "border-border/50 bg-card/50 hover:border-primary/30"}`}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.title}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.caption}</p>
          </button>
        ))}
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <Label className="text-xs">Find a system</Label>
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search systems, categories or business areas" className="mt-2 h-10" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setWizardOpen(true); setWizardStep(1); }}>Connect a System</Button>
            <Button variant="ghost" onClick={() => setSelectedFilter("ALL")}>Show all</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {isLoading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 rounded-2xl bg-muted/30 animate-pulse" />) : (
          filteredIntegrations.length > 0 ? filteredIntegrations.map((item) => {
            const Icon = INTEGRATION_ICONS[item.integrationType] || Cpu;
            const status = friendlyStatus(item);
            const dataAreas = (item.metadata as any)?.dataAreas || ["Customer records", "Contact details", "User activity"];
            return (
              <Card key={item.id} className="border-border/50 bg-card/40">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{item.displayName || item.systemName}</p>
                        <p className="text-xs text-muted-foreground">{item.integrationType} · {item.connectorType}</p>
                        <p className="text-xs text-muted-foreground mt-1">Business owner: {(item.metadata as any)?.owner || "Business owner"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-2 py-1 ${statusTone(item)}`}>{status}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last checked</p>
                      <p className="font-medium text-foreground">{item.lastSyncAt ? formatDistanceToNow(new Date(item.lastSyncAt), { addSuffix: true }) : "Not checked yet"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Monitoring status</p>
                      <p className="font-medium text-foreground">{item.enabled ? "Monitoring" : "Monitoring paused"}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data areas monitored</p>
                    <div className="flex flex-wrap gap-2">
                      {dataAreas.slice(0, 4).map((area: string) => <Badge key={area} variant="outline" className="text-[10px]">{area}</Badge>)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 text-sm space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                        <span>Privacy overview</span>
                        <span>{(item.metadata as any)?.privacyConcerns || 1} concerns</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{(item.metadata as any)?.dataLocations || 3} data locations</span>
                        <span>{(item.metadata as any)?.breachAlerts || 0} breach alerts</span>
                      </div>
                    </div>
                    <div className="border-t border-border/30 pt-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Retention monitoring</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{(item.metadata as any)?.retentionIssues || 0}</span>
                        <span className="text-xs text-muted-foreground">records past or approaching retention deadline</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setSelectedIntegration(item); setEditorOpen(true); setShowTechnicalDetails(false); }}>
                      <Eye className="w-3.5 h-3.5 mr-1.5" />View System
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => syncMutation.mutate(item.id)} disabled={syncMutation.isPending}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Run Check Now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateIntegrationMutation.mutate({ id: item.id, payload: { enabled: !item.enabled, status: item.enabled ? "DISCONNECTED" : "CONNECTED", healthStatus: item.enabled ? "DEGRADED" : "HEALTHY" } })}>
                      {item.enabled ? <PauseCircle className="w-3.5 h-3.5 mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                      {item.enabled ? "Pause Monitoring" : "Resume Monitoring"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 border-red-500/20 hover:bg-red-500/10" onClick={() => { setIntegrationToDelete(item); setDeleteDialogOpen(true); }}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />Unlink
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          }) : (
            <div className="col-span-2 rounded-2xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-foreground">No systems match this view yet.</p>
              <p className="text-sm mt-1">Try a broader search or connect a new system to start monitoring privacy risks.</p>
            </div>
          )
        )}
      </div>

      {editorOpen && selectedIntegration && (
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-sm">System workspace</CardTitle>
              <CardDescription className="text-xs">Review privacy posture, monitoring coverage and simple next actions for this connected system.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditorOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Connection health</p>
                <p className="mt-2 font-semibold">{friendlyStatus(selectedIntegration)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedIntegration.enabled ? "Monitoring is active and ready for review." : "Monitoring is paused until resumed."}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Data areas</p>
                <p className="mt-2 font-semibold">{(selectedIntegration.metadata as any)?.dataAreas?.join(", ") || "Customer records, contact details"}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Recommended next step</p>
                <p className="mt-2 font-semibold">Review privacy findings</p>
                <p className="mt-1 text-sm text-muted-foreground">Use the monitoring workspace to see what IntelliNexus has found.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowTechnicalDetails((value) => !value)}>
                <Cpu className="w-3.5 h-3.5 mr-1.5" />{showTechnicalDetails ? "Hide" : "View"} Technical Details
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateIntegrationMutation.mutate({ id: selectedIntegration.id, payload: { enabled: true, status: "CONNECTED", healthStatus: "HEALTHY" } })}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh monitoring
              </Button>
            </div>
            {showTechnicalDetails && (
              <pre className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs overflow-x-auto">{JSON.stringify(selectedIntegration.config || {}, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setIntegrationToDelete(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unlink connected system</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">This will remove the integration from the portal and revoke any stored connector credentials.</p>
          </DialogHeader>
          <div className="mt-4 rounded-xl border border-border/50 bg-background/70 p-4">
            <p className="text-sm text-foreground">Are you sure you want to unlink <span className="font-semibold">{integrationToDelete?.displayName || integrationToDelete?.systemName}</span>?</p>
            <p className="mt-2 text-xs text-muted-foreground">This action cannot be undone. The system will need to be connected again if you want monitoring to resume.</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => integrationToDelete && deleteIntegrationMutation.mutate(integrationToDelete.id)} disabled={deleteIntegrationMutation.isPending}>
              {deleteIntegrationMutation.isPending ? "Unlinking..." : "Unlink system"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {wizardOpen && (
        <Card className="border border-primary/20 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Connect a System</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">A guided, business-friendly connection flow for DPOs and business owners.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium">Step {wizardStep} of 7</div>
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(wizardStep / 7) * 100}%` }} />
              </div>
            </div>

            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Search systems</Label>
                    <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search for a system" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Category</Label>
                    <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm">
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleSystems.slice(0, 8).map((system) => (
                    <button key={system.name} onClick={() => setSelectedSystem(system.name)} className={`rounded-xl border p-3 text-left ${selectedSystem === system.name ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                      <p className="font-medium text-foreground">{system.name}</p>
                      <p className="text-xs text-muted-foreground">{system.category} · {system.type}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-dashed border-border/50 p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">My system is not listed</p>
                  <p className="mt-1">You can still add a custom connected system and define the monitoring areas you want IntelliNexus to review.</p>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-background/60 p-4">
                <h3 className="font-semibold text-foreground">What IntelliNexus will do</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Find personal and sensitive information in the selected system.</li>
                  <li>Highlight retention and access concerns.</li>
                  <li>Monitor unusual downloads, exports and sharing activity.</li>
                  <li>Support data-subject requests and privacy investigations.</li>
                </ul>
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
                  <Shield className="w-4 h-4 mt-0.5 text-primary" />
                  <span>IntelliNexus uses read-only access by default and will not change or delete information unless you approve a controlled action.</span>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={introAccepted} onChange={(e) => setIntroAccepted(e.target.checked)} className="mt-1" />
                  <span>I understand what IntelliNexus will monitor.</span>
                </label>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <button onClick={() => setConnectionMethod("signin")} className={`rounded-xl border p-3 text-left ${connectionMethod === "signin" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                    <p className="font-medium text-foreground">Sign in securely</p>
                    <p className="text-xs text-muted-foreground">Redirect to the system to approve access.</p>
                  </button>
                  <button onClick={() => setConnectionMethod("request")} className={`rounded-xl border p-3 text-left ${connectionMethod === "request" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                    <p className="font-medium text-foreground">Send setup request to IT</p>
                    <p className="text-xs text-muted-foreground">Ask your administrator to help complete setup.</p>
                  </button>
                  <button onClick={() => setConnectionMethod("manual")} className={`rounded-xl border p-3 text-left ${connectionMethod === "manual" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                    <p className="font-medium text-foreground">Enter connection details</p>
                    <p className="text-xs text-muted-foreground">Use a secure, guided form for supported systems.</p>
                  </button>
                </div>
                {connectionMethod === "request" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs">IT administrator</Label>
                      <Input value={requestedOwner} onChange={(e) => setRequestedOwner(e.target.value)} placeholder="Name" className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Email address</Label>
                      <Input value={requestedEmail} onChange={(e) => setRequestedEmail(e.target.value)} placeholder="it@example.com" className="h-10" />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label className="text-xs">Optional message</Label>
                      <Textarea value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Tell the administrator what access is needed." className="min-h-[90px]" />
                    </div>
                  </div>
                )}
                {connectionMethod === "manual" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2"><Label className="text-xs">System address</Label><Input placeholder="https://example.com" className="h-10" /></div>
                    <div className="space-y-2"><Label className="text-xs">Organisation or account name</Label><Input placeholder="Contoso" className="h-10" /></div>
                    <div className="space-y-2"><Label className="text-xs">Username</Label><Input placeholder="admin@example.com" className="h-10" /></div>
                    <div className="space-y-2"><Label className="text-xs">Password or access key</Label><Input type="password" placeholder="••••••••" className="h-10" /></div>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Choose the business areas IntelliNexus should monitor. Retention period monitoring is recommended for all systems.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {scopeOptions.map((scope) => {
                    const isRetention = scope.key === "retention" || scope.key === "retention_expiry";
                    const isSelected = monitoringScope.includes(scope.key);
                    return (
                      <button key={scope.key} onClick={() => toggleScope(scope.key)} className={`rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : isRetention
                            ? "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50"
                            : "border-border/50 bg-background/70"
                      }`}>
                        <p className="font-medium text-foreground">{scope.label}</p>
                        <p className="text-xs text-muted-foreground">{scope.description}</p>
                        {isRetention && !isSelected && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 font-medium">Recommended</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select how often IntelliNexus should review this system.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { value: "continuous", label: "Continuous monitoring", description: "Best for systems that change often." },
                    { value: "hourly", label: "Every hour", description: "Useful for active business systems." },
                    { value: "daily", label: "Daily", description: "Good for steady-state monitoring." },
                    { value: "weekly", label: "Weekly", description: "Suitable for lower-change systems." },
                  ].map((option) => (
                    <button key={option.value} onClick={() => setMonitoringFrequency(option.value)} className={`rounded-xl border p-3 text-left ${monitoringFrequency === option.value ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                      <p className="font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 6 && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-background/60 p-4">
                <h3 className="font-semibold text-foreground">Permission summary</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>IntelliNexus will be able to view system structure and identify personal-data locations.</li>
                  <li>It will read selected audit activity and monitor change events.</li>
                  <li>It will not change business records or delete information automatically.</li>
                </ul>
                <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">Read-only access recommended</div>
              </div>
            )}

            {wizardStep === 7 && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-background/60 p-4">
                <h3 className="font-semibold text-foreground">Ready to activate</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Connection method selected</li>
                  <li>• Monitoring areas chosen</li>
                  <li>• Read-only permissions reviewed</li>
                  <li>• Privacy monitoring ready to begin</li>
                </ul>
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
                  <p className="font-medium">What happens next</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>The system will appear in your Connected Systems workspace immediately.</li>
                    <li>IntelliNexus will run an initial review using the monitoring scope you selected.</li>
                    <li>You can review findings, pause monitoring or adjust the connection from the system workspace.</li>
                  </ul>
                </div>
                {monitoringScope.includes("retention") || monitoringScope.includes("retention_expiry") ? (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-foreground">
                    <p className="font-medium text-orange-700 dark:text-orange-400">Retention period monitoring enabled</p>
                    <p className="text-xs text-muted-foreground mt-1">IntelliNexus will track data records against your retention policies and alert you when records are approaching or past their retention deadline.</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Friendly system name" className="h-10 max-w-xs" />
                  <Button onClick={handleCreateConnection} disabled={createIntegrationMutation.isPending}>
                    <Zap className="w-4 h-4 mr-2" />Start Monitoring
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => wizardStep > 1 ? setWizardStep((step) => step - 1) : setWizardOpen(false)}>{wizardStep > 1 ? "Back" : "Cancel"}</Button>
              <Button onClick={() => wizardStep < 7 ? setWizardStep((step) => step + 1) : undefined} disabled={wizardStep === 2 && !introAccepted}>
                {wizardStep < 7 ? "Continue" : "Done"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WhistleblowingTab() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState("");
  const [isAnon, setIsAnon] = useState(true);
  const [implicatedPerson, setImplicatedPerson] = useState("");
  const [details, setDetails] = useState("");

  const { data: controllers = [] } = useQuery<any[]>({ queryKey: ["/api/registry/controllers"], queryFn: () => apiRequest("GET", "/api/registry/controllers").then(r => r.json()) });
  const { data: reports = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/whistleblowing"], queryFn: () => apiRequest("GET", "/api/registry/whistleblowing").then(r => r.json()) });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/whistleblowing", { orgId, isAnonymous: isAnon, implicatedPerson, details }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Report Filed" }); setImplicatedPerson(""); setDetails(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/whistleblowing"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">File Report</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Organisation</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={orgId} onChange={e => setOrgId(e.target.value)}>
                <option value="">Select...</option>
                {controllers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Implicated</Label><Input className="text-xs bg-muted/30" value={implicatedPerson} onChange={e => setImplicatedPerson(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Details</Label><Textarea className="text-xs bg-muted/30 min-h-[80px]" value={details} onChange={e => setDetails(e.target.value)} /></div>
            <Button size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!implicatedPerson || !details || !orgId || createMut.isPending}>
              <EyeOff className="w-3.5 h-3.5 mr-1" />File Report
            </Button>
          </CardContent>
        </Card>
        <div className="xl:col-span-3 space-y-2">
          {isLoading ? <div className="text-xs text-muted-foreground p-4">Loading...</div> : (
            <ScrollArea className="h-[480px]"><div className="space-y-2">
              {reports.map((r: any) => (
                <Card key={r.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">Re: {r.implicatedPerson}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{r.details}</p>
                  </CardContent>
                </Card>
              ))}
            </div></ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RegistryPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("controllers");
  const showDpoIntegrationsTab = user?.role === "DATA_PROTECTION_OFFICER" || user?.role === "DATA_CONTROLLER";

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-card to-card/50 p-6 sm:p-8 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/15 px-4 py-2 text-cyan-700 dark:text-cyan-400 text-xs font-semibold uppercase tracking-wide border border-cyan-500/20">
              <Database className="w-4 h-4" />
              <span>DPO Portal</span>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">Data Protection Officer Dashboard</h1>
              <p className="max-w-3xl text-sm sm:text-base text-muted-foreground mt-2">Centralized compliance workspace for DPOs, local representatives, and regulatory oversight. Manage registries, process requests, and maintain audit trails with cryptographic verification.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2 border border-emerald-500/20 font-medium">DPO Workflows</span>
            <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 px-3 py-2 border border-blue-500/20 font-medium">Regulatory Review</span>
          </div>
        </div>
      </div>

      <DpoToolbar onAppointClick={() => setActiveTab("dpo")} onSearch={() => { /* placeholder for search hook */ }} />

      <div className="flex flex-wrap justify-end gap-2 mb-3">
        {showDpoIntegrationsTab && (
          <Button size="sm" variant="outline" onClick={() => setActiveTab("integrations")}>Open Connected Systems</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setActiveTab("dpo-config")}>Open DPO Config</Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList className="flex overflow-x-auto gap-3 rounded-3xl border border-border/20 bg-gradient-to-r from-background/95 to-background/80 p-3 backdrop-blur-sm scrollbar-thin scrollbar-thumb-slate-300/40" role="tablist">
          <TabsTrigger value="controllers" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Building2 className="w-4 h-4 flex-shrink-0" /><span>Registry & Licences</span>
          </TabsTrigger>
          <TabsTrigger value="ropa" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <BookOpen className="w-4 h-4 flex-shrink-0" /><span>ROPA Management</span>
          </TabsTrigger>
          <TabsTrigger value="breaches" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-red-500/10 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>Breach Reporting</span>
          </TabsTrigger>
          <TabsTrigger value="dsr" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <User className="w-4 h-4 flex-shrink-0" /><span>DSR & Complaints</span>
          </TabsTrigger>
          <TabsTrigger value="dpo" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-600 dark:data-[state=active]:text-cyan-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Shield className="w-4 h-4 flex-shrink-0" /><span>DPO & Reps</span>
          </TabsTrigger>
          <TabsTrigger value="data-discovery" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Search className="w-4 h-4 flex-shrink-0" /><span>Data Discovery</span>
          </TabsTrigger>
          <TabsTrigger value="dpo-config" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Gavel className="w-4 h-4 flex-shrink-0" /><span>DPO Config</span>
          </TabsTrigger>
          {showDpoIntegrationsTab && (
            <TabsTrigger value="integrations" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-600 dark:data-[state=active]:text-cyan-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
              <Globe className="w-4 h-4 flex-shrink-0" /><span>Connected Systems</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="consent" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Lock className="w-4 h-4 flex-shrink-0" /><span>Consent & IDs</span>
          </TabsTrigger>
          <TabsTrigger value="transfers" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Globe className="w-4 h-4 flex-shrink-0" /><span>TIAs</span>
          </TabsTrigger>
          <TabsTrigger value="whistleblowing" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <EyeOff className="w-4 h-4 flex-shrink-0" /><span>Whistleblowing</span>
          </TabsTrigger>
          <TabsTrigger value="processor-instructions" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Building2 className="w-4 h-4 flex-shrink-0" /><span>Processor Instructions</span>
          </TabsTrigger>
          <TabsTrigger value="retention-compliance" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Clock className="w-4 h-4 flex-shrink-0" /><span>Retention & Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="purposes" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <BookOpen className="w-4 h-4 flex-shrink-0" /><span>Purpose Register</span>
          </TabsTrigger>
          <TabsTrigger value="privacy-notices" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <FileText className="w-4 h-4 flex-shrink-0" /><span>Privacy Notices</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-yellow-500/10 data-[state=active]:text-yellow-600 dark:data-[state=active]:text-yellow-400 data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <Zap className="w-4 h-4 flex-shrink-0" /><span>Notifications & Risk</span>
          </TabsTrigger>
          <TabsTrigger value="authorisations" className="min-w-[13rem] rounded-2xl px-4 py-3 text-sm font-medium data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center gap-2 transition-all" role="tab">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" /><span>Authorisations</span>
          </TabsTrigger>
          <TabsTrigger value="adm" className="min-w-[12rem] rounded-2xl px-4 py-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />ADM Register
          </TabsTrigger>
          <TabsTrigger value="security-dpa" className="min-w-[12rem] rounded-2xl px-4 py-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />Security & DPAs
          </TabsTrigger>
          <TabsTrigger value="representations" className="min-w-[12rem] rounded-2xl px-4 py-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />Representations
          </TabsTrigger>
          <TabsTrigger value="codes" className="min-w-[12rem] rounded-2xl px-4 py-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2">
            <Scale className="w-3.5 h-3.5" />Codes of Conduct
          </TabsTrigger>
          <TabsTrigger value="accountability" className="min-w-[12rem] rounded-2xl px-4 py-3 text-xs font-medium data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 flex items-center gap-2 border border-cyan-500/20">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />Accountability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="controllers" className="mt-5"><ControllersTab /></TabsContent>
        <TabsContent value="ropa" className="mt-5"><RopaTab /></TabsContent>
        <TabsContent value="breaches" className="mt-5"><BreachTab /></TabsContent>
        <TabsContent value="dsr" className="mt-5"><DsrTab /></TabsContent>
        <TabsContent value="dpo" className="mt-5"><DpoTab /></TabsContent>
        <TabsContent value="data-discovery" className="mt-5"><DpoDataDiscoveryPage /></TabsContent>
        <TabsContent value="consent" className="mt-5"><ConsentPatientTab /></TabsContent>
        <TabsContent value="transfers" className="mt-5"><TransferTab /></TabsContent>
        <TabsContent value="whistleblowing" className="mt-5"><WhistleblowerNoticeTab /></TabsContent>
        <TabsContent value="processor-instructions" className="mt-5"><ProcessorInstructionTab /></TabsContent>
        <TabsContent value="retention-compliance" className="mt-5"><RetentionComplianceTab /></TabsContent>
        <TabsContent value="purposes" className="mt-5"><PurposeRegisterTab /></TabsContent>
        <TabsContent value="privacy-notices" className="mt-5"><PrivacyNoticeTab /></TabsContent>
        <TabsContent value="notifications" className="mt-5"><NotificationWizardTab /></TabsContent>
        <TabsContent value="authorisations" className="mt-5"><AuthorisationRequestsTab /></TabsContent>
        <TabsContent value="adm" className="mt-5"><AdmRegisterTab /></TabsContent>
        <TabsContent value="security-dpa" className="mt-5"><SecurityDpaTab /></TabsContent>
        <TabsContent value="representations" className="mt-5"><RepresentationTab /></TabsContent>
        <TabsContent value="codes" className="mt-5"><CodeOfConductSubmitTab /></TabsContent>
        <TabsContent value="dpo-config" className="mt-5"><DpoConfigTab /></TabsContent>
        {showDpoIntegrationsTab && <TabsContent value="integrations" className="mt-5"><DpoIntegrationsTab /></TabsContent>}
        <TabsContent value="accountability" className="mt-5"><AccountabilityDashboardTab /></TabsContent>
      </Tabs>

    </div>
  );
}
