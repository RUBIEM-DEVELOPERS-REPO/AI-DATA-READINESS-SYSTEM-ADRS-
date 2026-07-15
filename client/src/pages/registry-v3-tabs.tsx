/**
 * DPO Portal — Extended Compliance Tabs (v3)
 * Covers: Privacy Notice Builder (ss.15-16), Processing Notification 14-point wizard (ss.20-22),
 *         Authorisation Requests (s.22), Accountability Dashboard (s.24), ADM Register (s.25),
 *         Security Controls & DPAs (s.18), Representation Module (ss.26-27),
 *         Code of Conduct Submission (s.30)
 */
import { useState } from "react";
import { useQuery, useMutation, UseQueryOptions } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInDays } from "date-fns";
import {
  FileText, Plus, CheckCircle, XCircle, Clock, Shield, AlertTriangle, Globe,
  Users, Lock, BookOpen, Scale, Cpu, Building2, FileWarning, RotateCcw,
  ChevronRight, Eye, Activity, BarChart3, Gavel, MapPin, AlertCircle, Zap
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  submitted: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/30",
  CONDITIONAL: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  INACTIVE: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  PLANNED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  IMPLEMENTED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  PARTIAL: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-red-500/10 text-red-400 border-red-500/30",
};

// ─── Privacy Notice Builder (ss.15-16) ───────────────────────────────────────
export function PrivacyNoticeTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "", controllerIdentity: "", purposes: "", dataCategories: "", legalBases: "",
    thirdPartyDisclosures: "", dataSubjectRights: "", retentionSummary: "", contactDpo: "",
    disproportionateEffort: false, disproportionateReason: ""
  });
  const { data: notices = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/privacy-notices"],
    queryFn: () => apiRequest("GET", "/api/registry/privacy-notices").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/privacy-notices", {
      ...form,
      purposes: form.purposes.split(",").map(s => s.trim()).filter(Boolean),
      dataCategories: form.dataCategories.split(",").map(s => s.trim()).filter(Boolean),
      legalBases: form.legalBases.split(",").map(s => s.trim()).filter(Boolean),
    }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Privacy Notice saved" });
      setCreating(false);
      setForm({ title: "", controllerIdentity: "", purposes: "", dataCategories: "", legalBases: "", thirdPartyDisclosures: "", dataSubjectRights: "", retentionSummary: "", contactDpo: "", disproportionateEffort: false, disproportionateReason: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/privacy-notices"] });
    },
  });
  const publishMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/privacy-notices/${id}/publish`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Notice published" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/privacy-notices"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><FileText className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Privacy Notice Builder</h2><p className="text-xs text-muted-foreground">Auto-populate required s.15/s.16 disclosure fields.</p></div>
        </div>
        <Button id="create-privacy-notice-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "New Notice"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20">
          <CardHeader><CardTitle className="text-sm font-semibold">New Privacy Notice</CardTitle><CardDescription className="text-xs">Required fields per s.15–16 CDPA.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Title</Label><input id="pn-title" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Employee Data Notice" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Controller Identity (s.15(1)(a))</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Organisation name & address" value={form.controllerIdentity} onChange={e => setForm(f => ({ ...f, controllerIdentity: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Purpose(s) (comma-separated)</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Payroll, HR management" value={form.purposes} onChange={e => setForm(f => ({ ...f, purposes: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Data Categories (comma-separated)</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Name, ID number, salary" value={form.dataCategories} onChange={e => setForm(f => ({ ...f, dataCategories: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Legal Bases</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Contract, Legal obligation" value={form.legalBases} onChange={e => setForm(f => ({ ...f, legalBases: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">DPO Contact</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="dpo@org.zw" value={form.contactDpo} onChange={e => setForm(f => ({ ...f, contactDpo: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Third-Party Disclosures (s.15(1)(e))</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" placeholder="Who receives data, and under what safeguards" value={form.thirdPartyDisclosures} onChange={e => setForm(f => ({ ...f, thirdPartyDisclosures: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Data Subject Rights (s.14)</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" placeholder="How data subjects can exercise their rights" value={form.dataSubjectRights} onChange={e => setForm(f => ({ ...f, dataSubjectRights: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Retention Summary</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. 7 years post-employment" value={form.retentionSummary} onChange={e => setForm(f => ({ ...f, retentionSummary: e.target.value }))} /></div>
            <div className="flex items-center gap-2 pt-1"><input id="pn-disproportionate" type="checkbox" checked={form.disproportionateEffort} onChange={e => setForm(f => ({ ...f, disproportionateEffort: e.target.checked }))} className="w-4 h-4" /><Label htmlFor="pn-disproportionate" className="text-xs">Disproportionate effort exemption applies (s.16(2))</Label></div>
            {form.disproportionateEffort && <div className="space-y-1.5"><Label className="text-xs">Justification for exemption</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" value={form.disproportionateReason} onChange={e => setForm(f => ({ ...f, disproportionateReason: e.target.value }))} /></div>}
            <Button id="save-privacy-notice-btn" size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.title || !form.controllerIdentity || createMut.isPending}><CheckCircle className="w-3.5 h-3.5 mr-1" />Save Notice</Button>
          </CardContent>
        </Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : notices.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No privacy notices created yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{notices.map((n: any) => (
          <Card key={n.id} className="bg-card/60 border-border/40">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{n.title}</p><Badge variant="outline" className={`text-xs ${STATUS_COLORS[n.status] ?? ""}`}>{n.status}</Badge>{n.disproportionate_effort && <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">s.16(2) exempt</Badge>}</div>
                <p className="text-xs text-muted-foreground">{n.controller_identity}</p>
                {n.published_at && <p className="text-xs text-muted-foreground">Published {format(new Date(n.published_at), "dd MMM yyyy")}</p>}
              </div>
              {n.status === "draft" && <Button id={`publish-notice-${n.id}`} size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40 text-emerald-400 shrink-0" onClick={() => publishMut.mutate(n.id)}>Publish</Button>}
            </CardContent>
          </Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── Processing Notification 14-point Wizard (ss.20-22) ──────────────────────
export function NotificationWizardTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", legalBasis: "", purposes: "", dataCategories: "", sensitiveDataDescription: "",
    dataSubjectCategories: "", thirdPartySafeguards: "", dataSubjectInfoMethod: "",
    relatedProcessing: "", retentionPeriod: "", securitySelfAssessment: "", processorDetails: "",
    crossBorderPlans: ""
  });
  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/notifications"],
    queryFn: () => apiRequest("GET", "/api/registry/notifications").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/notifications", {
      ...form,
      purposes: form.purposes.split(",").map(s => s.trim()).filter(Boolean),
      dataCategories: form.dataCategories.split(",").map(s => s.trim()).filter(Boolean),
      dataSubjectCategories: form.dataSubjectCategories.split(",").map(s => s.trim()).filter(Boolean),
    }).then(r => r.json()),
    onSuccess: (d: any) => {
      toast({ title: "Notification created", description: `Risk: ${d.riskLevel}${d.authRequestCreated ? " — Authorisation Request auto-created" : ""}` });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/registry/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/authorisation-requests"] });
    },
  });
  const submitMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/notifications/${id}/submit`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Notification submitted to Authority" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/notifications"] }); },
  });

  const RISK_COLORS = { LOW: "text-emerald-400", MEDIUM: "text-yellow-400", HIGH: "text-red-400" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><BookOpen className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Processing Notifications</h2><p className="text-xs text-muted-foreground">14-point checklist per ss.20-22 CDPA. High-risk routes to Authorisation Request.</p></div>
        </div>
        <Button id="create-notification-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "New Notification"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20">
          <CardHeader><CardTitle className="text-sm font-semibold">New Processing Notification — 14 Data Points</CardTitle><CardDescription className="text-xs">Risk score calculated from sensitivity, volume, and cross-border flag. HIGH risk auto-creates an Authorisation Request.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "1. Processing Name", key: "name", ph: "e.g. Customer Analytics" },
                { label: "2. Legal Basis", key: "legalBasis", ph: "e.g. Consent (s.10), Contract" },
                { label: "3. Purpose(s) (comma-sep)", key: "purposes", ph: "Analytics, Marketing" },
                { label: "4. Data Categories (comma-sep)", key: "dataCategories", ph: "Name, Email, Health data" },
                { label: "5. Sensitive Data Description", key: "sensitiveDataDescription", ph: "Describe sensitive data if any" },
                { label: "6. Data Subject Categories (comma-sep)", key: "dataSubjectCategories", ph: "Customers, Employees" },
                { label: "7. Third-Party Safeguards", key: "thirdPartySafeguards", ph: "DPAs in place, SCCs" },
                { label: "8. Data Subject Info Method", key: "dataSubjectInfoMethod", ph: "Privacy notice on website" },
                { label: "9. Related/Linked Processing", key: "relatedProcessing", ph: "Linked to CRM system" },
                { label: "10. Retention Period", key: "retentionPeriod", ph: "3 years from collection" },
                { label: "11. Security Self-Assessment", key: "securitySelfAssessment", ph: "ISO 27001 certified, encryption at rest" },
                { label: "12. Processor Details", key: "processorDetails", ph: "AWS (processor), DPA signed 2024" },
                { label: "13. Cross-Border Transfer Plans", key: "crossBorderPlans", ph: "South Africa — adequate; UK — SCCs" },
              ].map(({ label, key, ph }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder={ph} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <Button id="create-notification-submit-btn" size="sm" className="w-full mt-2" onClick={() => createMut.mutate()} disabled={!form.name || !form.legalBasis || !form.retentionPeriod || createMut.isPending}><Zap className="w-3.5 h-3.5 mr-1" />Save & Calculate Risk</Button>
          </CardContent>
        </Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : notifications.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No notifications created yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{notifications.map((n: any) => (
          <Card key={n.id} className="bg-card/60 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-sm">{n.name}</p>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[n.status] ?? ""}`}>{n.status}</Badge>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[n.risk_level ?? "LOW"] ?? ""}`}>Risk: {n.risk_level} ({n.risk_score})</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Legal Basis: {n.legal_basis} · Retention: {n.retention_period}</p>
                  {n.submitted_at && <p className="text-xs text-muted-foreground">Submitted {format(new Date(n.submitted_at), "dd MMM yyyy HH:mm")}</p>}
                </div>
                {n.status === "draft" && <Button id={`submit-notification-${n.id}`} size="sm" variant="outline" className="text-xs h-7 shrink-0 border-primary/40" onClick={() => submitMut.mutate(n.id)}>Submit to Authority</Button>}
              </div>
            </CardContent>
          </Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── Authorisation Requests (s.22) ───────────────────────────────────────────
export function AuthorisationRequestsTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ processingName: "", riskAssessment: { dataVolume: "", crossBorder: false, specialCategory: false, automatedDecisions: false, vulnerableSubjects: false, additionalNotes: "" } });
  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/authorisation-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/authorisation-requests").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/authorisation-requests", form).then(r => r.json()),
    onSuccess: () => { toast({ title: "Authorisation Request submitted" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/authorisation-requests"] }); },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Shield className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Authorisation Requests</h2><p className="text-xs text-muted-foreground">High-risk processing requires prior Authority authorisation (s.22).</p></div>
        </div>
        <Button id="create-auth-request-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "New Request"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Processing Activity Name</Label><input id="auth-processing-name" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.processingName} onChange={e => setForm(f => ({ ...f, processingName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Estimated Data Volume</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. 50,000 data subjects" value={form.riskAssessment.dataVolume} onChange={e => setForm(f => ({ ...f, riskAssessment: { ...f.riskAssessment, dataVolume: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "crossBorder", label: "Cross-border transfer" },
                { key: "specialCategory", label: "Special category data" },
                { key: "automatedDecisions", label: "Automated decisions" },
                { key: "vulnerableSubjects", label: "Vulnerable data subjects" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={(form.riskAssessment as any)[key]} onChange={e => setForm(f => ({ ...f, riskAssessment: { ...f.riskAssessment, [key]: e.target.checked } }))} className="w-3.5 h-3.5" />{label}
                </label>
              ))}
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Additional Risk Notes</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" value={form.riskAssessment.additionalNotes} onChange={e => setForm(f => ({ ...f, riskAssessment: { ...f.riskAssessment, additionalNotes: e.target.value } }))} /></div>
            <Button id="submit-auth-request-btn" size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.processingName || createMut.isPending}>Submit to Authority</Button>
          </CardContent>
        </Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : requests.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No authorisation requests.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{requests.map((r: any) => (
          <Card key={r.id} className="bg-card/60 border-border/40"><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{r.processing_name}</p><Badge variant="outline" className={`text-xs ${STATUS_COLORS[r.decision ?? "PENDING"] ?? ""}`}>{r.decision ?? "PENDING"}</Badge></div>
                {r.conditions && <p className="text-xs text-muted-foreground">Conditions: {r.conditions}</p>}
                {r.decided_at && <p className="text-xs text-muted-foreground">Decided {format(new Date(r.decided_at), "dd MMM yyyy")}</p>}
              </div>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── ADM Register (s.25) ─────────────────────────────────────────────────────
export function AdmRegisterTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ systemName: "", description: "", legalBasis: "", dataCategories: "", outputType: "", humanReviewAvailable: true, optOutMechanism: "" });
  const { data: systems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/adm-systems"],
    queryFn: () => apiRequest("GET", "/api/registry/adm-systems").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/adm-systems", { ...form, dataCategories: form.dataCategories.split(",").map(s => s.trim()).filter(Boolean) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "ADM System registered" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/adm-systems"] }); },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, status }: any) => apiRequest("PATCH", `/api/registry/adm-systems/${id}`, { status }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Status updated" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/adm-systems"] }); },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Cpu className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Automated Decision-Making Register</h2><p className="text-xs text-muted-foreground">Register ADM systems used by your organisation (s.25 CDPA).</p></div>
        </div>
        <Button id="create-adm-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "Register System"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">System Name</Label><input id="adm-name" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Credit Scoring Engine" value={form.systemName} onChange={e => setForm(f => ({ ...f, systemName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Legal Basis</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Explicit consent (s.10)" value={form.legalBasis} onChange={e => setForm(f => ({ ...f, legalBasis: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Data Categories Used</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Transaction history, Credit score" value={form.dataCategories} onChange={e => setForm(f => ({ ...f, dataCategories: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Output Type</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Loan approval/rejection" value={form.outputType} onChange={e => setForm(f => ({ ...f, outputType: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.humanReviewAvailable} onChange={e => setForm(f => ({ ...f, humanReviewAvailable: e.target.checked }))} className="w-3.5 h-3.5" />Human review available (s.25)</label>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Opt-Out Mechanism</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Email dpo@org.zw to request review" value={form.optOutMechanism} onChange={e => setForm(f => ({ ...f, optOutMechanism: e.target.value }))} /></div>
          <Button id="save-adm-btn" size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.systemName || !form.legalBasis || createMut.isPending}>Register System</Button>
        </CardContent></Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : systems.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Cpu className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No ADM systems registered.</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{systems.map((s: any) => (
          <Card key={s.id} className="bg-card/60 border-border/40"><CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div><div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{s.system_name}</p><Badge variant="outline" className={`text-xs ${STATUS_COLORS[s.status] ?? ""}`}>{s.status}</Badge></div>
                <p className="text-xs text-muted-foreground">Basis: {s.legal_basis}</p>
                {s.output_type && <p className="text-xs text-muted-foreground">Output: {s.output_type}</p>}
                <div className="flex items-center gap-1 mt-1">{s.human_review_available ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}<span className="text-xs text-muted-foreground">Human review {s.human_review_available ? "available" : "not available"}</span></div>
              </div>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2 text-muted-foreground shrink-0" onClick={() => toggleMut.mutate({ id: s.id, status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{s.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── Security Controls & DPAs (s.18) ────────────────────────────────────────
export function SecurityDpaTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"controls" | "dpas">("controls");
  const [creatingCtrl, setCreatingCtrl] = useState(false);
  const [creatingDpa, setCreatingDpa] = useState(false);
  const [ctrl, setCtrl] = useState({ controlRef: "", controlName: "", category: "TECHNICAL", description: "", implementationStatus: "PLANNED", nextReviewAt: "" });
  const [dpa, setDpa] = useState({ processorName: "", processorContact: "", dpaType: "STANDARD", signedAt: "", expiresAt: "", notes: "" });

  const { data: controls = [], isLoading: loadC } = useQuery<any[]>({ queryKey: ["/api/registry/security-controls"], queryFn: () => apiRequest("GET", "/api/registry/security-controls").then(r => r.json()) });
  const { data: dpas = [], isLoading: loadD } = useQuery<any[]>({ queryKey: ["/api/registry/dpas"], queryFn: () => apiRequest("GET", "/api/registry/dpas").then(r => r.json()) });

  const createCtrlMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/security-controls", ctrl).then(r => r.json()),
    onSuccess: () => { toast({ title: "Control registered" }); setCreatingCtrl(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/security-controls"] }); },
  });
  const createDpaMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/dpas", dpa).then(r => r.json()),
    onSuccess: () => { toast({ title: "DPA created" }); setCreatingDpa(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/dpas"] }); },
  });
  const updateCtrlMut = useMutation({
    mutationFn: ({ id, status }: any) => apiRequest("PATCH", `/api/registry/security-controls/${id}`, { implementationStatus: status }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Control updated" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/security-controls"] }); },
  });

  const CTRL_STATUS_COLORS: Record<string, string> = { PLANNED: "text-yellow-400", IMPLEMENTED: "text-emerald-400", PARTIAL: "text-orange-400" };
  const categories = ["TECHNICAL", "ORGANISATIONAL", "PHYSICAL", "LEGAL"];
  const statuses = ["PLANNED", "PARTIAL", "IMPLEMENTED"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Lock className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Security Controls & Data Processing Agreements</h2><p className="text-xs text-muted-foreground">s.18 technical/organisational measures and processor DPAs.</p></div>
      </div>
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={subTab === "controls" ? "default" : "outline"} onClick={() => setSubTab("controls")} className="text-xs"><Shield className="w-3 h-3 mr-1" />Security Controls</Button>
        <Button size="sm" variant={subTab === "dpas" ? "default" : "outline"} onClick={() => setSubTab("dpas")} className="text-xs"><FileText className="w-3 h-3 mr-1" />DPAs</Button>
      </div>

      {subTab === "controls" && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button id="create-control-btn" size="sm" onClick={() => setCreatingCtrl(!creatingCtrl)}><Plus className="w-3.5 h-3.5 mr-1" />{creatingCtrl ? "Cancel" : "Add Control"}</Button></div>
          {creatingCtrl && (
            <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Control Ref</Label><input id="ctrl-ref" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="ISO-A.8.1" value={ctrl.controlRef} onChange={e => setCtrl(c => ({ ...c, controlRef: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Control Name</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Encryption at rest" value={ctrl.controlName} onChange={e => setCtrl(c => ({ ...c, controlName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Category</Label><select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={ctrl.category} onChange={e => setCtrl(c => ({ ...c, category: e.target.value }))}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="space-y-1.5"><Label className="text-xs">Status</Label><select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={ctrl.implementationStatus} onChange={e => setCtrl(c => ({ ...c, implementationStatus: e.target.value }))}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="space-y-1.5"><Label className="text-xs">Next Review Date</Label><input type="date" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={ctrl.nextReviewAt} onChange={e => setCtrl(c => ({ ...c, nextReviewAt: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={ctrl.description} onChange={e => setCtrl(c => ({ ...c, description: e.target.value }))} /></div>
              <Button size="sm" className="w-full" onClick={() => createCtrlMut.mutate()} disabled={!ctrl.controlRef || !ctrl.controlName || createCtrlMut.isPending}>Add Control</Button>
            </CardContent></Card>
          )}
          {loadC ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : controls.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Lock className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No security controls registered.</p></CardContent></Card>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-border/30"><th className="text-left p-2 text-muted-foreground">Ref</th><th className="text-left p-2 text-muted-foreground">Control</th><th className="text-left p-2 text-muted-foreground">Category</th><th className="text-left p-2 text-muted-foreground">Status</th><th className="p-2"></th></tr></thead>
              <tbody>{controls.map((c: any) => (
                <tr key={c.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="p-2 font-mono text-muted-foreground">{c.control_ref}</td>
                  <td className="p-2 font-medium">{c.control_name}</td>
                  <td className="p-2 text-muted-foreground">{c.category}</td>
                  <td className="p-2"><span className={`font-medium ${CTRL_STATUS_COLORS[c.implementation_status] ?? ""}`}>{c.implementation_status}</span></td>
                  <td className="p-2">
                    <select className="text-xs bg-muted/30 border border-border/40 rounded px-1.5 py-0.5" value={c.implementation_status} onChange={e => updateCtrlMut.mutate({ id: c.id, status: e.target.value })}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
      {subTab === "dpas" && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button id="create-dpa-btn" size="sm" onClick={() => setCreatingDpa(!creatingDpa)}><Plus className="w-3.5 h-3.5 mr-1" />{creatingDpa ? "Cancel" : "Add DPA"}</Button></div>
          {creatingDpa && (
            <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Processor Name</Label><input id="dpa-processor" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. AWS Africa" value={dpa.processorName} onChange={e => setDpa(d => ({ ...d, processorName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Processor Contact</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="privacy@aws.com" value={dpa.processorContact} onChange={e => setDpa(d => ({ ...d, processorContact: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Signed Date</Label><input type="date" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={dpa.signedAt} onChange={e => setDpa(d => ({ ...d, signedAt: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Expiry Date</Label><input type="date" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={dpa.expiresAt} onChange={e => setDpa(d => ({ ...d, expiresAt: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Notes</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={dpa.notes} onChange={e => setDpa(d => ({ ...d, notes: e.target.value }))} /></div>
              <Button size="sm" className="w-full" onClick={() => createDpaMut.mutate()} disabled={!dpa.processorName || createDpaMut.isPending}>Save DPA</Button>
            </CardContent></Card>
          )}
          {loadD ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : dpas.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No DPAs on record. Processors cannot be engaged without a signed DPA (s.18(5)).</p></CardContent></Card>
          ) : (
            <div className="space-y-2">{dpas.map((d: any) => {
              const isExpired = d.expires_at && new Date(d.expires_at) < new Date();
              const isExpiringSoon = d.expires_at && !isExpired && differenceInDays(new Date(d.expires_at), new Date()) < 30;
              return (
                <Card key={d.id} className={`bg-card/60 border-border/40 ${isExpired ? "border-red-500/40 bg-red-500/5" : isExpiringSoon ? "border-yellow-500/40 bg-yellow-500/5" : ""}`}><CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{d.processor_name}</p>
                      {isExpired && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30">RENEWAL PAST DUE</Badge>}
                      {isExpiringSoon && <Badge variant="outline" className="text-[9px] bg-yellow-500/10 text-yellow-400 border-yellow-500/30">RENEWAL REQUIRED</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {d.signed_at && <span className="text-xs text-muted-foreground">Signed {format(new Date(d.signed_at), "dd MMM yyyy")}</span>}
                      {d.expires_at && <span className={`text-xs ${isExpired ? "text-red-400 font-semibold" : isExpiringSoon ? "text-yellow-400" : "text-muted-foreground"}`}>{isExpired ? "EXPIRED" : isExpiringSoon ? "Expiring soon" : "Expires"} {format(new Date(d.expires_at), "dd MMM yyyy")}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs ${isExpired ? "bg-red-500/10 text-red-400 border-red-500/30" : isExpiringSoon ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : STATUS_COLORS[d.status] ?? ""}`}>{isExpired ? "EXPIRED" : isExpiringSoon ? "EXPIRING" : d.status}</Badge>
                </CardContent></Card>
              );
            })}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Representation Module (ss.26-27) ────────────────────────────────────────
export function RepresentationTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ representationType: "CHILD_GUARDIAN", dataSubjectName: "", dataSubjectDob: "", representativeName: "", representativeEmail: "", representativeType: "PARENT", relationship: "", notes: "" });
  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/representations"],
    queryFn: () => apiRequest("GET", "/api/registry/representations").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/representations", form).then(r => r.json()),
    onSuccess: () => { toast({ title: "Representation record created" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/representations"] }); },
  });
  const verifyMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/representations/${id}/verify`).then(r => r.json()),
    onSuccess: () => { toast({ title: "Record verified" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/representations"] }); },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Users className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Representation Records</h2><p className="text-xs text-muted-foreground">Child (s.26) guardian verification and incapacitated person (s.27) legal representative records.</p></div>
        </div>
        <Button id="create-representation-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "Add Record"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Representation Type</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.representationType} onChange={e => setForm(f => ({ ...f, representationType: e.target.value }))}>
                <option value="CHILD_GUARDIAN">Child — Guardian/Parent (s.26)</option>
                <option value="INCAPACITATED_LEGAL_REP">Incapacitated — Legal Representative (s.27)</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Representative Type</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.representativeType} onChange={e => setForm(f => ({ ...f, representativeType: e.target.value }))}>
                <option value="PARENT">Parent</option><option value="GUARDIAN">Legal Guardian</option><option value="LEGAL_REP">Court-appointed Representative</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Data Subject Name</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.dataSubjectName} onChange={e => setForm(f => ({ ...f, dataSubjectName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Data Subject Date of Birth</Label><input type="date" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.dataSubjectDob} onChange={e => setForm(f => ({ ...f, dataSubjectDob: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Representative Name</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.representativeName} onChange={e => setForm(f => ({ ...f, representativeName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Representative Email</Label><input type="email" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.representativeEmail} onChange={e => setForm(f => ({ ...f, representativeEmail: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Relationship</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Mother, Court-appointed" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Notes (proof of authority description)</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <Button size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.dataSubjectName || !form.representativeName || createMut.isPending}>Create Record</Button>
        </CardContent></Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : records.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No representation records.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{records.map((r: any) => (
          <Card key={r.id} className="bg-card/60 border-border/40"><CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{r.data_subject_name}</p>
                <Badge variant="outline" className={`text-xs ${r.verification_status === "VERIFIED" ? STATUS_COLORS.APPROVED : STATUS_COLORS.PENDING}`}>{r.verification_status}</Badge>
                <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-400 border-slate-500/30">{r.representation_type === "CHILD_GUARDIAN" ? "Child s.26" : "Incapacitated s.27"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Rep: {r.representative_name} ({r.representative_type})</p>
              {r.relationship && <p className="text-xs text-muted-foreground">Relationship: {r.relationship}</p>}
            </div>
            {r.verification_status === "PENDING" && <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40 text-emerald-400 shrink-0" onClick={() => verifyMut.mutate(r.id)}>Verify</Button>}
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── Code of Conduct Submission (s.30) ───────────────────────────────────────
export function CodeOfConductSubmitTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ submittingOrgName: "", title: "", description: "", documentUri: "" });
  const { data: codes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/codes-of-conduct"],
    queryFn: () => apiRequest("GET", "/api/registry/codes-of-conduct").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/codes-of-conduct", form).then(r => r.json()),
    onSuccess: () => { toast({ title: "Code of Conduct submitted" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/codes-of-conduct"] }); },
  });
  const CODE_STATUS: Record<string, string> = {
    SUBMITTED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    UNDER_REVIEW: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    REJECTED: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><BookOpen className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Code of Conduct Submission</h2><p className="text-xs text-muted-foreground">Submit codes of conduct to the Authority for review and approval (s.30 CDPA).</p></div>
        </div>
        <Button id="submit-code-btn" size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "Submit Code"}</Button>
      </div>
      {creating && (
        <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Submitting Organisation</Label><input id="code-org" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.submittingOrgName} onChange={e => setForm(f => ({ ...f, submittingOrgName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Code Title</Label><input id="code-title" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. FinTech Industry Privacy Code" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-20 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Document URL (optional)</Label><input type="url" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="https://..." value={form.documentUri} onChange={e => setForm(f => ({ ...f, documentUri: e.target.value }))} /></div>
          <Button size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.title || !form.submittingOrgName || createMut.isPending}>Submit to Authority</Button>
        </CardContent></Card>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : codes.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No codes of conduct submitted.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{codes.map((c: any) => (
          <Card key={c.id} className="bg-card/60 border-border/40"><CardContent className="p-4 flex items-center justify-between">
            <div><div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{c.title}</p><Badge variant="outline" className={`text-xs ${CODE_STATUS[c.status] ?? ""}`}>{c.status}</Badge></div>
              <p className="text-xs text-muted-foreground">{c.submitting_org_name}</p>
              {c.decided_at && <p className="text-xs text-muted-foreground">Decided {format(new Date(c.decided_at), "dd MMM yyyy")}</p>}
              {c.rejection_reason && <p className="text-xs text-red-400 mt-1">Reason: {c.rejection_reason}</p>}
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── Accountability Dashboard (s.24) ─────────────────────────────────────────
export function AccountabilityDashboardTab() {
  const { toast } = useToast();

  const { data: dsrs = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/dsr-requests"],
    queryFn: () => apiRequest("GET", "/api/registry/dsr-requests").then(r => r.json()),
  });
  const { data: consents = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/consents"],
    queryFn: () => apiRequest("GET", "/api/registry/consents").then(r => r.json()),
  });
  const { data: breaches = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/breaches"],
    queryFn: () => apiRequest("GET", "/api/registry/breaches").then(r => r.json()),
  });
  const { data: dpas = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/dpas"],
    queryFn: () => apiRequest("GET", "/api/registry/dpas").then(r => r.json()),
  });
  const { data: ropas = [] } = useQuery<any[]>({
    queryKey: ["/api/registry/processing-records"],
    queryFn: () => apiRequest("GET", "/api/registry/processing-records").then(r => r.json()),
  });

  // Calculate Metrics
  const openDsrs = dsrs.filter((d: any) => d.status !== "COMPLETED");
  const overdueDsrs = dsrs.filter((d: any) => {
    if (d.status === "COMPLETED") return false;
    return new Date(d.deadline) < new Date();
  });
  const dsrSlaPercent = dsrs.length ? Math.round(((dsrs.length - overdueDsrs.length) / dsrs.length) * 100) : 100;

  const consentWithdrawn = consents.filter((c: any) => c.withdrawnAt).length;
  const activeConsentPercent = consents.length ? Math.round(((consents.length - consentWithdrawn) / consents.length) * 100) : 100;

  // s.19 breach deadline: must be reported within 24 hours of detection
  const lateBreaches = breaches.filter((b: any) => {
    if (!b.detectedAt || !b.reportedAt) return false;
    const hours = (new Date(b.reportedAt).getTime() - new Date(b.detectedAt).getTime()) / (1000 * 60 * 60);
    return hours > 24;
  });
  const breachSlaPercent = breaches.length ? Math.round(((breaches.length - lateBreaches.length) / breaches.length) * 100) : 100;

  const dpaCoveragePercent = ropas.length ? Math.round((dpas.length / ropas.length) * 100) : 100;

  const downloadEvidencePack = () => {
    const pack = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDsrRequests: dsrs.length,
        dsrSlaComplianceRate: `${dsrSlaPercent}%`,
        totalConsentRecords: consents.length,
        activeConsentRate: `${activeConsentPercent}%`,
        totalBreachesReported: breaches.length,
        breach24hSlaComplianceRate: `${breachSlaPercent}%`,
        totalDpasOnRecord: dpas.length,
        ropaRecordsCount: ropas.length,
      },
      dsrs,
      consents,
      breaches,
      dpas,
      ropas,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cdpa-evidence-pack-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Evidence Pack Exported", description: "All compliance data downloaded as a CDPA audit package." });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20"><BarChart3 className="w-5 h-5 text-cyan-400" /></div>
          <div><h2 className="text-lg font-bold">Accountability Dashboard</h2><p className="text-xs text-muted-foreground">Monitor s.24 compliance targets, SLAs, and export evidence packages.</p></div>
        </div>
        <Button id="export-evidence-btn" size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={downloadEvidencePack}><Zap className="w-3.5 h-3.5 mr-1" />Export Evidence Pack</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">DSRR SLA Rate</p>
            <div className="flex items-baseline justify-between"><h3 className="text-2xl font-bold text-foreground">{dsrSlaPercent}%</h3><Badge variant="outline" className={dsrSlaPercent > 80 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}>SLA: 30d</Badge></div>
            <p className="text-[10px] text-muted-foreground">{openDsrs.length} active requests ({overdueDsrs.length} overdue)</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">Active Consents</p>
            <div className="flex items-baseline justify-between"><h3 className="text-2xl font-bold text-foreground">{activeConsentPercent}%</h3><Badge variant="outline" className="bg-blue-500/10 text-blue-400">Consent Tiered</Badge></div>
            <p className="text-[10px] text-muted-foreground">{consents.length - consentWithdrawn} active / {consentWithdrawn} withdrawn</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">Breach 24h SLA</p>
            <div className="flex items-baseline justify-between"><h3 className="text-2xl font-bold text-foreground">{breachSlaPercent}%</h3><Badge variant="outline" className="bg-amber-500/10 text-amber-400">s.19 24h</Badge></div>
            <p className="text-[10px] text-muted-foreground">{lateBreaches.length} reported late / {breaches.length} total</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">DPA Coverage</p>
            <div className="flex items-baseline justify-between"><h3 className="text-2xl font-bold text-foreground">{dpaCoveragePercent}%</h3><Badge variant="outline" className="bg-cyan-500/10 text-cyan-400">Processors</Badge></div>
            <p className="text-[10px] text-muted-foreground">{dpas.length} DPAs on file / {ropas.length} processing activities</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/40 border-border/30">
        <CardHeader><CardTitle className="text-sm font-semibold">Evidence Packaging Information</CardTitle><CardDescription className="text-xs">Export matches CDPA Section 24 compliance audit standards, generating verification schemas for registered data protection officers (DPOs).</CardDescription></CardHeader>
        <CardContent className="text-xs space-y-2 text-muted-foreground">
          <p>✔ Comprehensive logs of DSR transactions and withdrawal histories.</p>
          <p>✔ Timestamps validating s.19 breach reporting response clocks.</p>
          <p>✔ Active registers of standard third-party DPAs and security controls.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── GAP 1: Processor Instruction Log (s.17) ──────────────────────────────────
export function ProcessorInstructionTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ processorName: "", processorContact: "", instructionTitle: "", instructionDetails: "", lawfulBasis: "CONTRACT", dataCategories: "", processingPermitted: "" });
  const { data: instructions = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/processor-instructions"], queryFn: () => apiRequest("GET", "/api/registry/processor-instructions").then(r => r.json()) });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/processor-instructions", { ...form, dataCategories: form.dataCategories.split(",").map((s: string) => s.trim()), processingPermitted: form.processingPermitted.split(",").map((s: string) => s.trim()) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Instruction Issued" }); setForm({ processorName: "", processorContact: "", instructionTitle: "", instructionDetails: "", lawfulBasis: "CONTRACT", dataCategories: "", processingPermitted: "" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/processor-instructions"] }); },
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/processor-instructions/${id}/revoke`, {}).then(r => r.json()),
    onSuccess: () => { toast({ title: "Instruction Revoked", variant: "destructive" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/processor-instructions"] }); },
  });
  const ackMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/processor-instructions/${id}/acknowledge`, {}).then(r => r.json()),
    onSuccess: () => { toast({ title: "Acknowledged" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/processor-instructions"] }); },
  });
  const STATUS_C: Record<string, string> = { ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", ACKNOWLEDGED: "bg-blue-500/10 text-blue-400 border-blue-500/30", REVOKED: "bg-red-500/10 text-red-400 border-red-500/30" };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Building2 className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Processor Instruction Log</h2><p className="text-xs text-muted-foreground">s.17 CDPA — A processor may only act on documented controller instructions. Every instruction is immutably logged.</p></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">Issue New Instruction</CardTitle><CardDescription className="text-xs">Processor cannot begin processing without a linked active instruction record.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {[{ label: "Processor Name *", key: "processorName", ph: "Acme Data Ltd" }, { label: "Processor Contact Email", key: "processorContact", ph: "dpo@acme.com" }, { label: "Instruction Title *", key: "instructionTitle", ph: "Monthly analytics processing" }, { label: "Data Categories (comma-sep)", key: "dataCategories", ph: "email, IP address" }, { label: "Processing Permitted (comma-sep)", key: "processingPermitted", ph: "aggregate, anonymise" }].map(f => (
              <div key={f.key} className="space-y-1.5"><Label className="text-xs">{f.label}</Label><input id={`pi-${f.key}`} className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder={f.ph} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} /></div>
            ))}
            <div className="space-y-1.5"><Label className="text-xs">Instruction Details *</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-20 resize-none" placeholder="Describe exactly what processing is authorised…" value={form.instructionDetails} onChange={e => setForm(p => ({ ...p, instructionDetails: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Lawful Basis</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.lawfulBasis} onChange={e => setForm(p => ({ ...p, lawfulBasis: e.target.value }))}>
                {["CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTEREST", "PUBLIC_TASK", "LEGITIMATE_INTEREST", "CONSENT"].map(b => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <Button id="issue-instruction-btn" size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.processorName || !form.instructionTitle || !form.instructionDetails || createMut.isPending}><Plus className="w-3.5 h-3.5 mr-1" />Issue Instruction</Button>
          </CardContent>
        </Card>
        <div className="xl:col-span-3">
          {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />)}</div> : instructions.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No processor instructions issued. Under s.17, any processing without a controller instruction is unlawful.</p></CardContent></Card>
          ) : (
            <ScrollArea className="h-[520px]"><div className="space-y-3">
              {instructions.map((inst: any) => (
                <Card key={inst.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <p className="font-semibold text-sm">{inst.instruction_title}</p>
                          <Badge variant="outline" className={`text-[9px] px-1.5 ${STATUS_C[inst.status] || ""}`}>{inst.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Processor: <span className="text-foreground font-medium">{inst.processor_name}</span></p>
                        <p className="text-xs text-muted-foreground">Basis: {inst.lawful_basis} · Issued: {format(new Date(inst.issued_at), "dd MMM yyyy")}</p>
                        {inst.acknowledged_at && <p className="text-xs text-emerald-400 mt-1">Acknowledged {format(new Date(inst.acknowledged_at), "dd MMM yyyy")}</p>}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {inst.status === "ACTIVE" && <>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 border-blue-500/40 text-blue-400" onClick={() => ackMut.mutate(inst.id)}>Acknowledge</Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 border-red-500/40 text-red-400" onClick={() => revokeMut.mutate(inst.id)}>Revoke</Button>
                        </>}
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

// ─── GAP 2: Retention Clock & Compliance Checklist (ss.7, 13) ─────────────────
export function RetentionComplianceTab() {
  const { toast } = useToast();
  const [reviewId, setReviewId] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const { data: overdue = [], isLoading: loadOv } = useQuery<any[]>({ queryKey: ["/api/registry/retention-overdue"], queryFn: () => apiRequest("GET", "/api/registry/retention-overdue").then(r => r.json()) });
  const { data: checklist = [], isLoading: loadCh } = useQuery<any[]>({ queryKey: ["/api/registry/compliance-checklist"], queryFn: () => apiRequest("GET", "/api/registry/compliance-checklist").then(r => r.json()) });
  const reviewMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => apiRequest("POST", `/api/registry/processing-records/${id}/review-retention`, { newExpiryDate: date }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Retention Updated" }); setReviewId(""); setNewExpiry(""); queryClient.invalidateQueries({ queryKey: ["/api/registry/retention-overdue"] }); queryClient.invalidateQueries({ queryKey: ["/api/registry/compliance-checklist"] }); },
  });
  const score = (row: any) => {
    let s = 0;
    if (row.lawful_basis_code) s += 20;
    if (parseInt(row.consent_count) > 0) s += 20;
    if (parseInt(row.dpa_count) > 0) s += 20;
    if (parseInt(row.security_control_count) > 0) s += 20;
    if (row.last_notification_at) s += 20;
    return s;
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20"><Clock className="w-5 h-5 text-orange-400" /></div>
        <div><h2 className="text-lg font-bold">Retention & Compliance Checklist</h2><p className="text-xs text-muted-foreground">ss.7 & 13 CDPA — Data must not be retained beyond its purpose. Internal compliance mechanisms required.</p></div>
      </div>
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" />Overdue Retention Reviews ({loadOv ? "…" : overdue.length})</CardTitle><CardDescription className="text-xs">Processing activities past their retention expiry date requiring DPO action.</CardDescription></CardHeader>
        <CardContent>
          {loadOv ? <div className="h-16 bg-muted/30 rounded-xl animate-pulse" /> : overdue.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle className="w-4 h-4" />No overdue activities — all records within schedule.</div>
          ) : (
            <div className="space-y-2">
              {overdue.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-xs">
                  <div>
                    <span className="font-mono text-primary">{r.record_code}</span>
                    <span className="text-muted-foreground ml-2">{r.purpose}</span>
                    <p className="text-orange-400 mt-0.5">{r.days_overdue} days overdue · expired {format(new Date(r.retention_expiry_date), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {reviewId === r.id ? (
                      <>
                        <input type="date" className="text-xs bg-muted/30 border border-border/40 rounded px-2 py-1" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} />
                        <Button size="sm" className="h-6 text-[10px]" onClick={() => reviewMut.mutate({ id: r.id, date: newExpiry })} disabled={!newExpiry || reviewMut.isPending}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setReviewId("")}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] border-orange-500/40 text-orange-400" onClick={() => setReviewId(r.id)}>Review</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-card/40 border-border/30">
        <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" />Per-Activity Compliance Score (5 pillars)</CardTitle></CardHeader>
        <CardContent>
          {loadCh ? <div className="h-40 bg-muted/30 rounded-xl animate-pulse" /> : checklist.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No processing activities found.</p>
          ) : (
            <ScrollArea className="h-80"><div className="space-y-2">
              {checklist.map((row: any) => {
                const pct = score(row);
                return (
                  <div key={row.id} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div><span className="font-mono text-primary text-xs">{row.record_code}</span><span className="text-xs text-muted-foreground ml-2">{row.purpose}</span></div>
                      <Badge variant="outline" className={`text-[9px] ${pct >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : pct >= 50 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>{pct}%</Badge>
                    </div>
                    <div className="w-full bg-muted/40 rounded-full h-1.5 mb-2"><div className="h-1.5 rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${pct}%` }} /></div>
                    <div className="flex gap-3 flex-wrap">
                      {[{ ok: !!row.lawful_basis_code, label: "Legal Basis" }, { ok: parseInt(row.consent_count) > 0, label: "Consent" }, { ok: parseInt(row.dpa_count) > 0, label: "DPA" }, { ok: parseInt(row.security_control_count) > 0, label: "Security" }, { ok: !!row.last_notification_at, label: "Notified" }].map(c => (
                        <span key={c.label} className={`text-[9px] ${c.ok ? "text-emerald-400" : "text-red-400"}`}>{c.ok ? "✓" : "✗"} {c.label}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div></ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── GAP 3: Purpose Register & Compatibility Checker (ss.8-9) ─────────────────
export function PurposeRegisterTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ purposeName: "", purposeDescription: "", legalBasis: "CONSENT", isPrimary: true });
  const [checker, setChecker] = useState({ originalPurposeId: "", newPurposeDescription: "" });
  const [checkResult, setCheckResult] = useState<any>(null);
  const { data: purposes = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/purposes"], queryFn: () => apiRequest("GET", "/api/registry/purposes").then(r => r.json()) });
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/purposes", form).then(r => r.json()),
    onSuccess: () => { toast({ title: "Purpose Registered" }); setForm({ purposeName: "", purposeDescription: "", legalBasis: "CONSENT", isPrimary: true }); queryClient.invalidateQueries({ queryKey: ["/api/registry/purposes"] }); },
  });
  const checkMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/purposes/compatibility-check", checker).then(r => r.json()),
    onSuccess: (data: any) => setCheckResult(data),
  });
  const BASIS_LABELS: Record<string, string> = { CONSENT: "Consent (s.10)", CONTRACT: "Contract", LEGAL_OBLIGATION: "Legal Obligation", VITAL_INTEREST: "Vital Interest", PUBLIC_TASK: "Public Task", LEGITIMATE_INTEREST: "Legitimate Interest (s.10(3)(e))" };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><BookOpen className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Purpose Register & Compatibility Checker</h2><p className="text-xs text-muted-foreground">ss.8–9 CDPA — Data may only be processed for specified, explicit, legitimate purposes. Secondary use requires a compatibility assessment.</p></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Register a Purpose</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Purpose Name *</Label><input id="purpose-name" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Payroll Processing" value={form.purposeName} onChange={e => setForm(p => ({ ...p, purposeName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" placeholder="Detailed purpose description…" value={form.purposeDescription} onChange={e => setForm(p => ({ ...p, purposeDescription: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Legal Basis</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.legalBasis} onChange={e => setForm(p => ({ ...p, legalBasis: e.target.value }))}>
                  {Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={form.isPrimary} onChange={e => setForm(p => ({ ...p, isPrimary: e.target.checked }))} className="w-3.5 h-3.5" />Primary purpose (original collection intent)</label>
              <Button id="register-purpose-btn" size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.purposeName || createMut.isPending}><Plus className="w-3.5 h-3.5 mr-1" />Register Purpose</Button>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Secondary Use Compatibility Check</CardTitle><CardDescription className="text-xs">s.9(1) five-factor test: linkage · context · nature · consequences · safeguards</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Original Purpose</Label>
                <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={checker.originalPurposeId} onChange={e => setChecker(p => ({ ...p, originalPurposeId: e.target.value }))}>
                  <option value="">Select original purpose…</option>
                  {purposes.map((p: any) => <option key={p.id} value={p.id}>{p.purpose_name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Proposed Secondary Purpose</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" placeholder="Describe the proposed secondary use…" value={checker.newPurposeDescription} onChange={e => setChecker(p => ({ ...p, newPurposeDescription: e.target.value }))} /></div>
              <Button id="check-compatibility-btn" size="sm" variant="outline" className="w-full" onClick={() => checkMut.mutate()} disabled={!checker.originalPurposeId || !checker.newPurposeDescription || checkMut.isPending}>Run s.9(1) Compatibility Check</Button>
              {checkResult && (
                <div className={`p-3 rounded-lg text-xs border ${checkResult.isCompatible ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <p className={`font-bold mb-1 ${checkResult.isCompatible ? "text-emerald-400" : "text-red-400"}`}>{checkResult.isCompatible ? "✓ Compatible" : "✗ Potentially Incompatible"}</p>
                  <p className="text-muted-foreground mb-2">{checkResult.guidance}</p>
                  <p className="text-muted-foreground text-[10px]">Score: {checkResult.compatibilityScore}/100</p>
                  <div className="grid grid-cols-5 gap-1 mt-2">
                    {Object.entries(checkResult.factors || {}).map(([k, v]) => (
                      <div key={k} className="text-center"><p className="text-[9px] text-muted-foreground capitalize">{k}</p><p className="font-bold text-xs">{String(v)}</p></div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Registered Purposes ({purposes.length})</h3>
          {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />)}</div> : purposes.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-10 text-center"><BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No purposes registered yet.</p></CardContent></Card>
          ) : (
            <ScrollArea className="h-[520px]"><div className="space-y-2">
              {purposes.map((p: any) => (
                <Card key={p.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{p.purpose_name}</p>
                      {p.is_primary && <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">Primary</Badge>}
                      {!p.is_compatible_with_original && <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-400 border-orange-500/30">Needs Review</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{BASIS_LABELS[p.legal_basis] || p.legal_basis}</p>
                    {p.purpose_description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.purpose_description}</p>}
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

// ─── GAP 4: Whistleblower — Implicated-Person Notice Workflow (s.31) ──────────
export function WhistleblowerNoticeTab() {
  const { toast } = useToast();
  const [withholdId, setWithholdId] = useState("");
  const [withholdForm, setWithholdForm] = useState({ reason: "", reviewByDate: "" });
  const { data: reports = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/whistleblowing/extended"], queryFn: () => apiRequest("GET", "/api/registry/whistleblowing/extended").then(r => r.json()) });
  const notifyMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/registry/whistleblowing/${id}/notify-implicated`, {}).then(r => r.json()),
    onSuccess: () => { toast({ title: "Implicated Person Notified (s.31(3))" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/whistleblowing/extended"] }); },
  });
  const withholdMut = useMutation({
    mutationFn: ({ id, reason, reviewByDate }: any) => apiRequest("POST", `/api/registry/whistleblowing/${id}/withhold-notice`, { reason, reviewByDate }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Notice Withheld (s.31(4))", description: "Re-review date set. Justification recorded." }); setWithholdId(""); setWithholdForm({ reason: "", reviewByDate: "" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/whistleblowing/extended"] }); },
  });
  const DISC_C: Record<string, string> = { PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", DISCLOSED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", WITHHELD_EXCEPTION: "bg-red-500/10 text-red-400 border-red-500/30" };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-yellow-500/10 border border-yellow-500/20"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>
        <div><h2 className="text-lg font-bold">Whistleblower — Implicated Person Notice</h2><p className="text-xs text-muted-foreground">s.31 CDPA — Default is notify as soon as possible (s.31(3)). Withholding requires written justification and time-boxed re-review (s.31(4)).</p></div>
      </div>
      <div className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-xs flex gap-2 text-muted-foreground">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <span>Third-party access to informer/implicated-person data is blocked by default (s.31(2)(c)(vii)). Express written consent is required before any disclosure. This system never reveals informer identity without recorded consent.</span>
      </div>
      {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />)}</div> : reports.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No whistleblower reports on record.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r: any) => (
            <Card key={r.id} className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs text-primary">{r.report_code || r.id?.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-[9px]">{r.is_anonymous ? "ANONYMOUS" : "IDENTIFIED"}</Badge>
                      <Badge variant="outline" className={`text-[9px] ${DISC_C[r.disclosure_status] || ""}`}>{r.disclosure_status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Filed: {format(new Date(r.filed_at), "dd MMM yyyy HH:mm")}</p>
                    {r.implicated_person_notified_at && <p className="text-xs text-emerald-400 mt-1">Notified {format(new Date(r.implicated_person_notified_at), "dd MMM yyyy")} by {r.implicated_person_notified_by}</p>}
                    {r.disclosure_status === "WITHHELD_EXCEPTION" && (
                      <div className="mt-2 p-2 rounded bg-red-500/5 border border-red-500/20 space-y-0.5">
                        <p className="text-[10px] text-red-400 font-semibold">NOTICE WITHHELD — s.31(4) Exceptional Circumstances</p>
                        <p className="text-[10px] text-muted-foreground">{r.withheld_reason}</p>
                        {r.withheld_review_date && <p className="text-[10px] text-orange-400">Re-review by: {format(new Date(r.withheld_review_date), "dd MMM yyyy")}</p>}
                      </div>
                    )}
                  </div>
                  {r.disclosure_status === "PENDING" && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-emerald-500/40 text-emerald-400" onClick={() => notifyMut.mutate(r.id)}>Notify (s.31(3))</Button>
                      <Button size="sm" variant="outline" className="text-[10px] h-7 border-red-500/40 text-red-400" onClick={() => setWithholdId(r.id)}>Withhold (s.31(4))</Button>
                    </div>
                  )}
                </div>
                {withholdId === r.id && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                    <p className="text-[10px] font-semibold text-red-400">Mandatory: written justification + re-review date required to invoke s.31(4)</p>
                    <textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded px-2 py-1.5 h-16 resize-none" placeholder="Exceptional circumstances justification…" value={withholdForm.reason} onChange={e => setWithholdForm(p => ({ ...p, reason: e.target.value }))} />
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] text-muted-foreground shrink-0">Re-review by:</Label>
                      <input type="date" className="flex-1 text-xs bg-muted/30 border border-border/40 rounded px-2 py-1" value={withholdForm.reviewByDate} onChange={e => setWithholdForm(p => ({ ...p, reviewByDate: e.target.value }))} />
                      <Button size="sm" className="text-[10px] h-7 shrink-0" onClick={() => withholdMut.mutate({ id: r.id, ...withholdForm })} disabled={!withholdForm.reason || !withholdForm.reviewByDate || withholdMut.isPending}>Confirm</Button>
                      <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={() => setWithholdId("")}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function DpoConfigTab() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    copilotEnabled: false,
    autoSuggestActions: false,
    allowedTasks: "dpo.privacy_notice_review,dpo.notification_risk_check,dpo.dsr_response_draft,dpo.breach_triage,dpo.accountability_summary",
    contextSources: "DPO registry, privacy notices, processing notifications, breach records, data subject rights requests",
  });

  const parseConfigValue = (value: any, defaultValue: any) => {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  };

  const dpoConfigQueryOptions = {
    queryKey: ["/api/registry/dpo-config"],
    queryFn: () => apiRequest("GET", "/api/registry/dpo-config").then(r => r.json()),
    onSuccess: (rows: any[]) => {
      const values: any = {};
      for (const row of rows) {
        const key = row.config_key.replace(/^dpo\./, "");
        let parsed = parseConfigValue(row.config_value, (config as any)[key] ?? null);
        if (key === "agent.allowed_tasks" && Array.isArray(parsed)) {
          parsed = parsed.join(",");
        }
        values[key] = parsed;
      }
      setConfig((prev) => ({ ...prev, ...values }));
    },
  };
  const { data: configRows = [], isLoading } = useQuery<any[], Error>(dpoConfigQueryOptions);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => apiRequest("PUT", "/api/registry/dpo-config", payload).then(r => r.json()),
    onMutate: () => setSaving(true),
    onSuccess: () => {
      setSaving(false);
      toast({ title: "DPO configuration saved" });
    },
    onError: () => {
      setSaving(false);
      toast({ title: "Unable to save DPO settings", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      configs: [
        { configKey: "dpo.enabled", configValue: config.enabled, description: "Enable DPO portal AI and agent workflows." },
        { configKey: "dpo.copilot.enabled", configValue: config.copilotEnabled, description: "Enable the DPO portal Copilot assistant." },
        { configKey: "dpo.agent.auto_suggest", configValue: config.autoSuggestActions, description: "Auto-suggest DPO actions based on open compliance tasks." },
        { configKey: "dpo.agent.allowed_tasks", configValue: config.allowedTasks.split(",").map((task) => task.trim()).filter(Boolean), description: "Allowed DPO agent tasks." },
        { configKey: "dpo.copilot.context_sources", configValue: config.contextSources, description: "Context sources available to the DPO Copilot." },
      ],
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20"><Shield className="w-5 h-5 text-sky-500" /></div>
            <div>
              <h2 className="text-lg font-bold">DPO Portal Configuration</h2>
              <p className="text-xs text-muted-foreground">Configure which DPO Copilot and agent workflows are active in the portal.</p>
            </div>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || isLoading}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-16 rounded-xl bg-muted/30 animate-pulse" />
            <div className="h-16 rounded-xl bg-muted/30 animate-pulse" />
            <div className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="bg-card/60 border-border/40">
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Enable DPO Portal AI</p>
                    <p className="text-xs text-muted-foreground">Allow DPO-specific agent workflows and Copilot features.</p>
                  </div>
                  <Switch checked={config.enabled} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Enable DPO Copilot</p>
                    <p className="text-xs text-muted-foreground">Allow the Copilot assistant to answer portal compliance questions.</p>
                  </div>
                  <Switch checked={config.copilotEnabled} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, copilotEnabled: checked }))} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Auto-suggest actions</p>
                    <p className="text-xs text-muted-foreground">Permit the system to surface recommended DPO actions proactively.</p>
                  </div>
                  <Switch checked={config.autoSuggestActions} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, autoSuggestActions: checked }))} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border/40">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Allowed DPO Agent Tasks</CardTitle>
                <CardDescription className="text-xs">List the DPO agent task IDs that should be available in the portal.</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-28 resize-none"
                  value={config.allowedTasks}
                  onChange={(e) => setConfig((prev) => ({ ...prev, allowedTasks: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">Example: dpo.privacy_notice_review, dpo.breach_triage</p>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border/40">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Copilot Context Sources</CardTitle>
                <CardDescription className="text-xs">Define the DPO Copilot knowledge sources used for answers.</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-32 resize-none"
                  value={config.contextSources}
                  onChange={(e) => setConfig((prev) => ({ ...prev, contextSources: e.target.value }))}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">DPO configuration sidebar</CardTitle>
            <CardDescription className="text-xs">Visible only inside the DPO Config tab.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">What this controls</p>
            <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
              <li>Enable or disable the DPO portal AI experience.</li>
              <li>Control whether the DPO Copilot can answer compliance questions.</li>
              <li>Allow automated suggestions for DPO actions.</li>
              <li>Limit which DPO agent tasks are available.</li>
              <li>Set the knowledge sources used by the DPO Copilot.</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p><strong>Save settings</strong> applies all config changes.</p>
            <p>Use the Integrations tab to manage connector feeds and external DPO integrations.</p>
            <p>This sidebar stays visible inside DPO Config.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
