import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import {
  Shield, Activity, FileText, CheckCircle, XCircle, Clock,
  Lock, Database, Globe, Cpu, Layers, Search, AlertTriangle,
  BarChart3, Eye, FileCheck, RefreshCw, Hash, Link2
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface ComplianceStatus {
  status: "OK" | "NEEDS_ATTENTION";
  metrics: {
    auditEvents: number;
    activeProcessingRecords: number;
    publishedDatasets: number;
    pendingValidations: number;
    zkpProofsTotal: number;
    zkpProofsPassed: number;
    zkpProofsFailed: number;
    teeAttestations: number;
    auditLedgerEvents: number;
    federatedAuditSessions: number;
  };
  generatedAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  details: any;
  createdAt: string;
}

interface ProcessingRecord {
  id: string;
  recordCode: string;
  controllerId: string | null;
  purpose: string | null;
  lawfulBasis: string | null;
  dataCategories: string[] | null;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
}

interface ZkpProof {
  id: string;
  proofId: string;
  evidenceOrRunId: string;
  scheme: string;
  statementsCommitment: string;
  complianceAllConditionsSatisfied: boolean;
  failedConditions: string[];
  generatedAt: string;
  createdAt: string;
}

interface TeeAttestation {
  id: string;
  quoteId: string;
  evidenceOrRunId: string;
  scheme: string;
  inputCommitment: string;
  outputCommitment: string;
  transcriptHash: string;
  enclaveMrEnclaveHash: string | null;
  issuedAt: string;
  createdAt: string;
}

interface LedgerEvent {
  id: string;
  ledgerChainId: string;
  ledgerEventId: string;
  eventType: string;
  occurredAt: string;
  payloadCommitment: string;
  datasetCode: string | null;
  datasetVersion: string | null;
  statementHash: string | null;
  createdAt: string;
}

interface FederatedSession {
  id: string;
  requestId: string;
  jurisdiction: string;
  crossBorder: boolean;
  complianceAllConditionsSatisfied: boolean;
  failedConditions: string[];
  createdAt: string;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <Card className="relative glass-panel border-0 overflow-hidden group hover:-translate-y-0.5 transition-all duration-300">
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-foreground/[0.03] blur-2xl group-hover:opacity-60 transition-opacity" />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            <span className="text-3xl font-extrabold text-foreground tracking-tight">{value}</span>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center">
        <Icon className="w-6 h-6 opacity-40" />
      </div>
      <p className="text-sm font-medium opacity-60">{label}</p>
    </div>
  );
}

// ─── Audit Feed ──────────────────────────────────────────────────────────────
function AuditFeed({ logs }: { logs: AuditLogEntry[] }) {
  const [search, setSearch] = useState("");
  const filtered = logs.filter(l =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.entityType?.toLowerCase().includes(search.toLowerCase())
  );

  const badgeColor: Record<string, string> = {
    CREATE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    UPDATE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    DELETE: "bg-destructive/15 text-destructive border-destructive/30",
    LOGIN: "bg-primary/15 text-primary border-primary/30",
    LOGOUT: "bg-muted/60 text-muted-foreground border-border",
    EXPORT: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    APPROVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    REJECT: "bg-destructive/15 text-destructive border-destructive/30",
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter by action or entity…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-muted/30 border-border/50 text-sm"
        />
      </div>
      <ScrollArea className="h-[460px] pr-2">
        {filtered.length === 0
          ? <EmptyState icon={Activity} label="No audit events found" />
          : (
            <div className="space-y-1.5">
              {filtered.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 flex-shrink-0 shadow-[0_0_6px_rgba(var(--primary),0.5)]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 font-semibold ${badgeColor[log.action] ?? "bg-muted text-muted-foreground"}`}>
                        {log.action}
                      </Badge>
                      {log.entityType && (
                        <span className="text-xs text-muted-foreground">{log.entityType}</span>
                      )}
                    </div>
                    {log.entityId && (
                      <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5 truncate">{log.entityId}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )
        }
      </ScrollArea>
    </div>
  );
}

// ─── Processing Records Table ─────────────────────────────────────────────────
function ProcessingRecordsTable({ records }: { records: ProcessingRecord[] }) {
  if (records.length === 0) return <EmptyState icon={FileText} label="No processing records yet" />;
  return (
    <ScrollArea className="h-[460px]">
      <div className="space-y-2">
        {records.map(r => (
          <div key={r.id} className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-mono font-semibold text-primary">{r.recordCode}</span>
              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${r.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}`}>
                {r.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {r.purpose && <span className="text-muted-foreground"><span className="text-foreground/70 font-medium">Purpose: </span>{r.purpose}</span>}
              {r.lawfulBasis && <span className="text-muted-foreground"><span className="text-foreground/70 font-medium">Lawful Basis: </span>{r.lawfulBasis}</span>}
            </div>
            {r.dataCategories && r.dataCategories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {r.dataCategories.map(cat => (
                  <Badge key={cat} variant="outline" className="text-[9px] px-1.5 py-0.5 bg-primary/5 text-primary border-primary/20">{cat}</Badge>
                ))}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">
              Created {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── ZKP Proofs Panel ────────────────────────────────────────────────────────
function ZkpProofsPanel({ proofs }: { proofs: ZkpProof[] }) {
  if (proofs.length === 0) return <EmptyState icon={Lock} label="No ZKP proofs generated yet" />;
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {proofs.map(p => (
          <div key={p.id} className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {p.complianceAllConditionsSatisfied
                  ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                  : <XCircle className="w-4 h-4 text-destructive" />
                }
                <span className="text-xs font-mono font-semibold text-primary/80 truncate max-w-[180px]">{p.proofId}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${p.complianceAllConditionsSatisfied ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                {p.complianceAllConditionsSatisfied ? "PASSED" : "FAILED"}
              </Badge>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              <span className="text-foreground/60">Commitment: </span>{p.statementsCommitment}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              <span className="text-foreground/60">Evidence/Run: </span>{p.evidenceOrRunId}
            </p>
            {p.failedConditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.failedConditions.map(c => (
                  <Badge key={c} variant="outline" className="text-[9px] px-1.5 bg-destructive/10 text-destructive border-destructive/30">{c}</Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{p.scheme}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── TEE Attestations Panel ──────────────────────────────────────────────────
function TeeAttestationsPanel({ attestations }: { attestations: TeeAttestation[] }) {
  if (attestations.length === 0) return <EmptyState icon={Cpu} label="No TEE attestations generated yet" />;
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {attestations.map(a => (
          <div key={a.id} className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-semibold text-primary/80 truncate max-w-[180px]">{a.quoteId}</span>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-sky-500/10 text-sky-400 border-sky-500/30">{a.scheme}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-0.5 text-[10px] font-mono text-muted-foreground">
              <p className="truncate"><span className="text-foreground/60">In: </span>{a.inputCommitment}</p>
              <p className="truncate"><span className="text-foreground/60">Out: </span>{a.outputCommitment}</p>
              <p className="truncate"><span className="text-foreground/60">Tx: </span>{a.transcriptHash}</p>
              {a.enclaveMrEnclaveHash && (
                <p className="truncate"><span className="text-foreground/60">MREnclave: </span>{a.enclaveMrEnclaveHash}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Issued: {a.issuedAt} · Created {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Ledger Events Panel ──────────────────────────────────────────────────────
function LedgerEventsPanel({ events }: { events: LedgerEvent[] }) {
  if (events.length === 0) return <EmptyState icon={Link2} label="No audit ledger events yet" />;
  const typeColor: Record<string, string> = {
    PUBLISH: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    UPDATE: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    ARCHIVE: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    VALIDATE: "bg-primary/10 text-primary border-primary/30",
  };
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.id} className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-mono text-foreground/80 truncate max-w-[180px]">{e.ledgerEventId}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${typeColor[e.eventType] ?? "bg-muted text-muted-foreground"}`}>
                {e.eventType}
              </Badge>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              <span className="text-foreground/60">Chain: </span>{e.ledgerChainId}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              <span className="text-foreground/60">Payload: </span>{e.payloadCommitment}
            </p>
            {e.datasetCode && (
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                <span><span className="text-foreground/60">Dataset: </span>{e.datasetCode}</span>
                {e.datasetVersion && <span>v{e.datasetVersion}</span>}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">
              Occurred: {e.occurredAt} · Logged {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Federated Sessions Panel ─────────────────────────────────────────────────
function FederatedSessionsPanel({ sessions }: { sessions: FederatedSession[] }) {
  if (sessions.length === 0) return <EmptyState icon={Globe} label="No federated audit sessions yet" />;
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {sessions.map(s => (
          <div key={s.id} className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-mono font-semibold text-primary/80">{s.requestId}</span>
              <div className="flex items-center gap-1.5">
                {s.crossBorder && (
                  <Badge variant="outline" className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/30">Cross-Border</Badge>
                )}
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${s.complianceAllConditionsSatisfied ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                  {s.complianceAllConditionsSatisfied ? "COMPLIANT" : "NON-COMPLIANT"}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground"><span className="text-foreground/70">Jurisdiction: </span>{s.jurisdiction}</p>
            {s.failedConditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {s.failedConditions.map(c => (
                  <Badge key={c} variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">{c}</Badge>
                ))}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RegulatorDashboard() {
  const { data: status, isLoading: statusLoading } = useQuery<ComplianceStatus>({
    queryKey: ["/api/regulator/compliance-status"],
  });
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/regulator/audit-logs"],
  });
  const { data: processingRecords = [], isLoading: prLoading } = useQuery<ProcessingRecord[]>({
    queryKey: ["/api/regulator/processing-records"],
  });
  const { data: zkpProofs = [] } = useQuery<ZkpProof[]>({
    queryKey: ["/api/regulator/zkp-proofs"],
  });
  const { data: teeAttestations = [] } = useQuery<TeeAttestation[]>({
    queryKey: ["/api/regulator/tee-attestations"],
  });
  const { data: ledgerEvents = [] } = useQuery<LedgerEvent[]>({
    queryKey: ["/api/regulator/ledger-events"],
  });
  const { data: federatedSessions = [] } = useQuery<FederatedSession[]>({
    queryKey: ["/api/regulator/federated-sessions"],
  });

  const m = status?.metrics;

  return (
    <div className="p-6 space-y-7 max-w-screen-2xl mx-auto">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Regulator Hub</h1>
              <p className="text-sm text-muted-foreground">SupTech Supervision &amp; Compliance Oversight</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <Badge
              variant="outline"
              className={`px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5 ${
                status.status === "OK"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              }`}
            >
              {status.status === "OK" ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {status.status === "OK" ? "System Compliant" : "Needs Attention"}
            </Badge>
          )}
          {status?.generatedAt && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Updated {formatDistanceToNow(new Date(status.generatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* ── Metrics Strip ─────────────────────────────────────────────────── */}
      {statusLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : m ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Audit Events" value={m.auditEvents} icon={Activity} color="bg-primary/10 text-primary" />
          <StatCard label="Processing Records" value={m.activeProcessingRecords} icon={FileText} color="bg-blue-500/10 text-blue-400" />
          <StatCard label="Published Datasets" value={m.publishedDatasets} icon={Database} color="bg-chart-3/10 text-chart-3" />
          <StatCard label="Pending Validations" value={m.pendingValidations} icon={Clock} color="bg-yellow-500/10 text-yellow-400" />
          <StatCard label="ZKP Proofs" value={m.zkpProofsTotal} icon={Lock} color="bg-violet-500/10 text-violet-400" sub={`${m.zkpProofsPassed} passed · ${m.zkpProofsFailed} failed`} />
          <StatCard label="TEE Attestations" value={m.teeAttestations} icon={Cpu} color="bg-sky-500/10 text-sky-400" />
          <StatCard label="Ledger Events" value={m.auditLedgerEvents} icon={Layers} color="bg-orange-500/10 text-orange-400" />
          <StatCard label="Federated Sessions" value={m.federatedAuditSessions} icon={Globe} color="bg-teal-500/10 text-teal-400" />
          <StatCard label="ZKP Passed Rate" value={m.zkpProofsTotal > 0 ? `${Math.round((m.zkpProofsPassed / m.zkpProofsTotal) * 100)}%` : "—"} icon={CheckCircle} color="bg-emerald-500/10 text-emerald-400" />
          <StatCard label="ZKP Failed" value={m.zkpProofsFailed > 0 ? m.zkpProofsFailed : "None"} icon={XCircle} color={m.zkpProofsFailed > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"} />
        </div>
      ) : null}

      {/* ── Main Panels ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Audit Log Feed */}
        <Card className="glass-panel border-0 shadow-lg">
          <CardHeader className="pb-3 border-b border-border/20">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              Live Audit Feed
            </CardTitle>
            <CardDescription className="text-xs">Real-time system audit events — last 100</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {auditLoading ? <Skeleton className="h-[460px] rounded-lg" /> : <AuditFeed logs={auditLogs} />}
          </CardContent>
        </Card>

        {/* Processing Records */}
        <Card className="glass-panel border-0 shadow-lg">
          <CardHeader className="pb-3 border-b border-border/20">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              Processing Activity Records
            </CardTitle>
            <CardDescription className="text-xs">Data processing declarations by controllers</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {prLoading ? <Skeleton className="h-[460px] rounded-lg" /> : <ProcessingRecordsTable records={processingRecords} />}
          </CardContent>
        </Card>
      </div>

      {/* ── SupTech Evidence Panel ─────────────────────────────────────────── */}
      <Card className="glass-panel border-0 shadow-lg">
        <CardHeader className="pb-3 border-b border-border/20">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Eye className="w-4 h-4 text-violet-400" />
            </div>
            Sovereign Compliance Evidence
          </CardTitle>
          <CardDescription className="text-xs">ZKP proofs, TEE attestations, immutable ledger, and federated audit sessions</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs defaultValue="zkp">
            <TabsList className="mb-4 bg-muted/40 rounded-xl p-1 flex-wrap h-auto gap-1">
              <TabsTrigger value="zkp" className="text-xs rounded-lg data-[state=active]:bg-background flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                ZKP Proofs
                <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 h-4">{zkpProofs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tee" className="text-xs rounded-lg data-[state=active]:bg-background flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                TEE Attestations
                <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 h-4">{teeAttestations.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ledger" className="text-xs rounded-lg data-[state=active]:bg-background flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Audit Ledger
                <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 h-4">{ledgerEvents.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="federated" className="text-xs rounded-lg data-[state=active]:bg-background flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Federated Sessions
                <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 h-4">{federatedSessions.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="zkp" className="mt-0">
              <ZkpProofsPanel proofs={zkpProofs} />
            </TabsContent>
            <TabsContent value="tee" className="mt-0">
              <TeeAttestationsPanel attestations={teeAttestations} />
            </TabsContent>
            <TabsContent value="ledger" className="mt-0">
              <LedgerEventsPanel events={ledgerEvents} />
            </TabsContent>
            <TabsContent value="federated" className="mt-0">
              <FederatedSessionsPanel sessions={federatedSessions} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
