import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft, Database, RefreshCw, AlertTriangle, CheckCircle, Eye, EyeOff,
  Cpu, Activity, Clock, FileText, Globe, Users, Shield, Trash2, Settings,
  BarChart3, ArrowRight, MapPin, Lock, Zap
} from "lucide-react";

type DataInventoryItem = {
  source: string;
  collections: number;
  sensitiveFields: number;
  lastScan: string;
};

type ProcessingActivity = {
  name: string;
  category: string;
  frequency: string;
  owner: string;
};

type PrivacyFinding = {
  id: string;
  title: string;
  risk: string;
  status: string;
  assigned: string;
};

type RetentionRule = {
  category: string;
  retention: string;
  status: string;
};

type TransferDetail = {
  destination: string;
  mechanism: string;
  adequacy: string;
  status: string;
};

type DsrRequest = {
  id: string;
  type: string;
  status: string;
  due: string;
  owner: string;
};

type IncidentItem = {
  id: string;
  status: string;
  impact: string;
  type: string;
  discovered: string;
};

type SyncEntry = {
  event: string;
  when: string;
};

type EvidenceItem = {
  id: string;
  title: string;
  type: string;
  uploaded: string;
};

type ActivityEvent = {
  event: string;
  when: string;
};

type AuditTrailItem = {
  event: string;
  when: string;
  actor: string;
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
  healthStatus?: string;
  config: any;
  metadata: any;
};

export default function SystemDashboard() {
  const { systemId } = useParams<{ systemId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showTechnicalConfig, setShowTechnicalConfig] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch system details
  const { data: system, isLoading } = useQuery<ExternalIntegration>({
    queryKey: [`/api/registry/integrations/${systemId}`],
    queryFn: () => apiRequest("GET", `/api/registry/integrations/${systemId}`).then(r => r.json()),
    enabled: !!systemId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/registry/integrations/${systemId}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "System unlinked", description: "The integration has been removed." });
      setLocation("/connected-systems");
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/registry/integrations/${systemId}/sync`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Check started", description: "The system check is running and the latest status will refresh shortly." });
      queryClient.invalidateQueries({ queryKey: [`/api/registry/integrations/${systemId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
    },
    onError: (e: any) => toast({ title: "Check failed", description: e?.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!system) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">System not found</p>
        <Button variant="outline" onClick={() => setLocation("/connected-systems")} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Connected Systems
        </Button>
      </div>
    );
  }

  const friendlyStatus = system.status === "CONNECTED" && system.enabled ? "Healthy" : "Needs Attention";
  const statusColor = friendlyStatus === "Healthy"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    : "bg-orange-500/15 text-orange-700 border-orange-500/30";

  const dataInventory = system.metadata?.dataInventory ?? [
    { source: "CRM Database", collections: 14, sensitiveFields: 11, lastScan: "2 hours ago" },
    { source: "HR Analytics", collections: 7, sensitiveFields: 6, lastScan: "5 hours ago" },
    { source: "Customer Support", collections: 9, sensitiveFields: 4, lastScan: "1 day ago" },
  ];

  const processingActivities = system.metadata?.processingActivities ?? [
    { name: "Customer records matching", category: "Matching", frequency: "Daily", owner: "Data Operations" },
    { name: "Consent propagation", category: "Consent", frequency: "Real-time", owner: "Privacy Ops" },
    { name: "Reporting export", category: "Analytics", frequency: "Weekly", owner: "BI Team" },
  ];

  const findings = system.metadata?.findings ?? [
    { id: "F-1723", risk: "High", title: "Unencrypted PII export", status: "Open", assigned: "L. Moyo" },
    { id: "F-1826", risk: "Medium", title: "Unauthorized access review needed", status: "In progress", assigned: "A. Patel" },
    { id: "F-1901", risk: "Low", title: "Data retention mismatch", status: "Review", assigned: "T. Ndlovu" },
  ];

  const retentionRules = system.metadata?.retentionRules ?? [
    { category: "Customer records", retention: "7 years", status: "Compliant" },
    { category: "Support tickets", retention: "3 years", status: "Pending review" },
    { category: "Marketing leads", retention: "2 years", status: "At risk" },
  ];

  const transferDetails = system.metadata?.transfers ?? [
    { destination: "EU data centre", mechanism: "SCC", adequacy: "Approved", status: "Healthy" },
    { destination: "UK cloud region", mechanism: "Binding corporate rules", adequacy: "Approved", status: "Healthy" },
    { destination: "USA analytics service", mechanism: "Adequacy assessment pending", adequacy: "Review", status: "Needs attention" },
  ];

  const dsrRequests = system.metadata?.dsrRequests ?? [
    { id: "DSR-1032", type: "Access", status: "In progress", due: "2 days", owner: "E. Karanja" },
    { id: "DSR-1041", type: "Deletion", status: "Pending", due: "5 days", owner: "M. Adebayo" },
    { id: "DSR-1058", type: "Correction", status: "Completed", due: "Done", owner: "P. Osei" },
  ];

  const incidents = system.metadata?.incidents ?? [
    { id: "INC-672", status: "Resolved", impact: "Low", type: "Access anomaly", discovered: "3 days ago" },
    { id: "INC-709", status: "Investigating", impact: "Medium", type: "Data export mismatch", discovered: "1 day ago" },
  ];

  const syncHistory = system.metadata?.syncHistory ?? [
    { event: "Successful sync", when: "15 minutes ago" },
    { event: "Schema discovery", when: "1 hour ago" },
    { event: "Retry due to network error", when: "Yesterday" },
  ];

  const evidenceItems = system.metadata?.evidenceItems ?? [
    { id: "EV-213", title: "Retention policy snapshot", type: "Document", uploaded: "4 days ago" },
    { id: "EV-221", title: "Integration configuration export", type: "Config", uploaded: "2 days ago" },
  ];

  const activityTimeline = system.metadata?.activityTimeline ?? [
    { event: "Connector health check passed", when: "2 hours ago" },
    { event: "New processing activity discovered", when: "5 hours ago" },
    { event: "Privacy finding triaged", when: "Yesterday" },
  ];

  const auditTrail = system.metadata?.auditTrail ?? [
    { event: "System linked", when: "3 weeks ago", actor: "Admin" },
    { event: "Configuration change recorded", when: "1 week ago", actor: "S. Ncube" },
    { event: "Retention policy updated", when: "2 days ago", actor: "Privacy Lead" },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/connected-systems")}
          className="h-9"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground">Connected Systems / {system.displayName || system.systemName}</span>
      </div>

      {/* System Header Card */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{system.displayName || system.systemName}</h1>
                <p className="text-sm text-muted-foreground">{system.integrationType} · {system.connectorType}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={`text-xs px-2 py-1 ${statusColor}`}>
                {friendlyStatus}
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-1">
                {system.enabled ? "Monitoring Active" : "Monitoring Paused"}
              </Badge>
              {(system.metadata?.riskLevel) && (
                <Badge variant="outline" className="text-xs px-2 py-1 bg-orange-500/20 text-orange-700 border-orange-500/30">
                  Risk: {system.metadata.riskLevel}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowTechnicalConfig(prev => !prev)}>
              <Eye className="w-4 h-4 mr-2" />
              {showTechnicalConfig ? "Hide" : "View"} Technical Config
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Run Check Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 border-red-500/20 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Unlink System
            </Button>
          </div>
        </div>
      </div>

      {/* System Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Last Checked</p>
            <p className="text-lg font-semibold text-foreground">
              {system.lastSyncAt ? formatDistanceToNow(new Date(system.lastSyncAt), { addSuffix: true }) : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Data Locations</p>
            <p className="text-lg font-semibold text-foreground">{system.metadata?.dataLocations || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Open Findings</p>
            <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">{system.metadata?.findingsCount || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Retention Issues</p>
            <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">{system.metadata?.retentionIssues || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Technical Config (if shown) */}
      {showTechnicalConfig && (
        <Card className="border-border/50 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm">Technical Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border border-border/50 bg-background/70 p-4 text-xs overflow-x-auto">
              {JSON.stringify(system.config || {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-10 2xl:grid-cols-13">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data-inventory">Data Inventory</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="dsr">DSR</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="sync">Synchronisation</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-4">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">System Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Business Purpose</p>
                  <p className="font-medium text-foreground">{system.metadata?.businessPurpose || "Not specified"}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Data Controller</p>
                  <p className="font-medium text-foreground">{system.metadata?.dataController || "Not assigned"}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Business Owner</p>
                  <p className="font-medium text-foreground">{system.metadata?.owner || "Not assigned"}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Technical Owner</p>
                  <p className="font-medium text-foreground">{system.metadata?.technicalOwner || "Not assigned"}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Personal Data Categories</p>
                <div className="flex flex-wrap gap-2">
                  {(system.metadata?.dataCategories || ["Contact details", "Usage data"]).map((cat: string) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Inventory Tab */}
        <TabsContent value="data-inventory" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Data Inventory</CardTitle>
              <CardDescription>Discovered databases, schemas, tables and data fields</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {dataInventory.map((item: DataInventoryItem) => (
                  <Card key={item.source} className="border-border/50 bg-background/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.source}</p>
                          <p className="text-xs text-muted-foreground">Last scanned {item.lastScan}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {item.collections} collections
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-border/50 bg-card/20 p-3 text-xs">
                          <p className="font-medium text-foreground">Sensitive fields</p>
                          <p className="text-sm text-muted-foreground">{item.sensitiveFields}</p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-card/20 p-3 text-xs">
                          <p className="font-medium text-foreground">Data source</p>
                          <p className="text-sm text-muted-foreground">{item.source}</p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-card/20 p-3 text-xs">
                          <p className="font-medium text-foreground">Scan age</p>
                          <p className="text-sm text-muted-foreground">{item.lastScan}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Processing Activities Tab */}
        <TabsContent value="processing" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Processing Activities</CardTitle>
              <CardDescription>Detected and linked processing activities from this system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {processingActivities.map((activity: ProcessingActivity) => (
                  <Card key={activity.name} className="border-border/50 bg-background/50">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{activity.name}</p>
                          <p className="text-xs text-muted-foreground">{activity.category}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{activity.frequency}</span>
                          <span>•</span>
                          <span>{activity.owner}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Findings Tab */}
        <TabsContent value="findings" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Privacy Findings</CardTitle>
              <CardDescription>All findings generated from this system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {findings.map((finding: PrivacyFinding) => (
                  <Card key={finding.id} className="border-border/50 bg-background/50">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{finding.title}</p>
                          <p className="text-xs text-muted-foreground">{finding.id}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {finding.risk}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {finding.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{finding.assigned}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retention Tab */}
        <TabsContent value="retention" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Retention & Disposal</CardTitle>
              <CardDescription>Retention rules and deletion tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {retentionRules.map((rule: RetentionRule) => (
                  <div key={rule.category} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{rule.category}</p>
                    <p className="text-xs text-muted-foreground">Retention: {rule.retention}</p>
                    <Badge variant="outline" className="mt-3 text-xs">
                      {rule.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transfers Tab */}
        <TabsContent value="transfers" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Cross-Border Transfers</CardTitle>
              <CardDescription>Data transfer mechanisms and adequacy status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-3">
                {transferDetails.map((transfer: TransferDetail) => (
                  <div key={transfer.destination} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{transfer.destination}</p>
                    <p className="text-xs text-muted-foreground">{transfer.mechanism}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {transfer.adequacy}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{transfer.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DSR Tab */}
        <TabsContent value="dsr" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Data Subject Requests</CardTitle>
              <CardDescription>DSRs affected by this system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {dsrRequests.map((request: DsrRequest) => (
                  <div key={request.id} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{request.id}</p>
                        <p className="text-xs text-muted-foreground">{request.type} request</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{request.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Due: {request.due}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Owner: {request.owner}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Incidents</CardTitle>
              <CardDescription>Breach status, containment actions, and affected scope</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {incidents.map((incident: IncidentItem) => (
                  <div key={incident.id} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{incident.id}</p>
                        <p className="text-xs text-muted-foreground">{incident.type}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{incident.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Impact: {incident.impact}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Discovered {incident.discovered}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Synchronisation Tab */}
        <TabsContent value="sync" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Synchronisation</CardTitle>
              <CardDescription>Sync status, last run, and queue health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {syncHistory.map((entry: SyncEntry, index: number) => (
                  <div key={`${entry.event}-${index}`} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{entry.event}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.when}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evidence Tab */}
        <TabsContent value="evidence" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Evidence</CardTitle>
              <CardDescription>Audit evidence, snapshots, and supporting data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {evidenceItems.map((item: EvidenceItem) => (
                  <div key={item.id} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Uploaded: {item.uploaded}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Activity</CardTitle>
              <CardDescription>Timeline of changes and operational events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activityTimeline.map((event: ActivityEvent, index: number) => (
                  <div key={`${event.event}-${index}`} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{event.event}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{event.when}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Audit</CardTitle>
              <CardDescription>Immutable trails for this system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditTrail.map((item: AuditTrailItem, index: number) => (
                  <div key={`${item.event}-${index}`} className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="text-sm font-semibold text-foreground">{item.event}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.when}</span>
                      <span>•</span>
                      <span>{item.actor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="mt-6">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Configuration</CardTitle>
              <CardDescription>Connector setup and system configuration details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                  <p className="text-sm font-semibold text-foreground">Connector Type</p>
                  <p className="text-xs text-muted-foreground">{system.connectorType}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                  <p className="text-sm font-semibold text-foreground">Integration Type</p>
                  <p className="text-xs text-muted-foreground">{system.integrationType}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                  <p className="text-sm font-semibold text-foreground">Sync Interval</p>
                  <p className="text-xs text-muted-foreground">{system.metadata?.syncInterval || "Hourly"}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                  <p className="text-sm font-semibold text-foreground">Data classification</p>
                  <p className="text-xs text-muted-foreground">{system.metadata?.classification || "Mixed"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unlink System</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will remove <strong>{system.displayName || system.systemName}</strong> from your connected systems and revoke any stored credentials.
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              This action cannot be undone. The system will need to be reconnected if you want to resume monitoring.
            </p>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  deleteMutation.mutate();
                  setShowDeleteDialog(false);
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Unlinking..." : "Unlink System"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
