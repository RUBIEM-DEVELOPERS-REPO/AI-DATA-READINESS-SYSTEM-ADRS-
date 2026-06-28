import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Database, Plus, RefreshCw } from "lucide-react";

type UserRole = "SUPER_ADMIN" | "ADMIN" | "DATA_CONTROLLER" | "DATA_PROTECTION_OFFICER" | "ANALYST" | "REVIEWER" | "VIEWER" | "REGULATOR";

type DataController = {
  id: string;
  controllerCode: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  organisation: string | null;
  address: string | null;
  metadata: Record<string, unknown>;
  tenantId: string;
  createdAt: string;
};

type ProcessingRecord = {
  id: string;
  recordCode: string;
  controllerId: string | null;
  purpose: string | null;
  lawfulBasis: string | null;
  dataCategories: string[];
  status: string;
  createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
  INACTIVE: "bg-slate-500/10 text-slate-700 border border-slate-200",
};

function RegistryPage() {
  const { toast } = useToast();
  const [controllerName, setControllerName] = useState("");
  const [controllerEmail, setControllerEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [address, setAddress] = useState("");
  const [selectedControllerId, setSelectedControllerId] = useState<string>("");
  const [purpose, setPurpose] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("");
  const [dataCategories, setDataCategories] = useState("");

  const { data: controllers, isLoading: loadingControllers } = useQuery<DataController[]>({
    queryKey: ["/api/registry/controllers"],
    queryFn: async () => apiRequest("GET", "/api/registry/controllers").then(res => res.json()),
  });

  const { data: processingRecords, isLoading: loadingRecords } = useQuery<ProcessingRecord[]>({
    queryKey: ["/api/registry/processing-records"],
    queryFn: async () => apiRequest("GET", "/api/registry/processing-records").then(res => res.json()),
  });

  const createControllerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: controllerName,
        contactEmail: controllerEmail,
        organisation,
        address,
      };
      return apiRequest("POST", "/api/registry/controllers", payload).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/controllers"] });
      setControllerName("");
      setControllerEmail("");
      setOrganisation("");
      setAddress("");
      toast({ title: "Controller created", description: "Data controller registry entry has been created." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create controller", description: error?.message ?? "Please try again", variant: "destructive" });
    },
  });

  const createRecordMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        controllerId: selectedControllerId,
        purpose,
        lawfulBasis,
        dataCategories: dataCategories.split(",").map(item => item.trim()).filter(Boolean),
        status: "ACTIVE",
      };
      return apiRequest("POST", "/api/registry/processing-records", payload).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registry/processing-records"] });
      setSelectedControllerId("");
      setPurpose("");
      setLawfulBasis("");
      setDataCategories("");
      toast({ title: "Processing record created", description: "A processing record was added." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create record", description: error?.message ?? "Please try again", variant: "destructive" });
    },
  });

  const controllerRows: (DataController | null)[] = loadingControllers
    ? Array.from({ length: 3 }, () => null)
    : controllers ?? [];

  const recordRows: (ProcessingRecord | null)[] = loadingRecords
    ? Array.from({ length: 3 }, () => null)
    : processingRecords ?? [];

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">Data Controller Registry</CardTitle>
            <p className="text-sm text-muted-foreground">Register Data Controllers for compliance and processing accountability.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="controllerName">Controller Name</Label>
                <Input id="controllerName" value={controllerName} onChange={e => setControllerName(e.target.value)} placeholder="ACME Data Services" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="controllerEmail">Contact Email</Label>
                <Input id="controllerEmail" value={controllerEmail} onChange={e => setControllerEmail(e.target.value)} placeholder="privacy@acme.com" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organisation">Organisation</Label>
                <Input id="organisation" value={organisation} onChange={e => setOrganisation(e.target.value)} placeholder="ACME Corporation" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Compliance Ave" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metadata">Metadata</Label>
              <Textarea id="metadata" value={""} readOnly placeholder="Metadata fields are stored in JSON format by the backend." />
            </div>
            <div className="flex gap-3 items-center">
              <Button onClick={() => createControllerMutation.mutate()} disabled={createControllerMutation.isPending || !controllerName.trim()}>
                <Plus className="w-4 h-4 mr-2" /> Create Controller
              </Button>
              <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/registry/controllers"] })}>
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">Processing Activity Records</CardTitle>
            <p className="text-sm text-muted-foreground">Store minimal PII & lawful-basis details for regulator review.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="controllerSelect">Data Controller</Label>
                <select
                  id="controllerSelect"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={selectedControllerId}
                  onChange={e => setSelectedControllerId(e.target.value)}
                >
                  <option value="">Select controller</option>
                  {controllers?.map(controller => (
                    <option key={controller.id} value={controller.id}>
                      {controller.name} ({controller.controllerCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose</Label>
                  <Input id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Customer onboarding and fraud monitoring" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lawfulBasis">Lawful Basis</Label>
                  <Input id="lawfulBasis" value={lawfulBasis} onChange={e => setLawfulBasis(e.target.value)} placeholder="CONSENT, PERFORMANCE_OF_CONTRACT" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataCategories">Data Categories</Label>
                <Input id="dataCategories" value={dataCategories} onChange={e => setDataCategories(e.target.value)} placeholder="PERSONAL_DATA, CONTACT_DETAILS" />
              </div>
              <div className="flex gap-3 items-center">
                <Button
                  onClick={() => createRecordMutation.mutate()}
                  disabled={
                    createRecordMutation.isPending ||
                    !selectedControllerId ||
                    !purpose.trim() ||
                    !lawfulBasis.trim() ||
                    !dataCategories.trim()
                  }
                >
                  <Plus className="w-4 h-4 mr-2" /> Create Processing Record
                </Button>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/registry/processing-records"] })}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Records are linked to a registered controller and stored with lawful basis metadata.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-4 h-4" /> Controllers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controllerRows.map((controller, index) => (
                  <TableRow key={controller === null ? index : controller.id}>
                    <TableCell>{controller === null ? "Loading…" : controller.controllerCode}</TableCell>
                    <TableCell>{controller === null ? "Loading…" : controller.name}</TableCell>
                    <TableCell>{controller === null ? "Loading…" : controller.contactEmail ?? "—"}</TableCell>
                    <TableCell>{controller === null ? "Loading…" : controller.organisation ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE.ACTIVE}>{controller === null ? "Active" : "Active"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Database className="w-4 h-4" /> Processing Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Lawful Basis</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordRows.map((record, index) => (
                  <TableRow key={record === null ? index : record.id}>
                    <TableCell>{record === null ? "Loading…" : record.recordCode}</TableCell>
                    <TableCell>{record === null ? "Loading…" : record.purpose ?? "—"}</TableCell>
                    <TableCell>{record === null ? "Loading…" : record.lawfulBasis ?? "—"}</TableCell>
                    <TableCell>{record === null ? "Loading…" : (record.dataCategories?.join(", ") || "—")}</TableCell>
                    <TableCell><Badge className={record === null ? STATUS_BADGE.ACTIVE : STATUS_BADGE[record.status] ?? STATUS_BADGE.ACTIVE}>{record === null ? "Active" : record.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default RegistryPage;
