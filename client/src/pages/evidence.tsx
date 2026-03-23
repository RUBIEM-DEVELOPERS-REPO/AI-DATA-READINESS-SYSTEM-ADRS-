import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/context/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EvidenceFile, Batch } from "@shared/schema";
import {
  FileText, Upload, Search, Filter, Lock, Hash, HardDrive, Clock, FolderOpen, Plus, Eye, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, Mic, Video, Timer, Link2, CloudDownload, FolderInput,
  HardDriveUpload, Globe, Building2, Archive, PackageCheck, PackageX, Zap, Layers
} from "lucide-react";
import { SiGoogledrive, SiDropbox } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const statusColors: Record<string, string> = {
  INGESTED: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  PROCESSING: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  PROCESSED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
};

const AUDIO_FORMATS = ["mp3", "wav", "aac", "flac", "ogg", "m4a"];
const VIDEO_FORMATS = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];
const IMAGE_FORMATS = ["png", "jpeg", "jpg", "tiff", "bmp", "gif"];

function getMediaType(fmt: string): "AUDIO" | "VIDEO" | "IMAGE" | "DOCUMENT" {
  const f = fmt.toLowerCase();
  if (AUDIO_FORMATS.includes(f)) return "AUDIO";
  if (VIDEO_FORMATS.includes(f)) return "VIDEO";
  if (IMAGE_FORMATS.includes(f)) return "IMAGE";
  return "DOCUMENT";
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const sourceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  SCAN: FileText, SHAREPOINT: HardDrive, GOOGLE_DRIVE: HardDrive, EMAIL: FileText,
  FTP: HardDrive, ERP: HardDrive, DATABASE: HardDrive, RECORDING: Mic, DEVICE: Video,
};

const mediaTypeConfig: Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  AUDIO: { Icon: Mic, label: "Audio", color: "text-chart-5" },
  VIDEO: { Icon: Video, label: "Video", color: "text-chart-2" },
  IMAGE: { Icon: FileText, label: "Image", color: "text-chart-1" },
  DOCUMENT: { Icon: FileText, label: "Document", color: "text-muted-foreground" },
};

function EvidenceCard({ file, isDuplicate }: { file: EvidenceFile; isDuplicate?: boolean }) {
  const { toast } = useToast();
  const derivedMediaType = (file.mediaType as string) ?? getMediaType(file.fileFormat);
  const mediaConfig = mediaTypeConfig[derivedMediaType] ?? mediaTypeConfig.DOCUMENT;
  const MediaIcon = mediaConfig.Icon;
  const sizeMb = (file.fileSizeBytes / 1024 / 1024).toFixed(2);
  const isAV = derivedMediaType === "AUDIO" || derivedMediaType === "VIDEO";

  const extractMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/evidence/${file.id}/extract`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/validation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cdm"] });
      toast({
        title: "Extraction complete",
        description: `${data.docType?.replace(/_/g, " ")} · Trust ${Math.round((data.trustScore ?? 0) * 100)}% · ${data.fieldCount ?? 0} fields extracted`,
      });
    },
    onError: (e: any) => toast({ title: "Extraction failed", description: e?.message ?? "Could not process this file.", variant: "destructive" }),
  });

  return (
    <Card data-testid={`card-evidence-${file.id}`} className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${isAV ? "bg-chart-2/10" : "bg-muted"}`}>
              <MediaIcon className={`w-4 h-4 ${mediaConfig.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
              <p className="text-xs text-muted-foreground">{file.evidenceCode}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge variant="outline" className={`text-xs ${statusColors[file.status]}`}>{file.status}</Badge>
            {isDuplicate && (
              <Badge variant="outline" className="text-xs gap-1 border-destructive/50 text-destructive bg-destructive/5" data-testid={`badge-duplicate-${file.id}`}>
                <AlertCircle className="w-2.5 h-2.5" /> DUPLICATE
              </Badge>
            )}
          </div>
        </div>

        {isAV && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-xs gap-1 ${derivedMediaType === "AUDIO" ? "border-chart-5/40 text-chart-5" : "border-chart-2/40 text-chart-2"}`}>
              <MediaIcon className="w-2.5 h-2.5" />{mediaConfig.label}
            </Badge>
            {file.durationSeconds != null && (
              <Badge variant="outline" className="text-xs gap-1 border-muted-foreground/30">
                <Timer className="w-2.5 h-2.5" />{formatDuration(file.durationSeconds)}
              </Badge>
            )}
          </div>
        )}

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
            {isAV ? <Timer className="w-3 h-3 flex-shrink-0" /> : <FileText className="w-3 h-3 flex-shrink-0" />}
            <span>{isAV ? (file.durationSeconds != null ? formatDuration(file.durationSeconds) : "—") : `${file.pageCount} page${file.pageCount !== 1 ? "s" : ""}`}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="w-3 h-3 flex-shrink-0 text-chart-3" />
            <span className="text-chart-3 font-medium">{file.immutabilityStatus}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border flex-wrap">
          <Badge variant="outline" className="text-xs">{file.sourceType}</Badge>
          <Badge variant="outline" className="text-xs">{file.fileFormat.toUpperCase()}</Badge>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {file.storedUri?.startsWith("local://") && (
            <a href={`/api/evidence/${file.id}/file`} target="_blank" rel="noopener noreferrer" data-testid={`link-view-file-${file.id}`}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                <Eye className="w-3 h-3" /> View
              </Button>
            </a>
          )}
          <Button
            size="sm"
            variant={file.status === "PROCESSED" ? "outline" : "default"}
            className="h-7 text-xs gap-1 ml-auto"
            disabled={extractMutation.isPending || file.status === "PROCESSING"}
            onClick={() => extractMutation.mutate()}
            data-testid={`button-extract-${file.id}`}
          >
            {extractMutation.isPending || file.status === "PROCESSING"
              ? <><RefreshCw className="w-3 h-3 animate-spin" /> Extracting...</>
              : file.status === "PROCESSED"
                ? <><RefreshCw className="w-3 h-3" /> Re-extract</>
                : <><AlertCircle className="w-3 h-3" /> Run Extraction</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchSection({ batch, displayFiles, allFiles, duplicateHashes }: {
  batch: Batch;
  displayFiles: EvidenceFile[];
  allFiles: EvidenceFile[];
  duplicateHashes: Set<string>;
}) {
  const { toast } = useToast();
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentFile: "" });
  const [collapsed, setCollapsed] = useState(false);

  const pendingFiles = allFiles.filter(f => f.status === "INGESTED" || f.status === "FAILED");
  const processedCount = allFiles.filter(f => f.status === "PROCESSED").length;
  const progressPct = allFiles.length > 0 ? Math.round((processedCount / allFiles.length) * 100) : 0;

  const runBatchExtraction = async () => {
    if (pendingFiles.length === 0) return;
    setExtracting(true);
    setCollapsed(false);
    setProgress({ done: 0, total: pendingFiles.length, currentFile: pendingFiles[0]?.fileName ?? "" });

    let succeeded = 0;
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      setProgress({ done: i, total: pendingFiles.length, currentFile: file.fileName });
      try {
        await apiRequest("POST", `/api/evidence/${file.id}/extract`, {});
        succeeded++;
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
    }

    setProgress({ done: pendingFiles.length, total: pendingFiles.length, currentFile: "" });
    setExtracting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/validation"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cdm"] });
    toast({
      title: "Batch extraction complete",
      description: `${succeeded} of ${pendingFiles.length} file${pendingFiles.length !== 1 ? "s" : ""} extracted successfully`,
    });
  };

  return (
    <div data-testid={`section-batch-${batch.id}`} className="space-y-3">
      {/* Batch header card */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
        <button
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          onClick={() => setCollapsed(c => !c)}
          data-testid={`toggle-batch-${batch.id}`}
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-sm text-foreground">{batch.batchCode}</span>
              <Badge variant="outline" className="text-xs">{batch.status}</Badge>
              <span className="text-xs text-muted-foreground truncate">{batch.sourceLocation}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-2 flex-1 max-w-48">
                <Progress value={progressPct} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
                  {processedCount}/{allFiles.length}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{batch.createdBy}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {allFiles.length === 0 ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">Empty</Badge>
          ) : pendingFiles.length === 0 ? (
            <Badge variant="outline" className="gap-1 border-chart-3/40 text-chart-3 bg-chart-3/5 text-xs">
              <CheckCircle2 className="w-3 h-3" /> All Extracted
            </Badge>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 text-xs h-8"
              disabled={extracting}
              onClick={runBatchExtraction}
              data-testid={`button-extract-batch-${batch.id}`}
            >
              {extracting
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {progress.done}/{progress.total}</>
                : <><Zap className="w-3.5 h-3.5" /> Extract All ({pendingFiles.length})</>}
            </Button>
          )}
        </div>
      </div>

      {/* Live extraction progress */}
      {extracting && (
        <div className="mx-0 p-4 rounded-xl border border-primary/25 bg-primary/5 space-y-3" data-testid={`progress-batch-${batch.id}`}>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              <span className="text-muted-foreground">Processing: </span>
              <span className="text-foreground font-medium truncate">{progress.currentFile}</span>
            </div>
            <span className="text-primary font-semibold shrink-0 ml-3 tabular-nums">
              {progress.done}/{progress.total} files
            </span>
          </div>
          <Progress
            value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
            className="h-3"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>AI extraction in progress — each file is analysed for fields, entities &amp; trust score</span>
            <span className="font-medium tabular-nums">
              {Math.round(progress.total > 0 ? (progress.done / progress.total) * 100 : 0)}%
            </span>
          </div>
        </div>
      )}

      {/* Evidence cards */}
      {!collapsed && (
        displayFiles.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
            No files match the current filter in this batch
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayFiles.map(f => (
              <EvidenceCard key={f.id} file={f} isDuplicate={duplicateHashes.has(f.fileHash)} />
            ))}
          </div>
        )
      )}
    </div>
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
        <DialogHeader><DialogTitle>Register Digitization Batch</DialogTitle></DialogHeader>
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

const DOC_FORMATS = ["pdf", "docx", "xlsx", "txt", "csv"];
const IMG_FORMATS = ["png", "tiff", "jpeg", "jpg", "bmp"];
const AUD_FORMATS = ["mp3", "wav", "aac", "flac", "ogg", "m4a"];
const VID_FORMATS = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function detectUrlProvider(url: string): { name: string; color: string } | null {
  if (!url.startsWith("http")) return null;
  if (url.includes("drive.google.com") || url.includes("docs.google.com"))
    return { name: "Google Drive", color: "text-blue-500" };
  if (url.includes("dropbox.com") || url.includes("dropboxusercontent.com"))
    return { name: "Dropbox", color: "text-blue-600" };
  if (url.includes("1drv.ms") || url.includes("sharepoint.com") || url.includes("onedrive.live.com"))
    return { name: "OneDrive / SharePoint", color: "text-blue-400" };
  return { name: "HTTP URL", color: "text-muted-foreground" };
}

function IngestFileDialog() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("upload");
  const { data: batches } = useQuery<Batch[]>({ queryKey: ["/api/batches"] });
  const { data: users = [] } = useQuery<{ id: string; username: string; firstName: string; lastName: string; role: string }[]>({
    queryKey: ["/api/users"],
  });

  const defaultOperator = user?.username ?? "";

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOperator, setUploadOperator] = useState(defaultOperator);
  const [uploadBatch, setUploadBatch] = useState("");
  const [uploadDuration, setUploadDuration] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOperator, setImportOperator] = useState(defaultOperator);
  const [importBatch, setImportBatch] = useState("");
  const [importDuration, setImportDuration] = useState("");

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipBatch, setZipBatch] = useState("");
  const [zipOperator, setZipOperator] = useState(defaultOperator);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipResult, setZipResult] = useState<{ ingested: number; errors: number; errorDetails: string[] } | null>(null);
  const [zipDragOver, setZipDragOver] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
  };

  const resetAll = () => {
    setSelectedFile(null);
    setUploadDuration("");
    setUploadBatch("");
    setImportUrl("");
    setImportDuration("");
    setImportBatch("");
    setDragOver(false);
    setZipFile(null);
    setZipResult(null);
    setZipBatch("");
  };

  const handleZipUpload = async () => {
    if (!zipFile) return;
    setZipUploading(true);
    setZipResult(null);
    try {
      const formData = new FormData();
      formData.append("file", zipFile);
      formData.append("uploadedBy", zipOperator);
      if (zipBatch && zipBatch !== "none") formData.append("batchId", zipBatch);
      const resp = await fetch("/api/evidence/upload-zip", { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "ZIP upload failed");
      setZipResult({ ingested: data.ingested, errors: data.errors, errorDetails: data.errorDetails ?? [] });
      invalidate();
      toast({
        title: `ZIP ingested — ${data.ingested} file${data.ingested !== 1 ? "s" : ""} added`,
        description: data.errors > 0 ? `${data.errors} file(s) had errors.` : "All files ingested successfully.",
      });
      if (data.errors === 0) { setZipFile(null); }
    } catch (err: any) {
      toast({ title: "ZIP upload failed", description: err.message, variant: "destructive" });
    } finally {
      setZipUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const fileExt = selectedFile ? selectedFile.name.split(".").pop()?.toLowerCase() ?? "" : "";
  const fileMediaType = getMediaType(fileExt);
  const isAV = fileMediaType === "AUDIO" || fileMediaType === "VIDEO";

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("uploadedBy", uploadOperator || "operator_001");
      fd.append("sourceType", isAV ? (fileMediaType === "AUDIO" ? "RECORDING" : "DEVICE") : "SCAN");
      if (uploadBatch && uploadBatch !== "none") fd.append("batchId", uploadBatch);
      if (uploadDuration) fd.append("durationSeconds", uploadDuration);
      const res = await fetch("/api/evidence/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      invalidate();
      toast({ title: "Evidence ingested", description: `${data.evidenceCode} — ${selectedFile.name} stored with SHA-256 hash.` });
      setOpen(false);
      resetAll();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const data = await apiRequest("POST", "/api/evidence/import-url", {
        url: importUrl.trim(),
        uploadedBy: importOperator || "operator_001",
        batchId: (importBatch && importBatch !== "none") ? importBatch : undefined,
        durationSeconds: importDuration ? parseInt(importDuration) : undefined,
      });
      invalidate();
      toast({ title: "Import complete", description: `${(data as any).evidenceCode} — file imported and immutably stored.` });
      setOpen(false);
      resetAll();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message ?? "Could not fetch file from URL.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const urlProvider = detectUrlProvider(importUrl);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetAll(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2" data-testid="button-ingest-file">
          <Upload className="w-4 h-4" /> Ingest Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Ingest Evidence</DialogTitle></DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-1">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="upload" data-testid="tab-upload" className="gap-1.5 text-xs">
              <HardDriveUpload className="w-3.5 h-3.5" /> Upload File
            </TabsTrigger>
            <TabsTrigger value="zip" data-testid="tab-zip" className="gap-1.5 text-xs">
              <Archive className="w-3.5 h-3.5" /> ZIP Batch
            </TabsTrigger>
            <TabsTrigger value="url" data-testid="tab-url" className="gap-1.5 text-xs">
              <Link2 className="w-3.5 h-3.5" /> From URL
            </TabsTrigger>
            <TabsTrigger value="cloud" data-testid="tab-cloud" className="gap-1.5 text-xs">
              <CloudDownload className="w-3.5 h-3.5" /> Cloud
            </TabsTrigger>
          </TabsList>

          {/* ── Upload Tab ── */}
          <TabsContent value="upload" className="space-y-3 mt-3">
            <div
              data-testid="drop-zone"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              {selectedFile ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    {fileMediaType === "AUDIO" ? <Mic className="w-7 h-7 text-chart-5" /> :
                     fileMediaType === "VIDEO" ? <Video className="w-7 h-7 text-chart-2" /> :
                     <FileText className="w-7 h-7 text-primary" />}
                    <div className="text-left">
                      <p className="font-medium text-sm text-foreground truncate max-w-xs">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{fileExt.toUpperCase()} · {formatBytes(selectedFile.size)} · {fileMediaType}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to choose a different file</p>
                </div>
              ) : (
                <>
                  <FolderInput className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Drag &amp; drop your file here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse your computer</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">PDF, DOCX, XLSX, TXT, CSV, PNG, TIFF, MP3, WAV, MP4, MOV and more · up to 500 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.tiff,.bmp,.gif,.mp3,.wav,.aac,.flac,.ogg,.m4a,.mp4,.mov,.webm,.avi,.mkv,.m4v"
                onChange={onFileInput}
                data-testid="input-file-picker"
              />
            </div>

            {selectedFile && isAV && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-chart-5/5 border border-chart-5/20">
                {fileMediaType === "AUDIO" ? <Mic className="w-3.5 h-3.5 text-chart-5 shrink-0" /> : <Video className="w-3.5 h-3.5 text-chart-2 shrink-0" />}
                <p className="text-xs text-muted-foreground">
                  {fileMediaType === "AUDIO" ? "Audio — transcription pipeline will be triggered" : "Video — transcription + frame extraction pipeline will be triggered"}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Operator</Label>
                <Select value={uploadOperator} onValueChange={setUploadOperator}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-upload-operator">
                    <SelectValue placeholder="Select operator..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.username}>
                        {u.firstName} {u.lastName} <span className="text-muted-foreground">({u.username})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Batch (optional)</Label>
                <Select value={uploadBatch} onValueChange={setUploadBatch}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-upload-batch">
                    <SelectValue placeholder="No batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No batch</SelectItem>
                    {(batches ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.batchCode} — {b.sourceLocation}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedFile && isAV && (
              <div>
                <Label className="text-xs mb-1 block">Duration (seconds)</Label>
                <Input value={uploadDuration} onChange={(e) => setUploadDuration(e.target.value)} type="number" min="1" placeholder="e.g. 2700" className="h-8 text-sm" data-testid="input-upload-duration" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={!selectedFile || uploading} onClick={handleUpload} data-testid="button-submit-upload">
                {uploading ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading...</> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload &amp; Ingest</>}
              </Button>
            </div>
          </TabsContent>

          {/* ── ZIP Batch Tab ── */}
          <TabsContent value="zip" className="space-y-3 mt-3">
            <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/40 border border-border/50">
              Upload a <strong>.zip</strong> archive containing multiple evidence files. Each file will be extracted and ingested as a separate evidence record linked to the selected batch.
            </div>

            <div
              data-testid="drop-zone-zip"
              onDragOver={(e) => { e.preventDefault(); setZipDragOver(true); }}
              onDragLeave={() => setZipDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setZipDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setZipFile(f); setZipResult(null); } }}
              onClick={() => zipInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${zipDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              {zipFile ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <Archive className="w-7 h-7 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-sm text-foreground truncate max-w-xs">{zipFile.name}</p>
                      <p className="text-xs text-muted-foreground">ZIP · {(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to choose a different ZIP</p>
                </div>
              ) : (
                <>
                  <Archive className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Drag &amp; drop your ZIP here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">All file types supported inside ZIP · up to 500 MB</p>
                </>
              )}
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setZipFile(f); setZipResult(null); } }}
                data-testid="input-zip-picker"
              />
            </div>

            {zipResult && (
              <div className={`rounded-md border p-3 space-y-1 ${zipResult.errors === 0 ? "bg-chart-3/5 border-chart-3/30" : "bg-destructive/5 border-destructive/30"}`}>
                <div className="flex items-center gap-2">
                  {zipResult.errors === 0 ? <PackageCheck className="w-4 h-4 text-chart-3" /> : <PackageX className="w-4 h-4 text-destructive" />}
                  <span className="text-sm font-medium">
                    {zipResult.ingested} file{zipResult.ingested !== 1 ? "s" : ""} ingested
                    {zipResult.errors > 0 ? `, ${zipResult.errors} error${zipResult.errors !== 1 ? "s" : ""}` : ""}
                  </span>
                </div>
                {zipResult.errorDetails.length > 0 && (
                  <ul className="text-xs text-destructive space-y-0.5 pl-6 list-disc">
                    {zipResult.errorDetails.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Operator</Label>
                <Select value={zipOperator} onValueChange={setZipOperator}>
                  <SelectTrigger data-testid="select-zip-operator" className="h-8 text-xs">
                    <SelectValue placeholder="Select operator..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.username}>
                        {u.firstName} {u.lastName} <span className="text-muted-foreground">({u.username})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Assign to Batch</Label>
                <Select value={zipBatch} onValueChange={setZipBatch}>
                  <SelectTrigger data-testid="select-zip-batch" className="h-8 text-xs">
                    <SelectValue placeholder="No batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No batch</SelectItem>
                    {(batches ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.batchCode} — {b.sourceLocation}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              data-testid="button-zip-upload"
              className="w-full h-9 text-sm"
              disabled={!zipFile || zipUploading}
              onClick={handleZipUpload}
            >
              {zipUploading
                ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing ZIP...</>
                : <><Archive className="w-3.5 h-3.5 mr-1.5" /> Extract &amp; Ingest All Files</>}
            </Button>
          </TabsContent>

          {/* ── From URL Tab ── */}
          <TabsContent value="url" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs mb-1 block">File URL</Label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or any HTTP/FTP URL"
                  className="pl-8 h-8 text-sm font-mono"
                  data-testid="input-import-url"
                />
              </div>
              {urlProvider && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${urlProvider.color}`}>
                  <CheckCircle2 className="w-3 h-3" /> Detected: {urlProvider.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Operator</Label>
                <Select value={importOperator} onValueChange={setImportOperator}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-import-operator">
                    <SelectValue placeholder="Select operator..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.username}>
                        {u.firstName} {u.lastName} <span className="text-muted-foreground">({u.username})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Duration in secs (A/V only)</Label>
                <Input value={importDuration} onChange={(e) => setImportDuration(e.target.value)} type="number" min="1" placeholder="optional" className="h-8 text-sm" data-testid="input-import-duration" />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Batch (optional)</Label>
              <Select value={importBatch} onValueChange={setImportBatch}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-import-batch">
                  <SelectValue placeholder="No batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No batch</SelectItem>
                  {(batches ?? []).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.batchCode} — {b.sourceLocation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">How to get a sharing link</p>
              <div className="space-y-1.5">
                {[
                  { Icon: SiGoogledrive, name: "Google Drive", tip: "Right-click file → Share → Copy link (set to Anyone with link)" },
                  { Icon: SiDropbox, name: "Dropbox", tip: "Hover file → Share → Copy Dropbox link" },
                  { Icon: Building2, name: "OneDrive / SharePoint", tip: "Right-click → Share → Copy link (Anyone)" },
                ].map(({ Icon, name, tip }) => (
                  <div key={name} className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="text-xs font-medium text-foreground">{name}: </span>
                      <span className="text-xs text-muted-foreground">{tip}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={!importUrl.trim() || importing} onClick={handleImportUrl} data-testid="button-submit-import-url">
                {importing ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing...</> : <><CloudDownload className="w-3.5 h-3.5 mr-1.5" /> Import &amp; Ingest</>}
              </Button>
            </div>
          </TabsContent>

          {/* ── Cloud Storage Tab ── */}
          <TabsContent value="cloud" className="space-y-2 mt-3">
            <p className="text-xs text-muted-foreground mb-3">Connect cloud storage platforms to browse and import files directly into ADRS.</p>
            {[
              { Icon: SiGoogledrive, name: "Google Drive", status: "not_connected", desc: "Browse and import files from your Google Drive — PDFs, Docs, Sheets, and more.", action: "Connect Google Drive" },
              { Icon: SiDropbox, name: "Dropbox", status: "url_import", desc: "Import Dropbox files using a shared link via the URL import tab.", action: "Use URL Import" },
              { Icon: Building2, name: "OneDrive / SharePoint", status: "url_import", desc: "Import OneDrive and SharePoint files using a shared link.", action: "Use URL Import" },
            ].map(({ Icon, name, status, desc, action }) => (
              <div key={name} className="flex items-start gap-3 p-3 rounded-md border border-border bg-card">
                <Icon className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {status === "not_connected" ? "Not Connected" : "Via URL"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Button
                  size="sm"
                  variant={status === "not_connected" ? "default" : "outline"}
                  className="text-xs shrink-0"
                  onClick={() => {
                    if (status === "url_import") setTab("url");
                    else toast({ title: "Google Drive", description: "Open the Replit integrations panel and connect Google Drive to enable native file browsing.", duration: 6000 });
                  }}
                  data-testid={`button-connect-${name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {action}
                </Button>
              </div>
            ))}
            <div className="mt-2 p-2.5 rounded-md bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">FTP / HTTP servers</strong> — Use the <button className="underline text-primary" onClick={() => setTab("url")}>URL import tab</button> to ingest files directly from any HTTP, HTTPS, or FTP URL.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function Evidence() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: files, isLoading } = useQuery<EvidenceFile[]>({ queryKey: ["/api/evidence"] });
  const { data: batches } = useQuery<Batch[]>({ queryKey: ["/api/batches"] });

  const duplicateHashes = useMemo(() => new Set<string>(
    Object.entries(
      (files ?? []).reduce<Record<string, number>>((acc, f) => {
        acc[f.fileHash] = (acc[f.fileHash] ?? 0) + 1;
        return acc;
      }, {})
    )
      .filter(([, count]) => count > 1)
      .map(([hash]) => hash)
  ), [files]);

  const filtered = useMemo(() => (files ?? []).filter(f => {
    const matchSearch = !search || f.fileName.toLowerCase().includes(search.toLowerCase()) || f.evidenceCode.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || f.status === statusFilter;
    return matchSearch && matchStatus;
  }), [files, search, statusFilter]);

  // All files grouped by batch (unfiltered — used for Extract All counts)
  const allFilesByBatch = useMemo(() => {
    const grouped: Record<string, EvidenceFile[]> = {};
    for (const f of (files ?? [])) {
      const key = f.batchId ?? "__unassigned__";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
    return grouped;
  }, [files]);

  // Filtered files grouped by batch (used for display)
  const filteredFilesByBatch = useMemo(() => {
    const grouped: Record<string, EvidenceFile[]> = {};
    for (const f of filtered) {
      const key = f.batchId ?? "__unassigned__";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
    return grouped;
  }, [filtered]);

  const stats = {
    total: files?.length ?? 0,
    processed: files?.filter(f => f.status === "PROCESSED").length ?? 0,
    processing: files?.filter(f => f.status === "PROCESSING").length ?? 0,
    failed: files?.filter(f => f.status === "FAILED").length ?? 0,
  };

  const hasBatches = (batches?.length ?? 0) > 0;
  const unassigned = filteredFilesByBatch["__unassigned__"] ?? [];
  const allUnassigned = allFilesByBatch["__unassigned__"] ?? [];

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
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Card key={j}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && !hasBatches ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <FolderOpen className="w-12 h-12 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No evidence files found</p>
            <p className="text-xs text-muted-foreground">Use "Ingest Evidence" to add files to the system</p>
          </CardContent>
        </Card>
      ) : hasBatches ? (
        <div className="space-y-8">
          {(batches ?? []).map(batch => {
            const displayFiles = filteredFilesByBatch[batch.id] ?? [];
            const allFiles = allFilesByBatch[batch.id] ?? [];
            if (allFiles.length === 0 && displayFiles.length === 0) return null;
            return (
              <BatchSection
                key={batch.id}
                batch={batch}
                displayFiles={displayFiles}
                allFiles={allFiles}
                duplicateHashes={duplicateHashes}
              />
            );
          })}

          {unassigned.length > 0 && (
            <div className="space-y-3" data-testid="section-unassigned">
              <div className="flex items-center gap-2 px-1">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Unassigned Evidence</h3>
                <Badge variant="outline" className="text-xs">{unassigned.length} file{unassigned.length !== 1 ? "s" : ""}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unassigned.map(f => <EvidenceCard key={f.id} file={f} isDuplicate={duplicateHashes.has(f.fileHash)} />)}
              </div>
            </div>
          )}

          {filtered.length === 0 && hasBatches && (
            <Card>
              <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
                <Search className="w-10 h-10 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium text-muted-foreground">No files match your search or filter</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((file) => <EvidenceCard key={file.id} file={file} isDuplicate={duplicateHashes.has(file.fileHash)} />)}
        </div>
      )}
    </div>
  );
}
