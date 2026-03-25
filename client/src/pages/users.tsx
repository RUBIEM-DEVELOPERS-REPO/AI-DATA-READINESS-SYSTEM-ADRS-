import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/context/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Shield, CheckCircle2, XCircle, Clock, Building2, Mail,
  Copy, Check, RefreshCw, Search, AlertCircle, Key, ClipboardList,
  Settings, Wifi, WifiOff, Eye, EyeOff, Save, FlaskConical
} from "lucide-react";

type UserRole = "SUPER_ADMIN" | "ADMIN" | "ANALYST" | "REVIEWER" | "VIEWER";

interface AppUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AccessRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organisation: string;
  requestedRole: UserRole;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  tempPassword: string | null;
  createdUserId: string | null;
  tenantId: string;
  createdAt: string;
}

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5",
  ADMIN: "border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/5",
  ANALYST: "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  REVIEWER: "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5",
  VIEWER: "border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/5",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-yellow-500/40 text-yellow-600 dark:text-yellow-400 bg-yellow-500/5",
  APPROVED: "border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/5",
  REJECTED: "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-1 text-muted-foreground hover:text-foreground transition-colors" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function ApproveDialog({ request, open, onClose }: { request: AccessRequest; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState<{ username: string; tempPassword: string; emailPreviewUrl?: string | null } | null>(null);

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/access-requests/${request.id}/approve`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setResult({ username: data.username, tempPassword: data.tempPassword, emailPreviewUrl: data.emailPreviewUrl });
      toast({ title: "Request approved", description: `Account created for ${request.firstName} ${request.lastName}` });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Approval failed";
      toast({ title: "Approval failed", description: msg, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Approve Access Request
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Account created successfully</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                An email with credentials has been sent to {request.email}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Generated Username</Label>
                <div className="flex items-center gap-1 px-3 py-2 rounded-md bg-muted font-mono text-sm">
                  {result.username}
                  <CopyButton text={result.username} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Temporary Password</Label>
                <div className="flex items-center gap-1 px-3 py-2 rounded-md bg-muted font-mono text-sm">
                  {result.tempPassword}
                  <CopyButton text={result.tempPassword} />
                </div>
              </div>
            </div>

            {result.emailPreviewUrl ? (
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs space-y-1.5">
                <p className="font-medium text-blue-800 dark:text-blue-300">Email sent (test mode)</p>
                <p className="text-blue-700 dark:text-blue-400">
                  Emails are captured in a test mailbox — not delivered to the real inbox in this environment.
                </p>
                <a
                  href={result.emailPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900"
                >
                  View approval email in browser →
                </a>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pass these credentials to the user. They will be prompted to change their password on first use.
              </p>
            )}

            <Button className="w-full" onClick={handleClose} data-testid="button-done-approve">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Name:</span> <strong>{request.firstName} {request.lastName}</strong></p>
              <p><span className="text-muted-foreground">Email:</span> {request.email}</p>
              <p><span className="text-muted-foreground">Organisation:</span> {request.organisation}</p>
              <p><span className="text-muted-foreground">Requested role:</span>{" "}
                <Badge variant="outline" className={`text-xs ${ROLE_COLORS[request.requestedRole]}`}>
                  {request.requestedRole.replace("_", " ")}
                </Badge>
              </p>
            </div>

            <div className="p-3 rounded-md bg-muted/50 border border-border text-sm text-muted-foreground">
              <p className="font-medium text-foreground text-xs mb-1">Reason for access:</p>
              <p className="text-xs">{request.reason}</p>
            </div>

            <p className="text-sm text-muted-foreground">
              Approving will create an account and send the temporary credentials to <strong>{request.email}</strong>.
            </p>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                data-testid="button-confirm-approve"
              >
                {approveMutation.isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Approving…</>
                  : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve & Create Account</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ request, open, onClose }: { request: AccessRequest; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | null>(null);

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/access-requests/${request.id}/reject`, { rejectionReason: reason || undefined }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-requests"] });
      if (data.emailPreviewUrl) {
        setEmailPreviewUrl(data.emailPreviewUrl);
      } else {
        toast({ title: "Request rejected", description: `Rejection notice sent to ${request.email}` });
        setReason("");
        onClose();
      }
    },
    onError: (err: any) => {
      toast({ title: "Rejection failed", description: err?.message ?? "Please try again", variant: "destructive" });
    },
  });

  const handleRejectClose = () => { setReason(""); setEmailPreviewUrl(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleRejectClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive" />
            Reject Access Request
          </DialogTitle>
        </DialogHeader>

        {emailPreviewUrl ? (
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm">
              <p className="font-medium text-green-800 dark:text-green-300">Request rejected</p>
              <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">Rejection notice sent to {request.email}</p>
            </div>
            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs space-y-1.5">
              <p className="font-medium text-blue-800 dark:text-blue-300">Email sent (test mode)</p>
              <p className="text-blue-700 dark:text-blue-400">Emails are captured in a test mailbox — not delivered to the real inbox in this environment.</p>
              <a
                href={emailPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900"
              >
                View rejection email in browser →
              </a>
            </div>
            <Button className="w-full" onClick={handleRejectClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Name:</span> <strong>{request.firstName} {request.lastName}</strong></p>
              <p><span className="text-muted-foreground">Email:</span> {request.email}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Rejection reason <span className="text-muted-foreground text-xs">(optional — will be included in the notification email)</span></Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Insufficient justification provided. Please contact your line manager for approval."
                className="resize-none h-24 text-sm"
                data-testid="textarea-rejection-reason"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleRejectClose}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
                data-testid="button-confirm-reject"
              >
                {rejectMutation.isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rejecting…</>
                  : <><XCircle className="w-3.5 h-3.5" /> Reject Request</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccessRequestCard({ request }: { request: AccessRequest }) {
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);

  return (
    <Card data-testid={`card-request-${request.id}`} className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {request.firstName[0]}{request.lastName[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{request.firstName} {request.lastName}</p>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Mail className="w-3 h-3" />{request.email}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${STATUS_COLORS[request.status]}`}>
            {request.status === "PENDING" && <Clock className="w-2.5 h-2.5 mr-1" />}
            {request.status === "APPROVED" && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
            {request.status === "REJECTED" && <XCircle className="w-2.5 h-2.5 mr-1" />}
            {request.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{request.organisation}</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 flex-shrink-0" />
            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${ROLE_COLORS[request.requestedRole]}`}>
              {request.requestedRole.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="p-2 rounded-md bg-muted/40 text-xs text-muted-foreground line-clamp-2">
          {request.reason}
        </div>

        {request.status === "REJECTED" && request.rejectionReason && (
          <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
            <span className="font-medium">Rejection reason:</span> {request.rejectionReason}
          </div>
        )}

        {request.status === "APPROVED" && request.tempPassword && (
          <div className="p-2 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 text-xs space-y-1">
            <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
              <Key className="w-3 h-3" />
              <span className="font-medium">Temp password issued</span>
              <CopyButton text={request.tempPassword} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
          </span>
          {request.status === "PENDING" && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowReject(true)}
                data-testid={`button-reject-request-${request.id}`}
              >
                <XCircle className="w-3 h-3" /> Reject
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setShowApprove(true)}
                data-testid={`button-approve-request-${request.id}`}
              >
                <CheckCircle2 className="w-3 h-3" /> Approve
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <ApproveDialog request={request} open={showApprove} onClose={() => setShowApprove(false)} />
      <RejectDialog request={request} open={showReject} onClose={() => setShowReject(false)} />
    </Card>
  );
}

interface SmtpConfig {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassSet: boolean;
  fromEmail: string;
  fromName: string;
  usingEnvVars: boolean;
}

function SmtpSettingsTab() {
  const { toast } = useToast();
  const { data: cfg, isLoading } = useQuery<SmtpConfig>({ queryKey: ["/api/settings/smtp"] });

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("ADRS Platform – AI Institute Africa");
  const [showPass, setShowPass] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [initialised, setInitialised] = useState(false);

  if (cfg && !initialised) {
    setHost(cfg.smtpHost);
    setPort(cfg.smtpPort);
    setUser(cfg.smtpUser);
    setFromEmail(cfg.fromEmail || cfg.smtpUser);
    setFromName(cfg.fromName);
    setInitialised(true);
  }

  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/smtp", {
      smtpHost: host, smtpPort: port, smtpUser: user,
      smtpPass: pass || undefined, fromEmail, fromName,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/smtp"] });
      setPass("");
      setTestResult(null);
      toast({ title: "Email settings saved", description: "SMTP configuration updated successfully." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/smtp/test", {}).then(r => r.json()),
    onSuccess: (data: { ok: boolean; error?: string }) => {
      setTestResult(data);
      if (data.ok) toast({ title: "Connection successful", description: "SMTP server responded correctly." });
      else toast({ title: "Connection failed", description: data.error, variant: "destructive" });
    },
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="max-w-2xl space-y-6">
      {cfg?.usingEnvVars && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Environment variables are active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                SMTP credentials are set via server environment variables and take priority. Changes here are saved but won't take effect until the environment variables are removed.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Delivery (SMTP)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure a Gmail account (or any SMTP server) to send approval and rejection emails to users.
            For Gmail, use your Gmail address and a 16-character App Password from your Google account settings.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">SMTP Host</Label>
              <Input
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                data-testid="input-smtp-host"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="587"
                data-testid="input-smtp-port"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Gmail / SMTP Username</Label>
            <Input
              type="email"
              value={user}
              onChange={e => { setUser(e.target.value); if (!fromEmail) setFromEmail(e.target.value); }}
              placeholder="youraddress@gmail.com"
              data-testid="input-smtp-user"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center justify-between">
              <span>
                App Password
                {cfg?.smtpPassSet && !pass && (
                  <span className="ml-2 text-green-600 dark:text-green-400 font-normal">(saved — leave blank to keep)</span>
                )}
              </span>
            </Label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder={cfg?.smtpPassSet ? "••••••••••••••••" : "16-character App Password from Google"}
                className="pr-10"
                data-testid="input-smtp-pass"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sender Identity</p>
            <div className="space-y-1.5">
              <Label className="text-xs">From Email Address</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
                placeholder="youraddress@gmail.com"
                data-testid="input-smtp-from-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From Name</Label>
              <Input
                value={fromName}
                onChange={e => setFromName(e.target.value)}
                placeholder="ADRS Platform – AI Institute Africa"
                data-testid="input-smtp-from-name"
              />
            </div>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${testResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              {testResult.ok
                ? <><Wifi className="w-4 h-4 shrink-0" /> Connection verified — SMTP server is reachable</>
                : <><WifiOff className="w-4 h-4 shrink-0" /> {testResult.error ?? "Connection failed"}</>
              }
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="button-save-smtp"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {save.isPending ? "Saving…" : "Save Settings"}
            </Button>
            <Button
              variant="outline"
              onClick={() => test.mutate()}
              disabled={test.isPending}
              data-testid="button-test-smtp"
            >
              <FlaskConical className="w-4 h-4 mr-1.5" />
              {test.isPending ? "Testing…" : "Test Connection"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/50 bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How to get a Gmail App Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>1. Go to <strong>myaccount.google.com</strong> → Security → turn on <strong>2-Step Verification</strong> (required)</p>
          <p>2. Search for <strong>"App passwords"</strong> in your Google Account search bar</p>
          <p>3. Enter an app name (e.g. <em>ADRS Platform</em>) and click <strong>Create</strong></p>
          <p>4. Copy the 16-character password shown and paste it into the App Password field above</p>
          <p>5. Click <strong>Save Settings</strong>, then <strong>Test Connection</strong> to verify it works</p>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useQuery<AppUser[]>({ queryKey: ["/api/auth/users"] });
  const { toast } = useToast();

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/auth/users/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: "User updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiRequest("PATCH", `/api/auth/users/${id}`, { role }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: "Role updated" });
    },
    onError: () => toast({ title: "Role update failed", variant: "destructive" }),
  });

  const filtered = (users ?? []).filter(u =>
    `${u.firstName} ${u.lastName} ${u.username} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
          data-testid="input-search-users"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(user => {
          const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || user.username.slice(0, 2).toUpperCase();
          return (
            <Card key={user.id} data-testid={`card-user-${user.id}`} className="flex flex-col">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${user.isActive ? "border-green-500/40 text-green-600 bg-green-500/5" : "border-muted text-muted-foreground"}`}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {user.email}
                </p>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-10 flex-shrink-0">Role</Label>
                  <Select
                    value={user.role}
                    onValueChange={role => changeRole.mutate({ id: user.id, role })}
                    disabled={!can("ADMIN")}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid={`select-role-${user.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["SUPER_ADMIN", "ADMIN", "ANALYST", "REVIEWER", "VIEWER"] as UserRole[]).map(r => (
                        <SelectItem key={r} value={r} className="text-xs">{r.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {user.lastLoginAt
                      ? `Last login ${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}`
                      : "Never logged in"}
                  </span>
                  {can("ADMIN") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={toggleActive.isPending}
                      onClick={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}
                      data-testid={`button-toggle-user-${user.id}`}
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
            No users found
          </div>
        )}
      </div>
    </div>
  );
}

function AccessRequestsTab() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const { data: requests, isLoading } = useQuery<AccessRequest[]>({ queryKey: ["/api/access-requests"] });

  const filtered = (requests ?? []).filter(r => statusFilter === "ALL" || r.status === statusFilter);
  const pendingCount = (requests ?? []).filter(r => r.status === "PENDING").length;

  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setStatusFilter(s)}
              data-testid={`filter-requests-${s.toLowerCase()}`}
            >
              {s}
              {s === "PENDING" && pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 text-xs px-1 py-0 h-4">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No {statusFilter === "ALL" ? "" : statusFilter.toLowerCase() + " "}access requests found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(req => <AccessRequestCard key={req.id} request={req} />)}
        </div>
      )}
    </div>
  );
}

export default function UserManagement() {
  const { data: requests } = useQuery<AccessRequest[]>({ queryKey: ["/api/access-requests"] });
  const { data: users } = useQuery<AppUser[]>({ queryKey: ["/api/auth/users"] });
  const pendingCount = (requests ?? []).filter(r => r.status === "PENDING").length;
  const activeUsers = (users ?? []).filter(u => u.isActive).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage user accounts and access requests for the ADRS platform</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: users?.length ?? 0, icon: Users, color: "text-blue-500" },
          { label: "Active Users", value: activeUsers, icon: CheckCircle2, color: "text-green-500" },
          { label: "Pending Requests", value: pendingCount, icon: Clock, color: "text-yellow-500" },
          { label: "Total Requests", value: requests?.length ?? 0, icon: ClipboardList, color: "text-purple-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-1.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="access-requests" data-testid="tab-access-requests" className="relative">
            <ClipboardList className="w-4 h-4 mr-1.5" />
            Access Requests
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-xs px-1 py-0 h-4">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="w-4 h-4 mr-1.5" />
            Email Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersTab />
        </TabsContent>
        <TabsContent value="access-requests" className="mt-6">
          <AccessRequestsTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SmtpSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

