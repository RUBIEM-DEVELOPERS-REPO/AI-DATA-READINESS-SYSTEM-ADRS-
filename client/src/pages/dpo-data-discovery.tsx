import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import {
  Search, RefreshCw, Filter, ChevronLeft, Database, AlertTriangle,
  Clock, Eye, EyeOff, Shield, CheckCircle, XCircle, BarChart3,
  MapPin, Lock, Zap, Download, Copy, Archive, Plus
} from "lucide-react";

type DiscoveredField = {
  id: string;
  fieldName: string;
  dataType: string;
  table: string;
  system: string;
  isPII: boolean;
  isSensitive: boolean;
  category: string;
  lastSeen: string;
  retentionPeriod?: string;
  retentionExpiry?: string;
  dataOwner?: string;
  source: string;
};

type DiscoveryResult = {
  id: string;
  discoveryDate: string;
  system: string;
  fieldsCount: number;
  piiCount: number;
  sensitiveCount: number;
  tables: number;
  status: string;
};

export default function DpoDataDiscoveryPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [selectedField, setSelectedField] = useState<DiscoveredField | null>(null);
  const [showFieldDetail, setShowFieldDetail] = useState(false);

  // Mock discovered fields - in production, fetch from backend
  const queryString = new URLSearchParams();
  if (selectedSystem) queryString.set("system", selectedSystem);
  if (filterCategory && filterCategory !== "ALL") queryString.set("category", filterCategory);
  if (searchQuery) queryString.set("search", searchQuery);

  const { data, isLoading: fieldsLoading, refetch: refetchFields } = useQuery<DiscoveredField[], Error, DiscoveredField[]>({
    queryKey: ["/api/registry/discovered-fields", selectedSystem, filterCategory, searchQuery],
    queryFn: async () => {
      const url = `/api/registry/discovered-fields?${queryString.toString()}`;
      try {
        return await apiRequest("GET", url).then(r => r.json() as Promise<DiscoveredField[]>);
      } catch {
        return [] as DiscoveredField[];
      }
    },
  });

  const discoveredFields: DiscoveredField[] = data ?? [];

  // Mutation to trigger data discovery scan
  const scanMutation = useMutation({
    mutationFn: async (systemId: string) => {
      return apiRequest("POST", `/api/registry/discover-scan`, { systemId }).then(r => r.json());
    },
    onSuccess: () => {
      toast({ title: "Scan started", description: "Data discovery scan is running in the background." });
      queryClient.invalidateQueries({ queryKey: ["/api/registry/discovered-fields"] });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e?.message, variant: "destructive" }),
  });

  // Calculate metrics
  const totalFields = discoveredFields.length;
  const piiCount = discoveredFields.filter(f => f.isPII).length;
  const sensitiveCount = discoveredFields.filter(f => f.isSensitive).length;
  const systems = new Set(discoveredFields.map(f => f.system)).size;

  // Filter logic
  const filteredFields = discoveredFields.filter(field => {
    const matchesSearch = !searchQuery ||
      field.fieldName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.table.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.system.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSystem = !selectedSystem || field.system === selectedSystem;

    const matchesCategory = filterCategory === "ALL" ||
      (filterCategory === "PII" && field.isPII) ||
      (filterCategory === "SENSITIVE" && field.isSensitive) ||
      (filterCategory === "RETENTION_RISK" && field.retentionExpiry && new Date(field.retentionExpiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    return matchesSearch && matchesSystem && matchesCategory;
  });

  const isRetentionRisk = (expiryDate: string | undefined) => {
    if (!expiryDate) return false;
    const daysUntilExpiry = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry < 30;
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/registry")}
                className="h-9"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-3xl font-bold text-foreground">Data Discovery</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Search and explore personally identifiable information (PII), sensitive data fields, and track their retention periods across connected systems.
            </p>
          </div>
          <Button onClick={() => scanMutation.mutate("")} disabled={scanMutation.isPending} className="h-10 px-4 flex-shrink-0">
            <RefreshCw className={`w-4 h-4 mr-2 ${scanMutation.isPending ? "animate-spin" : ""}`} />
            {scanMutation.isPending ? "Scanning..." : "Run Discovery"}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Total Fields</p>
            <p className="text-2xl font-bold text-foreground">{totalFields}</p>
            <p className="text-xs text-muted-foreground mt-2">Data fields discovered</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">PII Fields</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{piiCount}</p>
            <p className="text-xs text-muted-foreground mt-2">Personal information</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Sensitive Fields</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{sensitiveCount}</p>
            <p className="text-xs text-muted-foreground mt-2">High-risk data</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Systems</p>
            <p className="text-2xl font-bold text-foreground">{systems}</p>
            <p className="text-xs text-muted-foreground mt-2">Connected sources</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label className="text-xs">Search fields by name, table or system</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="email, ssn, medical_history..."
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Filter by</Label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full mt-2 h-10 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
              >
                <option value="ALL">All Fields</option>
                <option value="PII">PII Only</option>
                <option value="SENSITIVE">Sensitive Only</option>
                <option value="RETENTION_RISK">Retention At Risk</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {new Set(discoveredFields.map(f => f.system)).size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">Systems:</span>
                {Array.from(new Set(discoveredFields.map(f => f.system))).map((system) => (
                  <button
                    key={system}
                    onClick={() => setSelectedSystem(selectedSystem === system ? null : system)}
                    className={`text-xs px-3 py-1.5 rounded-full transition ${
                      selectedSystem === system
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/50 bg-background/50 hover:bg-background"
                    }`}
                  >
                    {system}
                  </button>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {fieldsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filteredFields.length > 0 ? (
        <div className="space-y-2">
          {filteredFields.map((field) => {
            const retentionRisk = isRetentionRisk(field.retentionExpiry);
            return (
              <Card
                key={field.id}
                className="border-border/50 bg-card/40 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
                onClick={() => {
                  setSelectedField(field);
                  setShowFieldDetail(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="grid gap-4 lg:grid-cols-6 items-center">
                    {/* Field Name & Type */}
                    <div className="lg:col-span-2">
                      <p className="font-semibold text-foreground">{field.fieldName}</p>
                      <p className="text-xs text-muted-foreground">{field.dataType} · {field.table}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {field.isPII && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">
                            PII
                          </Badge>
                        )}
                        {field.isSensitive && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 border-red-500/30">
                            Sensitive
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* System */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">System</p>
                      <p className="font-medium text-sm text-foreground">{field.system}</p>
                    </div>

                    {/* Category */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Category</p>
                      <p className="font-medium text-sm text-foreground">{field.category}</p>
                    </div>

                    {/* Retention Period */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Retention</p>
                      <p className={`font-medium text-sm ${retentionRisk ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                        {field.retentionPeriod || "Unknown"}
                      </p>
                      {retentionRisk && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          ⚠ Expires in 30 days
                        </p>
                      )}
                    </div>

                    {/* Last Seen */}
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Seen</p>
                      <p className="font-medium text-sm text-foreground">
                        {formatDistanceToNow(new Date(field.lastSeen), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">No fields match your search.</p>
          <p className="text-sm mt-1">Try adjusting your filters or run a discovery scan to find more data.</p>
        </div>
      )}

      {/* Field Detail Modal */}
      {selectedField && (
        <Dialog open={showFieldDetail} onOpenChange={setShowFieldDetail}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedField.fieldName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Data Type</p>
                  <p className="font-medium text-foreground">{selectedField.dataType}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Table</p>
                  <p className="font-medium text-foreground">{selectedField.table}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">System</p>
                  <p className="font-medium text-foreground">{selectedField.system}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Category</p>
                  <p className="font-medium text-foreground">{selectedField.category}</p>
                </div>
              </div>

              {/* Retention Information */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Retention Details</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Retention Period</p>
                    <p className="font-medium text-foreground">{selectedField.retentionPeriod || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Expiry Date</p>
                    <p className={`font-medium ${isRetentionRisk(selectedField.retentionExpiry) ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                      {selectedField.retentionExpiry
                        ? formatDistanceToNow(new Date(selectedField.retentionExpiry), { addSuffix: true })
                        : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Data Owner</p>
                    <p className="font-medium text-foreground">{selectedField.dataOwner || "Unassigned"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Seen</p>
                    <p className="font-medium text-foreground">
                      {formatDistanceToNow(new Date(selectedField.lastSeen), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Classification */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Data Classification</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedField.isPII && (
                    <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">
                      ✓ Personal Information
                    </Badge>
                  )}
                  {selectedField.isSensitive && (
                    <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">
                      ⚠ Sensitive Data
                    </Badge>
                  )}
                  {!selectedField.isPII && !selectedField.isSensitive && (
                    <Badge variant="outline">Non-sensitive</Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  navigator.clipboard.writeText(selectedField.fieldName);
                  toast({ title: "Copied", description: "Field name copied to clipboard." });
                }}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Name
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedField, null, 2));
                  toast({ title: "Copied", description: "Field details copied to clipboard." });
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" className="flex-1">
                  <Archive className="w-4 h-4 mr-2" />
                  Flag for Action
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
