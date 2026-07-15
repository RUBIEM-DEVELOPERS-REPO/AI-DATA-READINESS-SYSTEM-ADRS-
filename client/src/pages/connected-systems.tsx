import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import {
  Building2, Database, Plus, RefreshCw, Shield, AlertTriangle, CheckCircle,
  XCircle, Clock, FileText, Globe, Eye, BarChart3, Search, PauseCircle, Trash2,
  Activity, AlertCircle, TrendingUp, Zap, Link2, Server, GitBranch
} from "lucide-react";

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

type SummaryMetric = {
  key: string;
  title: string;
  value: number;
  caption: string;
  icon: React.ElementType;
  color: string;
};

export default function ConnectedSystemsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedView, setSelectedView] = useState("ALL");
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSearchQuery, setWizardSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSystem, setSelectedSystem] = useState("Salesforce");
  const [newSystemName, setNewSystemName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [introAccepted, setIntroAccepted] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<"signin" | "request" | "manual">("signin");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [monitoringScope, setMonitoringScope] = useState<string[]>(["personal_info", "sensitive_info", "retention", "retention_expiry", "access_changes", "exports"]);
  const manualUrlMissing = connectionMethod === "manual" && wizardStep === 2 && !databaseUrl.trim();
  const [monitoringFrequency, setMonitoringFrequency] = useState("continuous");
  const [requestedOwner, setRequestedOwner] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  // Fetch all integrations
  const { data: integrations = [], isLoading, refetch } = useQuery<ExternalIntegration[]>({
    queryKey: ["/api/registry/integrations"],
    queryFn: () => apiRequest("GET", "/api/registry/integrations").then(r => r.json()),
  });

  const createIntegrationMutation = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/registry/integrations", payload).then(r => r.json()),
    onSuccess: (createdIntegration: ExternalIntegration) => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
      setShowConnectionWizard(false);
      setWizardStep(1);
      setIntroAccepted(false);
      setSelectedSystem("Salesforce");
      setNewSystemName("");
      setNewDisplayName("");
      setDatabaseUrl("");
      setRequestedOwner("");
      setRequestedEmail("");
      setRequestMessage("");
      setMonitoringScope(["personal_info", "sensitive_info", "retention", "retention_expiry", "access_changes", "exports"]);
      setMonitoringFrequency("continuous");
      toast({ title: "System connected", description: `${createdIntegration.displayName || createdIntegration.systemName} is now added to Connected Systems.` });
    },
    onError: (e: any) => toast({ title: "Connection failed", description: e?.message, variant: "destructive" }),
  });

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

  const categories = [
    "ALL",
    "Customer Management",
    "Finance and Accounting",
    "Human Resources and Payroll",
    "Business Intelligence and Reporting",
    "Databases",
    "Document and File Storage",
    "Email and Collaboration",
    "Cloud Platforms",
    "Security and Audit Systems",
    "Healthcare Systems",
    "Government Systems",
    "Other",
  ];

  const visibleSystems = systemOptions.filter((system) => {
    const categoryMatch = selectedCategory === "ALL" || system.category === selectedCategory;
    const queryMatch = !wizardSearchQuery || system.name.toLowerCase().includes(wizardSearchQuery.toLowerCase()) || system.category.toLowerCase().includes(wizardSearchQuery.toLowerCase());
    return categoryMatch && queryMatch;
  });

  const scopeOptions = [
    { key: "personal_info", label: "Personal information discovery", description: "Find names, addresses and contact details." },
    { key: "sensitive_info", label: "Sensitive information discovery", description: "Surface IDs, health and financial data." },
    { key: "retention", label: "Data retention period compliance", description: "Monitor records against defined retention policies and flag overdue deletions." },
    { key: "retention_expiry", label: "Retention expiry tracking", description: "Alert when data is approaching or past retention deadline." },
    { key: "access_changes", label: "Access and permission changes", description: "Track unusual changes in access rights." },
    { key: "exports", label: "Unusual downloads and exports", description: "Spot large or risky data exports." },
  ];

  const toggleScope = (scope: string) => {
    setMonitoringScope((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  };

  const handleCreateConnection = () => {
    const displayName = newDisplayName.trim() || selectedSystem;
    createIntegrationMutation.mutate({
      systemName: newSystemName.trim() || selectedSystem.replace(/\s+/g, "_").toUpperCase(),
      displayName,
      integrationType: selectedSystem.includes("SQL") || selectedSystem.includes("Postgre") ? "GENERIC" : "GENERIC",
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
        requestedOwner,
        requestedEmail,
        requestMessage,
        databaseUrl,
      },
    });
  };

  const syncIntegrationMutation = useMutation({
    mutationFn: (integrationId: string) => apiRequest("POST", `/api/registry/integrations/${integrationId}/sync`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Check started", description: "The system check is running and the latest status will refresh shortly." });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/integrations"] });
    },
    onError: (e: any) => toast({ title: "Check failed", description: e?.message, variant: "destructive" }),
  });

  // Calculate metrics
  const metrics: SummaryMetric[] = [
    {
      key: "total",
      title: "Connected Systems",
      value: integrations.length,
      caption: "Organisations monitored",
      icon: Database,
      color: "text-primary"
    },
    {
      key: "healthy",
      title: "Healthy",
      value: integrations.filter(i => i.status === "CONNECTED" && i.enabled).length,
      caption: "Systems operating normally",
      icon: CheckCircle,
      color: "text-emerald-600 dark:text-emerald-400"
    },
    {
      key: "attention",
      title: "Attention Required",
      value: integrations.filter(i => i.status === "DISCONNECTED" || !i.enabled || i.status === "FAILED").length,
      caption: "Systems needing review",
      icon: AlertTriangle,
      color: "text-orange-600 dark:text-orange-400"
    },
    {
      key: "data-locations",
      title: "Data Locations",
      value: integrations.reduce((sum, i) => sum + ((i.metadata?.dataLocations) || 1), 0),
      caption: "Discovered data sources",
      icon: Globe,
      color: "text-sky-600 dark:text-sky-400"
    },
    {
      key: "findings",
      title: "Open Findings",
      value: integrations.reduce((sum, i) => sum + ((i.metadata?.findingsCount) || 0), 0),
      caption: "Privacy issues needing action",
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400"
    },
    {
      key: "retention-issues",
      title: "Retention Issues",
      value: integrations.reduce((sum, i) => sum + ((i.metadata?.retentionIssues) || 0), 0),
      caption: "Records overdue for deletion",
      icon: Clock,
      color: "text-yellow-600 dark:text-yellow-400"
    },
  ];

  // Calculate filtered results
  const filteredIntegrations = integrations.filter((item) => {
    const matchesSearch = !searchQuery || 
      (item.displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.systemName?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesView = selectedView === "ALL" ||
      (selectedView === "healthy" && item.status === "CONNECTED" && item.enabled) ||
      (selectedView === "attention" && (item.status === "DISCONNECTED" || !item.enabled || item.status === "FAILED")) ||
      (selectedView === "high-risk" && (item.metadata?.riskLevel === "HIGH" || item.metadata?.riskLevel === "CRITICAL")) ||
      (selectedView === "retention" && ((item.metadata?.retentionIssues || 0) > 0)) ||
      (selectedView === "recent" && item.lastSyncAt && new Date(item.lastSyncAt).getTime() > Date.now() - 24 * 60 * 60 * 1000);

    return matchesSearch && matchesView;
  });

  const friendlyStatus = (item: ExternalIntegration) => {
    if (!item.enabled) return "Paused";
    if (item.status === "CONNECTED") return "Healthy";
    if (item.status === "FAILED" || item.status === "ERROR") return "Failed";
    if (item.status === "DISCONNECTED") return "Disconnected";
    return item.status || "Unknown";
  };

  const statusColor = (item: ExternalIntegration) => {
    const status = friendlyStatus(item);
    if (status === "Healthy") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (status === "Failed" || status === "Disconnected") return "bg-red-500/15 text-red-700 border-red-500/30";
    if (status === "Paused") return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Page Header */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Connected Systems</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Monitor the systems that hold or process personal information. Discover data, identify privacy risks and track compliance across your organisation.
            </p>
          </div>
          <Button onClick={() => setShowConnectionWizard(true)} className="h-10 px-4 flex-shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Connect a System
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const isActive = selectedView.toLowerCase() === metric.key;
          return (
            <button
              key={metric.key}
              onClick={() => setSelectedView(metric.key === "total" ? "ALL" : metric.key)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.title}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.caption}</p>
                </div>
                <Icon className={`w-5 h-5 flex-shrink-0 ${metric.color}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Search and Filters */}
      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <Label className="text-xs">Search systems</Label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find by system name, type or owner..."
                className="pl-9 h-10"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* View Tabs */}
      <Tabs value={selectedView} onValueChange={setSelectedView} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6">
          <TabsTrigger value="ALL">All Systems</TabsTrigger>
          <TabsTrigger value="healthy">Healthy</TabsTrigger>
          <TabsTrigger value="attention">Attention</TabsTrigger>
          <TabsTrigger value="high-risk">High Risk</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedView} className="mt-6">
          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : filteredIntegrations.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredIntegrations.map((system) => (
                <Card
                  key={system.id}
                  className="border-border/50 bg-card/40 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
                  onClick={() => setLocation(`/connected-systems/${system.id}`)}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* System Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <Database className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{system.displayName || system.systemName}</p>
                          <p className="text-xs text-muted-foreground">{system.integrationType} · {system.connectorType}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] px-2 py-1 flex-shrink-0 ${statusColor(system)}`}>
                        {friendlyStatus(system)}
                      </Badge>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Last Checked</span>
                        <span className="font-medium text-foreground">
                          {system.lastSyncAt
                            ? formatDistanceToNow(new Date(system.lastSyncAt), { addSuffix: true })
                            : "Never"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Data Locations</span>
                        <span className="font-medium text-foreground">{system.metadata?.dataLocations || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Open Findings</span>
                        <span className={`font-medium ${(system.metadata?.findingsCount || 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                          {system.metadata?.findingsCount || 0}
                        </span>
                      </div>
                    </div>

                    {/* Status Bar */}
                    <div className="rounded-lg border border-border/50 bg-background/50 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Health Score</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                system.status === "CONNECTED" ? "bg-emerald-500" : "bg-red-500"
                              }`}
                              style={{ width: system.status === "CONNECTED" ? "85%" : "20%" }}
                            />
                          </div>
                          <span className="font-medium">{system.status === "CONNECTED" ? "85%" : "20%"}</span>
                        </div>
                      </div>
                      {(system.metadata?.retentionIssues || 0) > 0 && (
                        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{system.metadata?.retentionIssues} retention issues</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/connected-systems/${system.id}`);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-2" />
                        View System
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          syncIntegrationMutation.mutate(system.id);
                        }}
                        disabled={syncIntegrationMutation.isPending}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-2" />
                        Run Check Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-foreground">No systems match this view.</p>
              <p className="text-sm mt-1">Try adjusting your filters or connect a new system to start monitoring privacy risks.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Connection Wizard Dialog */}
      {showConnectionWizard && (
        <Dialog open={showConnectionWizard} onOpenChange={(open) => { setShowConnectionWizard(open); if (!open) setWizardStep(1); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Connect a System</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 p-4">
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium">Step {wizardStep} of 5</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(wizardStep / 5) * 100}%` }} />
                </div>
              </div>

              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Search systems</Label>
                      <Input value={wizardSearchQuery} onChange={(e) => setWizardSearchQuery(e.target.value)} placeholder="Search for a system" className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Category</Label>
                      <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm">
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {visibleSystems.slice(0, 8).map((system) => (
                      <button key={system.name} type="button" onClick={() => setSelectedSystem(system.name)} className={`rounded-2xl border p-4 text-left transition ${selectedSystem === system.name ? "border-primary bg-primary/10" : "border-border/50 bg-background/70 hover:border-primary/30"}`}>
                        <p className="font-semibold text-foreground">{system.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{system.category} · {system.type}</p>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground">Need a custom connection?</p>
                    <p className="mt-2">If your system isn’t listed, you can still connect it and configure monitoring settings before starting a privacy review.</p>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4 rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <button type="button" onClick={() => setConnectionMethod("signin")} className={`rounded-2xl border p-4 text-left ${connectionMethod === "signin" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                      <p className="font-semibold text-foreground">Sign in securely</p>
                      <p className="text-xs text-muted-foreground mt-1">Connect through the system’s standard sign-in flow.</p>
                    </button>
                    <button type="button" onClick={() => setConnectionMethod("request")} className={`rounded-2xl border p-4 text-left ${connectionMethod === "request" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                      <p className="font-semibold text-foreground">Send setup request</p>
                      <p className="text-xs text-muted-foreground mt-1">Invite your IT team to finalise the integration.</p>
                    </button>
                    <button type="button" onClick={() => setConnectionMethod("manual")} className={`rounded-2xl border p-4 text-left ${connectionMethod === "manual" ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                      <p className="font-semibold text-foreground">Manual details</p>
                      <p className="text-xs text-muted-foreground mt-1">Enter connection metadata and credentials securely.</p>
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
                        <Textarea value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Tell the administrator what access is needed." className="min-h-[110px]" />
                      </div>
                    </div>
                  )}
                  {connectionMethod === "manual" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-xs">Database URL</Label>
                        <Input value={databaseUrl} onChange={(e) => setDatabaseUrl(e.target.value)} placeholder="postgresql://user:pass@host:5432/dbname" className="h-10" />
                        <p className="text-xs text-muted-foreground mt-1">Paste the full database connection URL for the system you want IntelliNexus to monitor.</p>
                        {manualUrlMissing ? <p className="text-xs text-destructive mt-1">A valid database URL is required for manual monitoring.</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Organisation or account name</Label>
                        <Input placeholder="Contoso" className="h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Username</Label>
                        <Input placeholder="admin@example.com" className="h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Password or access key</Label>
                        <Input type="password" placeholder="••••••••" className="h-10" />
                      </div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                    <p className="font-semibold">What IntelliNexus will monitor</p>
                    <p className="mt-2 text-muted-foreground">Read-only access is preferred. We will only use credentials to discover data and identify risk patterns.</p>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choose the monitoring scope for this system.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {scopeOptions.map((scope) => {
                      const isSelected = monitoringScope.includes(scope.key);
                      const isRecommended = scope.key === "retention" || scope.key === "retention_expiry";
                      return (
                        <button key={scope.key} type="button" onClick={() => toggleScope(scope.key)} className={`rounded-2xl border p-4 text-left transition ${isSelected ? "border-primary bg-primary/10" : "border-border/50 bg-background/70 hover:border-primary/30"}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{scope.label}</p>
                            {isRecommended && !isSelected ? <span className="text-xs font-medium text-orange-600">Recommended</span> : null}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{scope.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Select how often IntelliNexus should review this connection.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { value: "continuous", label: "Continuous monitoring", description: "Best for frequently changing systems." },
                      { value: "hourly", label: "Hourly", description: "Useful for active business data." },
                      { value: "daily", label: "Daily", description: "Good for regular review." },
                      { value: "weekly", label: "Weekly", description: "For stable systems with low change." },
                    ].map((option) => (
                      <button key={option.value} type="button" onClick={() => setMonitoringFrequency(option.value)} className={`rounded-2xl border p-4 text-left ${monitoringFrequency === option.value ? "border-primary bg-primary/10" : "border-border/50 bg-background/70"}`}>
                        <p className="font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="space-y-4 rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Friendly system name</Label>
                      <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="e.g. Salesforce CRM" className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Internal system key</Label>
                      <Input value={newSystemName} onChange={(e) => setNewSystemName(e.target.value)} placeholder={selectedSystem.replace(/\s+/g, "_").toUpperCase()} className="h-10" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                    <p className="font-semibold">Review before starting</p>
                    <p className="mt-2 text-muted-foreground">The selected configuration will be used for initial monitoring and privacy checks.</p>
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between"><span>System</span><span className="font-medium text-foreground">{selectedSystem}</span></div>
                      <div className="flex items-center justify-between"><span>Connection method</span><span className="font-medium text-foreground">{connectionMethod}</span></div>
                      {connectionMethod === "manual" && databaseUrl.trim() ? (
                        <div className="flex items-center justify-between"><span>Database URL</span><span className="font-medium text-foreground truncate max-w-[180px]">{databaseUrl}</span></div>
                      ) : null}
                      <div className="flex items-center justify-between"><span>Monitoring scope</span><span className="font-medium text-foreground">{monitoringScope.length} areas</span></div>
                      <div className="flex items-center justify-between"><span>Frequency</span><span className="font-medium text-foreground">{monitoringFrequency}</span></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button onClick={handleCreateConnection} disabled={createIntegrationMutation.isPending}>
                      <Zap className="w-4 h-4 mr-2" />Start Monitoring
                    </Button>
                    {createIntegrationMutation.isPending && <span className="text-sm text-muted-foreground">Connecting system...</span>}
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => wizardStep > 1 ? setWizardStep((step) => step - 1) : setShowConnectionWizard(false)}>
                  {wizardStep > 1 ? "Back" : "Cancel"}
                </Button>
                <Button
                  disabled={manualUrlMissing}
                  onClick={() => {
                    if (wizardStep < 5) setWizardStep((step) => step + 1);
                  }}
                >
                  {wizardStep < 5 ? "Continue" : "Finish"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
