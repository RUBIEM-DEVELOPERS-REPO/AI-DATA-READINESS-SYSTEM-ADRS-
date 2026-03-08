import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EvidenceFile, Batch } from "@shared/schema";
import {
  FileText, Upload, Search, Filter, Lock, Hash, HardDrive, Clock, FolderOpen, Plus, Eye, RefreshCw, CheckCircle2, XCircle, AlertCircle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const statusColors: Record<string, string> = {
  INGESTED: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  PROCESSING: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  PROCESSED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
};

const sourceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  SCAN: FileText,
  SHAREPOINT: HardDrive,
  GOOGLE_DRIVE: HardDrive,
  EMAIL: FileText,
  FTP: HardDrive,
  ERP: HardDrive,
  DATABASE: HardDrive,
};

function EvidenceCard({ file }: { file: EvidenceFile }) {
  const Icon = sourceIcons[file.sourceType] ?? FileText;
  const sizeMb = (file.fileSizeBytes / 1024 / 1024).toFixed(2);

  return (
    <Card data-testid={`card-evidence-${file.id}`} className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
              <p className="text-xs text-muted-foreground">{file.evidenceCode}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${statusColors[file.status]}`}>
            {file.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="w-3 h-3 flex-shrink-0" />
            <span className="truncate font-mono">{file.fileHash.slice(0, 12)}...</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="w-3 h-3 flex-shrink-0" />
            <span>{sizeMb} MB</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span>{file.pageCount} page{file.pageCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="w-3 h-3 flex-shrink-0 text-chart-3" />
            <span className="text-chart-3 font-medium">{file.immutabilityStatus}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Badge variant="outline" className="text-xs">{file.sourceType}</Badge>
          <Badge variant="outline" className="text-xs">{file.fileFormat.toUpperCase()}</Badge>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function NewBatchDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: { sourceLocation: "", expectedDocuments: "10", notes: "", createdBy: "operator_001" }
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/batches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Batch created", description: "New digitization batch registered successfully." });
      setOpen(false);
      form.reset();
    },
    onError: () => toast({ title: "Error", description: "Failed to create batch.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" data-testid="button-new-batch">
          <Plus className="w-4 h-4" /> New Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Digitization Batch</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate({ ...d, expectedDocuments: parseInt(d.expectedDocuments) }))} className="space-y-4">
            <FormField name="sourceLocation" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Source Location</FormLabel>
                <FormControl><Input {...field} placeholder="Ministry Warehouse A" data-testid="input-source-location" /></FormControl>
              </FormItem>
            )} />
            <FormField name="expectedDocuments" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Documents</FormLabel>
                <FormControl><Input {...field} type="number" min="1" data-testid="input-expected-docs" /></FormControl>
              </FormItem>
            )} />
            <FormField name="createdBy" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Operator ID</FormLabel>
                <FormControl><Input {...field} placeholder="operator_001" data-testid="input-operator" /></FormControl>
              </FormItem>
            )} />
            <FormField name="notes" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl><Textarea {...field} rows={2} data-testid="input-notes" /></FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-submit-batch">
                {mutation.isPending ? "Creating..." : "Create Batch"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function IngestFileDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: batches } = useQuery<Batch[]>({ queryKey: ["/api/batches"] });
  const form = useForm({
    defaultValues: {
      fileName: "", fileFormat: "pdf", fileSizeBytes: "1024000", pageCount: "1",
      sourceType: "SCAN", batchId: "", uploadedBy: "operator_001", sourceReference: ""
    }
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/evidence", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Evidence ingested", description: "File has been ingested and immutably stored." });
      setOpen(false);
      form.reset();
    },
    onError: () => toast({ title: "Error", description: "Failed to ingest evidence.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2" data-testid="button-ingest-file">
          <Upload className="w-4 h-4" /> Ingest Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ingest Evidence File</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate({
            ...d,
            fileSizeBytes: parseInt(d.fileSizeBytes),
            pageCount: parseInt(d.pageCount),
            batchId: d.batchId || undefined,
          }))} className="space-y-3">
            <FormField name="fileName" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>File Name</FormLabel>
                <FormControl><Input {...field} placeholder="invoice_2024_001.pdf" data-testid="input-file-name" /></FormControl>
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField name="fileFormat" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Format</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-file-format"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["pdf", "png", "tiff", "jpeg", "docx", "xlsx"].map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField name="sourceType" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["SCAN", "SHAREPOINT", "GOOGLE_DRIVE", "EMAIL", "FTP", "ERP", "DATABASE"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField name="fileSizeBytes" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Size (bytes)</FormLabel>
                  <FormControl><Input {...field} type="number" data-testid="input-file-size" /></FormControl>
                </FormItem>
              )} />
              <FormField name="pageCount" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Pages</FormLabel>
                  <FormControl><Input {...field} type="number" min="1" data-testid="input-page-count" /></FormControl>
                </FormItem>
              )} />
            </div>
            {batches && batches.length > 0 && (
              <FormField name="batchId" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch (optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue="">
                    <FormControl><SelectTrigger data-testid="select-batch"><SelectValue placeholder="Select batch..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.batchCode} — {b.sourceLocation}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-submit-ingest">
                {mutation.isPending ? "Ingesting..." : "Ingest File"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Evidence() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: files, isLoading } = useQuery<EvidenceFile[]>({ queryKey: ["/api/evidence"] });
  const { data: batches } = useQuery<Batch[]>({ queryKey: ["/api/batches"] });

  const filtered = (files ?? []).filter(f => {
    const matchSearch = !search || f.fileName.toLowerCase().includes(search.toLowerCase()) || f.evidenceCode.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || f.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: files?.length ?? 0,
    processed: files?.filter(f => f.status === "PROCESSED").length ?? 0,
    processing: files?.filter(f => f.status === "PROCESSING").length ?? 0,
    failed: files?.filter(f => f.status === "FAILED").length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-evidence">Evidence Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Ingested files with cryptographic immutability and provenance tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewBatchDialog />
          <IngestFileDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Files", value: stats.total, icon: FolderOpen, color: "text-primary" },
          { label: "Processed", value: stats.processed, icon: CheckCircle2, color: "text-chart-3" },
          { label: "Processing", value: stats.processing, icon: RefreshCw, color: "text-chart-5" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-0.5">{isLoading ? "—" : s.value}</p>
                </div>
                <s.icon className={`w-6 h-6 ${s.color} opacity-70`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {batches && batches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              Digitization Batches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {batches.map((batch) => (
                <div key={batch.id} data-testid={`row-batch-${batch.id}`} className="flex items-center gap-3 p-3 rounded-md border border-border">
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <p className="text-xs font-mono font-semibold text-foreground">{batch.batchCode}</p>
                      <p className="text-xs text-muted-foreground">{batch.sourceLocation}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={batch.expectedDocuments > 0 ? (batch.scannedDocuments / batch.expectedDocuments) * 100 : 0} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">{batch.scannedDocuments}/{batch.expectedDocuments}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Operator</p>
                      <p className="text-xs text-foreground">{batch.createdBy}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <Badge variant="outline" className="text-xs">{batch.status}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search evidence files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            data-testid="input-evidence-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9" data-testid="select-status-filter">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="INGESTED">Ingested</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="PROCESSED">Processed</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <FolderOpen className="w-12 h-12 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No evidence files found</p>
            <p className="text-xs text-muted-foreground">Use "Ingest Evidence" to add files to the system</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((file) => <EvidenceCard key={file.id} file={file} />)}
        </div>
      )}
    </div>
  );
}
