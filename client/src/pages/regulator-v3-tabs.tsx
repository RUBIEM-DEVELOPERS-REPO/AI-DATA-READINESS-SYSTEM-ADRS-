/**
 * Authority Portal — Extended Tabs (v3)
 * Covers: Registrar Intake Queue (s.20, s.23), Investigation & Complaints (s.6(1)),
 *         Regulation Config Editor (s.32), Policy Notes & Cross-Border Liaison (s.6(1)(i)-(j)),
 *         Code Library (s.30)
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
import { InlineAgentWidget } from "@/components/inline-agent-widget";
import { format } from "date-fns";
import {
  FileText, CheckCircle, XCircle, Clock, Shield, AlertTriangle, Globe,
  Users, Lock, BookOpen, Scale, Cpu, Building2, FileWarning, RotateCcw,
  ChevronRight, Eye, Activity, BarChart3, Gavel, MapPin, AlertCircle, Zap, Plus
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/30",
  SUBMITTED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  UNDER_REVIEW: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  OPEN: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CLOSED: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  HIGH: "bg-red-500/10 text-red-400 border-red-500/30",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

// ─── 1. Registrar Intake Queue (ss.20-23) ───────────────────────────────────
export function RegistrarIntakeQueueTab() {
  const { toast } = useToast();
  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/notifications"],
    queryFn: () => apiRequest("GET", "/api/registry/notifications").then(r => r.json()),
  });

  const publishMut = useMutation({
    mutationFn: (n: any) => apiRequest("POST", "/api/registry/public-register", {
      notificationId: n.id,
      orgName: n.org_name || "Controller Org",
      processingName: n.name,
      purposes: n.purposes,
      dataCategories: n.data_categories,
      legalBasis: n.legal_basis,
      retentionPeriod: n.retention_period,
    }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Published successfully", description: "The processing notification has been listed on the Public Register." });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public-register"] });
    },
  });

  const submitted = notifications.filter((n: any) => n.status === "submitted" || n.status === "draft");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Building2 className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Registrar Intake Queue</h2><p className="text-xs text-muted-foreground">Approve and publish low-risk processing notifications to the Public Register (s.23).</p></div>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading queue...</p> : submitted.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" /><p className="text-xs text-muted-foreground">Intake queue is clear.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{submitted.map((n: any) => (
          <Card key={n.id} className="bg-card/60 border-border/40"><CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm">{n.name}</p>
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[n.risk_level ?? "LOW"] ?? ""}`}>{n.risk_level ?? "LOW"} risk</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Basis: {n.legal_basis} · Retention: {n.retention_period}</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={() => publishMut.mutate(n)}>Publish to Register</Button>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── 2. Investigation & Complaints (s.6(1)) ────────────────────────────────
export function InvestigationComplaintsTab() {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ complainantName: "", complainantEmail: "", subjectOrgName: "", description: "", priority: "MEDIUM", source: "COMPLAINT" });
  const { data: cases = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/investigations"],
    queryFn: () => apiRequest("GET", "/api/registry/investigations").then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/investigations", form).then(r => r.json()),
    onSuccess: () => { toast({ title: "Investigation case opened" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/investigations"] }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status, findings }: any) => apiRequest("PATCH", `/api/registry/investigations/${id}`, { status, findings }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Case updated successfully" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/investigations"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Scale className="w-5 h-5 text-primary" /></div>
          <div><h2 className="text-lg font-bold">Investigation & Complaints</h2><p className="text-xs text-muted-foreground">Manage complaints (s.6(1)(f)) and initiate enforcement investigations.</p></div>
        </div>
        <Button size="sm" onClick={() => setCreating(!creating)}><Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Cancel" : "Open Case"}</Button>
      </div>

      {creating && (
        <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Complainant Name</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.complainantName} onChange={e => setForm(f => ({ ...f, complainantName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Complainant Email</Label><input type="email" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.complainantEmail} onChange={e => setForm(f => ({ ...f, complainantEmail: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Subject Organisation</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.subjectOrgName} onChange={e => setForm(f => ({ ...f, subjectOrgName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Priority</Label>
              <select className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Incident/Complaint Details</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-20 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <Button size="sm" className="w-full" onClick={() => createMut.mutate()} disabled={!form.description || createMut.isPending}>Initiate Case</Button>
        </CardContent></Card>
      )}

      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading cases...</p> : cases.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No open investigation cases.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{cases.map((c: any) => (
          <Card key={c.id} className="bg-card/60 border-border/40"><CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-mono text-xs text-primary font-semibold">{c.case_number}</p>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.priority] ?? ""}`}>{c.priority} Priority</Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">Subject: {c.subject_org_name || "Unknown Org"}</p>
                <p className="text-xs text-muted-foreground">Complainant: {c.complainant_name} ({c.complainant_email})</p>
                <p className="text-xs text-foreground/80 mt-1">{c.description}</p>
                {c.findings && <div className="mt-2 p-2 rounded-lg bg-muted/20 border border-border/30 text-xs font-mono"><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Findings Log</p>{c.findings}</div>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {c.status === "OPEN" && <Button size="sm" variant="outline" className="text-xs h-7 border-yellow-500/40 text-yellow-400" onClick={() => updateMut.mutate({ id: c.id, status: "IN_PROGRESS" })}>Investigate</Button>}
                {c.status !== "CLOSED" && (
                  <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40 text-emerald-400" onClick={() => {
                    const findings = prompt("Enter final findings:");
                    if (findings) updateMut.mutate({ id: c.id, status: "CLOSED", findings });
                  }}>Close Case</Button>
                )}
              </div>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── 3. Regulation Config Editor (s.32) ─────────────────────────────────────
export function RegulationConfigEditorTab() {
  const { toast } = useToast();
  const { data: configs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/regulation-config"],
    queryFn: () => apiRequest("GET", "/api/registry/regulation-config").then(r => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (c: any) => apiRequest("PUT", "/api/registry/regulation-config", c).then(r => r.json()),
    onSuccess: () => { toast({ title: "Configuration saved", description: "Regulation settings updated." }); queryClient.invalidateQueries({ queryKey: ["/api/registry/regulation-config"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Gavel className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Regulation Config Editor</h2><p className="text-xs text-muted-foreground">Configure global legal parameters, statutory thresholds & penalty modifiers (s.32).</p></div>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading configurations...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{configs.map((c: any) => (
          <Card key={c.id} className="bg-card/50 border-border/40"><CardContent className="p-4 space-y-3">
            <div>
              <p className="font-mono text-xs text-primary font-semibold">{c.config_key}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              {c.s32_reference && <p className="text-[10px] text-amber-500 mt-0.5">Reference: {c.s32_reference}</p>}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-1.5 font-mono" value={c.config_value} onChange={e => {
                const val = e.target.value;
                queryClient.setQueryData(["/api/registry/regulation-config"], (prev: any) =>
                  prev.map((item: any) => item.id === c.id ? { ...item, config_value: val } : item)
                );
              }} />
              <Button size="sm" className="text-xs" onClick={() => saveMut.mutate({ configKey: c.config_key, configValue: c.config_value, description: c.description, s32Reference: c.s32_reference })}>Apply</Button>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

export function RegulatorAutomationTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState({
    automationEnabled: false,
    autoBreachTriage: false,
    monitorControllers: false,
    controllerRiskThreshold: 70,
    licenseExpiryWarningDays: 30,
    retentionOverdueWarningDays: 14,
    inactiveControllerAlertDays: 60,
    incidentEscalationEnabled: true,
  });
  const [saving, setSaving] = useState(false);

  const regulationConfigQueryOptions = {
    queryKey: ["/api/registry/regulation-config"],
    queryFn: () => apiRequest("GET", "/api/registry/regulation-config").then(r => r.json()),
    onSuccess: (rows: any[]) => {
      const parseConfigValue = (value: any, defaultValue: any) => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === "string") {
          try { return JSON.parse(value); } catch { return value; }
        }
        return value;
      };

      const getValue = (key: string, defaultValue: any) => {
        const row = rows.find((r: any) => r.config_key === key);
        return parseConfigValue(row?.config_value, defaultValue);
      };

      setConfig({
        automationEnabled: getValue("automation.enabled", false),
        autoBreachTriage: getValue("automation.auto_breach_triage", false),
        monitorControllers: getValue("automation.monitor_controllers", false),
        controllerRiskThreshold: getValue("monitoring.controller_risk_threshold", 70),
        licenseExpiryWarningDays: getValue("monitoring.license_expiry_warning_days", 30),
        retentionOverdueWarningDays: getValue("monitoring.retention_overdue_warning_days", 14),
        inactiveControllerAlertDays: getValue("monitoring.inactive_controller_alert_days", 60),
        incidentEscalationEnabled: getValue("monitoring.incident_escalation_enabled", true),
      });
    },
  };
  const { data: configs = [], isLoading } = useQuery<any[], Error>(regulationConfigQueryOptions);

  const saveMut = useMutation({
    mutationFn: (payload: any) => apiRequest("PUT", "/api/registry/regulation-config", payload).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Automation settings saved", description: "Regulator automation and monitoring settings have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/regulation-config"] });
    },
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payloads = [
        { configKey: "automation.enabled", configValue: config.automationEnabled, description: "Enable regulator automation workflows." },
        { configKey: "automation.auto_breach_triage", configValue: config.autoBreachTriage, description: "Allow automatic breach triage by AI agents." },
        { configKey: "automation.monitor_controllers", configValue: config.monitorControllers, description: "Enable ongoing data controller monitoring." },
        { configKey: "monitoring.controller_risk_threshold", configValue: config.controllerRiskThreshold, description: "Risk score threshold for controller monitoring alerts." },
        { configKey: "monitoring.license_expiry_warning_days", configValue: config.licenseExpiryWarningDays, description: "Days before licence expiry to generate warnings." },
        { configKey: "monitoring.retention_overdue_warning_days", configValue: config.retentionOverdueWarningDays, description: "Days overdue before retention alerts trigger." },
        { configKey: "monitoring.inactive_controller_alert_days", configValue: config.inactiveControllerAlertDays, description: "Days of controller inactivity before alerting regulator operations." },
        { configKey: "monitoring.incident_escalation_enabled", configValue: config.incidentEscalationEnabled, description: "Enable automatic incident escalation for high-risk events." },
      ];
      await Promise.all(payloads.map((payload) => apiRequest("PUT", "/api/registry/regulation-config", payload)));
      queryClient.invalidateQueries({ queryKey: ["/api/registry/regulation-config"] });
    } catch (error) {
      toast({ title: "Unable to save automation settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20"><Zap className="w-5 h-5 text-sky-500" /></div>
        <div>
          <h2 className="text-lg font-bold">Regulator Automation</h2>
          <p className="text-xs text-muted-foreground">Configure automation settings and controller monitoring thresholds in a dedicated regulator panel.</p>
        </div>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading automation settings...</p> : (
        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Automation & Controller Monitoring</CardTitle>
            <CardDescription className="text-xs">These settings drive AI automation for regulator workflows and data controller oversight.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Enable Regulator Automation</p>
                  <p className="text-xs text-muted-foreground">Allow the regulator portal to run scheduled AI automation tasks.</p>
                </div>
                <Switch checked={config.automationEnabled} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, automationEnabled: checked }))} />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Auto-breach Triage</p>
                  <p className="text-xs text-muted-foreground">Automatically classify breach reports and assign triage priority.</p>
                </div>
                <Switch checked={config.autoBreachTriage} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, autoBreachTriage: checked }))} />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Monitor Data Controllers</p>
                  <p className="text-xs text-muted-foreground">Continuously evaluate controller compliance and activity signals.</p>
                </div>
                <Switch checked={config.monitorControllers} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, monitorControllers: checked }))} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Controller Risk Threshold</Label>
                  <input type="number" min={0} max={100} className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={config.controllerRiskThreshold} onChange={(e) => setConfig((prev) => ({ ...prev, controllerRiskThreshold: Number(e.target.value) }))} />
                  <p className="text-[10px] text-muted-foreground">Trigger alerts when controller risk score exceeds this threshold.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Inactive Controller Alert Days</Label>
                  <input type="number" min={1} className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={config.inactiveControllerAlertDays} onChange={(e) => setConfig((prev) => ({ ...prev, inactiveControllerAlertDays: Number(e.target.value) }))} />
                  <p className="text-[10px] text-muted-foreground">Alert when a controller has no activity for this many days.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Licence Expiry Warning Days</Label>
                  <input type="number" min={1} className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={config.licenseExpiryWarningDays} onChange={(e) => setConfig((prev) => ({ ...prev, licenseExpiryWarningDays: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Retention Overdue Warning Days</Label>
                  <input type="number" min={1} className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={config.retentionOverdueWarningDays} onChange={(e) => setConfig((prev) => ({ ...prev, retentionOverdueWarningDays: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Incident Escalation</p>
                  <p className="text-xs text-muted-foreground">Automatically escalate high-risk controller incidents to regulator teams.</p>
                </div>
                <Switch checked={config.incidentEscalationEnabled} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, incidentEscalationEnabled: checked }))} />
              </div>

              <Button size="sm" className="w-full md:w-auto" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Automation Settings"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 4. Policy Notes & Cross-Border Liaison (s.6(1)(i)-(j)) ─────────────────
export function PolicyLiaisonTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"policy" | "liaison">("policy");
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [creatingLiaison, setCreatingLiaison] = useState(false);

  const [policyForm, setPolicyForm] = useState({ title: "", content: "", noteType: "POLICY", author: "REGISTRAR", tags: "" });
  const [liaisonForm, setLiaisonForm] = useState({ partnerAuthority: "", country: "", liaisonType: "MEETING", subject: "", description: "", outcome: "", mouReference: "", dateOfContact: "", nextAction: "" });

  const { data: policies = [], isLoading: loadP } = useQuery<any[]>({
    queryKey: ["/api/registry/policy-notes"],
    queryFn: () => apiRequest("GET", "/api/registry/policy-notes").then(r => r.json()),
  });
  const { data: liaisons = [], isLoading: loadL } = useQuery<any[]>({
    queryKey: ["/api/registry/cross-border-liaisons"],
    queryFn: () => apiRequest("GET", "/api/registry/cross-border-liaisons").then(r => r.json()),
  });

  const createPolicyMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/policy-notes", {
      ...policyForm,
      tags: policyForm.tags.split(",").map(t => t.trim()).filter(Boolean),
    }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Policy note created" }); setCreatingPolicy(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/policy-notes"] }); },
  });

  const createLiaisonMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/cross-border-liaisons", liaisonForm).then(r => r.json()),
    onSuccess: () => { toast({ title: "Liaison recorded" }); setCreatingLiaison(false); queryClient.invalidateQueries({ queryKey: ["/api/registry/cross-border-liaisons"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><Globe className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Policy & Cross-Border Cooperation</h2><p className="text-xs text-muted-foreground">Draft policy guidelines (s.6(1)(i)) and manage cross-border enforcement liaisons (s.6(1)(j)).</p></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={subTab === "policy" ? "default" : "outline"} onClick={() => setSubTab("policy")} className="text-xs">Policy Library</Button>
        <Button size="sm" variant={subTab === "liaison" ? "default" : "outline"} onClick={() => setSubTab("liaison")} className="text-xs">Cross-Border Liaison</Button>
      </div>

      {subTab === "policy" && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button size="sm" onClick={() => setCreatingPolicy(!creatingPolicy)}><Plus className="w-3.5 h-3.5 mr-1" />{creatingPolicy ? "Cancel" : "New Note"}</Button></div>
          {creatingPolicy && (
            <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Title</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={policyForm.title} onChange={e => setPolicyForm(p => ({ ...p, title: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Author</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={policyForm.author} onChange={e => setPolicyForm(p => ({ ...p, author: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Tags (comma-separated)</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={policyForm.tags} onChange={e => setPolicyForm(p => ({ ...p, tags: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Policy Content</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-24 resize-none" value={policyForm.content} onChange={e => setPolicyForm(p => ({ ...p, content: e.target.value }))} /></div>
              <Button size="sm" className="w-full" onClick={() => createPolicyMut.mutate()} disabled={!policyForm.title || !policyForm.content || createPolicyMut.isPending}>Publish Policy Note</Button>
            </CardContent></Card>
          )}
          {loadP ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : policies.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No policy notes compiled yet.</p></CardContent></Card>
          ) : (
            <div className="space-y-2">{policies.map((p: any) => (
              <Card key={p.id} className="bg-card/60 border-border/40"><CardContent className="p-4">
                <p className="font-semibold text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground">Author: {p.author || "ADMIN"} · {format(new Date(p.created_at), "dd MMM yyyy")}</p>
                <p className="text-xs text-foreground/80 mt-1 whitespace-pre-line">{p.content}</p>
              </CardContent></Card>
            ))}</div>
          )}
        </div>
      )}

      {subTab === "liaison" && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button size="sm" onClick={() => setCreatingLiaison(!creatingLiaison)}><Plus className="w-3.5 h-3.5 mr-1" />{creatingLiaison ? "Cancel" : "Add Log"}</Button></div>
          {creatingLiaison && (
            <Card className="bg-card/60 border-primary/20"><CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Partner Authority</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Information Commissioner" value={liaisonForm.partnerAuthority} onChange={e => setLiaisonForm(l => ({ ...l, partnerAuthority: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Country</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="South Africa" value={liaisonForm.country} onChange={e => setLiaisonForm(l => ({ ...l, country: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">MOU Reference</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="MOU-SADC-002" value={liaisonForm.mouReference} onChange={e => setLiaisonForm(l => ({ ...l, mouReference: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Subject</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={liaisonForm.subject} onChange={e => setLiaisonForm(l => ({ ...l, subject: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Next Action</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={liaisonForm.nextAction} onChange={e => setLiaisonForm(l => ({ ...l, nextAction: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Description of Liaison</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={liaisonForm.description} onChange={e => setLiaisonForm(l => ({ ...l, description: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Outcomes / Joint Decisions</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-14 resize-none" value={liaisonForm.outcome} onChange={e => setLiaisonForm(l => ({ ...l, outcome: e.target.value }))} /></div>
              <Button size="sm" className="w-full" onClick={() => createLiaisonMut.mutate()} disabled={!liaisonForm.partnerAuthority || !liaisonForm.subject || createLiaisonMut.isPending}>Save Liaison Record</Button>
            </CardContent></Card>
          )}
          {loadL ? <p className="text-xs text-muted-foreground p-4">Loading...</p> : liaisons.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><Globe className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No liaison records stored.</p></CardContent></Card>
          ) : (
            <div className="space-y-2">{liaisons.map((l: any) => (
              <Card key={l.id} className="bg-card/60 border-border/40"><CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><span className="font-semibold text-sm">{l.partner_authority} ({l.country})</span>{l.mou_reference && <Badge variant="outline" className="text-xs">{l.mou_reference}</Badge>}</div>
                <p className="text-xs text-foreground font-semibold">Subject: {l.subject}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{l.description}</p>
                {l.outcome && <p className="text-xs text-emerald-400 mt-1 font-mono bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">Outcome: {l.outcome}</p>}
              </CardContent></Card>
            ))}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 5. Code Library (s.30) ──────────────────────────────────────────────────
export function CodeLibraryTab() {
  const { toast } = useToast();
  const { data: codes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/registry/codes-of-conduct"],
    queryFn: () => apiRequest("GET", "/api/registry/codes-of-conduct").then(r => r.json()),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, decision, rejectionReason, consultationNotes }: any) =>
      apiRequest("PATCH", `/api/registry/codes-of-conduct/${id}/decide`, { decision, rejectionReason, consultationNotes }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Code status updated" }); queryClient.invalidateQueries({ queryKey: ["/api/registry/codes-of-conduct"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20"><BookOpen className="w-5 h-5 text-primary" /></div>
        <div><h2 className="text-lg font-bold">Code Library</h2><p className="text-xs text-muted-foreground">Review and approve industry codes of conduct submitted by organisations (s.30).</p></div>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground p-4">Loading codes...</p> : codes.length === 0 ? (
        <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-8 text-center"><BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-xs text-muted-foreground">No codes of conduct on record.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">{codes.map((c: any) => (
          <Card key={c.id} className="bg-card/60 border-border/40"><CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{c.title}</p><Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge></div>
                <p className="text-xs text-muted-foreground">Submitting Organisation: {c.submitting_org_name}</p>
                <p className="text-xs text-foreground/80 mt-1">{c.description}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {c.status === "SUBMITTED" && (
                  <>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={() => {
                      const notes = prompt("Enter consultation notes / feedback:") || undefined;
                      decideMut.mutate({ id: c.id, decision: "APPROVED", consultationNotes: notes });
                    }}>Approve</Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => {
                      const reason = prompt("Enter rejection reason:") || "Incomplete requirements";
                      decideMut.mutate({ id: c.id, decision: "REJECTED", rejectionReason: reason });
                    }}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

// ─── GAP 6: Exemption Eligibility Calculator (s.20(4)) ────────────────────────
export function ExemptionCalculatorTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ orgId: "", processingActivityId: "", riskScore: 30, conditions: "" });
  const [result, setResult] = useState<any>(null);
  const { data: decisions = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/registry/exemption-decisions"], queryFn: () => apiRequest("GET", "/api/registry/exemption-decisions").then(r => r.json()) });
  const decideMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/registry/exemption-decisions", form).then(r => r.json()),
    onSuccess: (data: any) => { setResult(data); toast({ title: data.eligible ? "Exemption Granted" : "Exemption Not Granted", description: data.eligible ? "Controller meets both s.20(4) criteria." : "One or more criteria not met." }); queryClient.invalidateQueries({ queryKey: ["/api/registry/exemption-decisions"] }); },
  });
  const DEC_C: Record<string, string> = { EXEMPT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", NOT_EXEMPT: "bg-red-500/10 text-red-400 border-red-500/30" };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20"><Scale className="w-5 h-5 text-blue-400" /></div>
        <div><h2 className="text-lg font-bold">Exemption Eligibility Calculator</h2><p className="text-xs text-muted-foreground">s.20(4) CDPA — Authority may exempt a category of processing from notification requirements if: (a) a DPO has been appointed and notified to the Authority, AND (b) the processing presents no apparent risk to data subjects.</p></div>
      </div>
      <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-muted-foreground">
        <p className="font-semibold text-blue-400 mb-1">Statutory Criteria (both must be met)</p>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>Controller has appointed a DPO whose appointment has been notified to and acknowledged by the Authority (s.20(5)) — status = NOTIFIED.</li>
          <li>The processing activity presents no apparent risk to data subjects — computed risk score &lt; 40 (configurable via Regulation Config).</li>
        </ol>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader><CardTitle className="text-sm font-semibold">Run Exemption Assessment</CardTitle><CardDescription className="text-xs">The system automatically checks DPO appointment status and risk score from existing records.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Organisation ID / Controller</Label><input id="exempt-org-id" className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="org_id or controller code" value={form.orgId} onChange={e => setForm(p => ({ ...p, orgId: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Processing Activity ID (optional)</Label><input className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Scope to specific activity or leave blank for org-wide" value={form.processingActivityId} onChange={e => setForm(p => ({ ...p, processingActivityId: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Risk Score Override (0–100) — default auto-computed</Label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="100" value={form.riskScore} onChange={e => setForm(p => ({ ...p, riskScore: parseInt(e.target.value) }))} className="flex-1" />
                <Badge variant="outline" className={`shrink-0 text-xs ${form.riskScore < 40 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : form.riskScore < 70 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>{form.riskScore} — {form.riskScore < 40 ? "LOW" : form.riskScore < 70 ? "MEDIUM" : "HIGH"}</Badge>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Conditions (if partially eligible)</Label><textarea className="w-full text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-16 resize-none" placeholder="Any conditions or caveats on the exemption…" value={form.conditions} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} /></div>
            <Button id="run-exemption-btn" size="sm" className="w-full" onClick={() => decideMut.mutate()} disabled={!form.orgId || decideMut.isPending}><CheckCircle className="w-3.5 h-3.5 mr-1" />Run Assessment & Decide</Button>
            {result && (
              <div className={`p-3 rounded-lg text-xs border ${result.eligible ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <p className={`font-bold mb-2 text-sm ${result.eligible ? "text-emerald-400" : "text-red-400"}`}>{result.eligible ? "✓ EXEMPT" : "✗ NOT EXEMPT"}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><span className={result.hasDpo ? "text-emerald-400" : "text-red-400"}>{result.hasDpo ? "✓" : "✗"}</span><span className="text-muted-foreground">DPO appointed and notified to Authority</span></div>
                  <div className="flex items-center gap-2"><span className={result.isLowRisk ? "text-emerald-400" : "text-red-400"}>{result.isLowRisk ? "✓" : "✗"}</span><span className="text-muted-foreground">Risk score &lt; 40 (score: {result.risk_score})</span></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="xl:col-span-3">
          <h3 className="text-sm font-semibold mb-3">Exemption Decision Log ({decisions.length})</h3>
          {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div> : decisions.length === 0 ? (
            <Card className="bg-card/40 border-dashed border-border/30"><CardContent className="p-12 text-center"><Scale className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No exemption decisions on record.</p></CardContent></Card>
          ) : (
            <ScrollArea className="h-[420px]"><div className="space-y-2">
              {decisions.map((d: any) => (
                <Card key={d.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div><p className="text-sm font-semibold font-mono">{d.org_id}</p><p className="text-xs text-muted-foreground">Risk score: {d.risk_score} · DPO notified: {d.has_notified_dpo ? "Yes" : "No"}</p></div>
                      <Badge variant="outline" className={`text-[9px] ${DEC_C[d.authority_decision] || ""}`}>{d.authority_decision}</Badge>
                    </div>
                    {d.conditions && <p className="text-xs text-muted-foreground border-t border-border/30 pt-2 mt-2">{d.conditions}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">Decided by: {d.decided_by} · {format(new Date(d.created_at), "dd MMM yyyy HH:mm")}</p>
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

// ─── 7. Agentic Automation (AI Copilot for Regulator) ───────────────────────
export function AgenticAutomationTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20">
          <span className="text-sky-500 text-xl">🤖</span>
        </div>
        <div>
          <h2 className="text-lg font-bold">Agentic Automation</h2>
          <p className="text-xs text-muted-foreground">Run DPO portal AI agents and regulator automation tasks for faster risk detection, breach review, and policy recommendation.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">DPO Portal AI Agents</CardTitle>
            <CardDescription className="text-xs">Use the existing AI agent workspace to surface insights and recommendations relevant to the regulator portal.</CardDescription>
          </CardHeader>
          <CardContent>
            <InlineAgentWidget layer="dpo" layerLabel="DPO Portal" defaultCollapsed={false} />
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Full Agent Hub</CardTitle>
            <CardDescription className="text-xs">Access all available agent tasks in the system with a single place to run and review automation outputs.</CardDescription>
          </CardHeader>
          <CardContent>
            <InlineAgentWidget layer="system" layerLabel="All Workspaces" maxTasks={5} defaultCollapsed={false} />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/40 border-border/30">
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <p>This tab exposes live AI automation for the regulator portal. Agents are sourced from the existing AI task registry and run through /api/agent/run.</p>
          <p>Use the first card to focus on DPO-related portal agents, or use the full hub to browse broader automation tasks across the IntelliNexus stack.</p>
        </CardContent>
      </Card>
    </div>
  );
}
