import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { loginSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Eye, EyeOff, Lock, Mail, User, LogIn,
  Shield, Brain, Database, CheckCircle2, Layers, Building2, ClipboardList, Send, ArrowLeft
} from "lucide-react";

type LoginForm = z.infer<typeof loginSchema>;

function parseApiError(err: any): string {
  const msg: string = err?.message ?? "";
  const match = msg.match(/^\d+: (.+)$/s);
  if (match) {
    try { return JSON.parse(match[1]).error ?? match[1]; } catch { return match[1]; }
  }
  return msg || "An unexpected error occurred";
}

const ROLE_INFO = {
  SUPER_ADMIN: { label: "Super Admin", desc: "Full system access & user management", color: "text-red-500" },
  ADMIN: { label: "Admin", desc: "Tenant-level admin, manage users & batches", color: "text-orange-500" },
  ANALYST: { label: "Analyst", desc: "Upload evidence, run extraction, publish datasets", color: "text-blue-500" },
  REVIEWER: { label: "Reviewer", desc: "Human-in-the-loop validation only", color: "text-purple-500" },
  VIEWER: { label: "Viewer", desc: "Read-only access to published datasets", color: "text-green-500" },
};

const requestAccessSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address"),
  organisation: z.string().min(1, "Organisation / department is required").max(200),
  requestedRole: z.enum(["SUPER_ADMIN", "ADMIN", "ANALYST", "REVIEWER", "VIEWER"]),
  reason: z.string().min(20, "Please provide at least 20 characters explaining why you need access").max(1000),
});
type RequestAccessForm = z.infer<typeof requestAccessSchema>;

function RequestAccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<RequestAccessForm>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: { firstName: "", lastName: "", email: "", organisation: "", requestedRole: "ANALYST", reason: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: RequestAccessForm) => {
      const res = await apiRequest("POST", "/api/access-requests", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      const msg = parseApiError(err);
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setSubmitted(false);
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Request Access
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-semibold">Request Submitted</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your access request has been sent to the system administrator.
                You will receive an email once your request has been reviewed.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full gap-2" data-testid="button-close-request-submitted">
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fill in the form below and a system administrator will review your request.
              You'll receive an email with your credentials once approved.
            </p>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField name="firstName" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Jane" data-testid="input-request-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField name="lastName" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Doe" data-testid="input-request-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField name="email" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input {...field} type="email" placeholder="you@organisation.org" className="pl-9" data-testid="input-request-email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="organisation" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organisation / Department</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input {...field} placeholder="e.g. Research & Analytics" className="pl-9" data-testid="input-request-organisation" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="requestedRole" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-request-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ROLE_INFO).map(([value, info]) => (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${info.color}`}>{info.label}</span>
                              <span className="text-xs text-muted-foreground hidden sm:inline">— {info.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value && ROLE_INFO[field.value as keyof typeof ROLE_INFO] && (
                      <p className="text-xs text-muted-foreground">
                        {ROLE_INFO[field.value as keyof typeof ROLE_INFO].desc}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="reason" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for access</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Briefly explain why you need access and what you will use the platform for..."
                        className="resize-none h-24 text-sm"
                        data-testid="textarea-request-reason"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{field.value.length}/1000 characters (minimum 20)</p>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                  <Button type="submit" size="sm" className="gap-2" disabled={mutation.isPending} data-testid="button-submit-access-request">
                    {mutation.isPending
                      ? <><span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Submitting…</>
                      : <><Send className="w-3.5 h-3.5" /> Submit Request</>}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoginForm({ onRequestAccess }: { onRequestAccess: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: (json: any) => {
      queryClient.setQueryData(["/api/auth/me"], { user: json.user });
      toast({ title: "Welcome back", description: `Signed in as ${json.user.firstName} ${json.user.lastName}` });
      navigate("/");
    },
    onError: (err: any) => {
      const msg = parseApiError(err);
      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
        <p className="text-muted-foreground text-sm mt-1">Access your ADRS workspace</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <FormField name="username" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input {...field} placeholder="your_username" className="pl-9" data-testid="input-username" autoComplete="username" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField name="password" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input {...field} type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-9 pr-9" data-testid="input-password" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-password">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div className="p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground">Default credentials</p>
            <p>Username: <code className="bg-background px-1 rounded">admin</code> · Password: <code className="bg-background px-1 rounded">Admin@12345!</code></p>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={mutation.isPending} data-testid="button-signin">
            {mutation.isPending ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Signing in…</span>
            ) : (
              <><LogIn className="w-4 h-4" /> Sign in</>
            )}
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">No account?</span>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={onRequestAccess}
        data-testid="button-request-access"
      >
        <ClipboardList className="w-4 h-4" />
        Request access from an administrator
      </Button>
    </div>
  );
}

export default function AuthPage() {
  const [showRequestAccess, setShowRequestAccess] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left panel — branding ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/90 to-primary flex-col justify-between p-12 text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="absolute rounded-full border border-primary-foreground"
              style={{ width: `${(i + 1) * 80}px`, height: `${(i + 1) * 80}px`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
          ))}
        </div>

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-foreground/15 rounded-lg backdrop-blur">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">AI Institute Africa</p>
              <p className="text-primary-foreground/70 text-xs">ADRS Platform</p>
            </div>
          </div>
        </div>

        <div className="relative space-y-6">
          <div>
            <h1 className="text-4xl font-bold leading-tight">
              AI Data Readiness<br />System
            </h1>
            <p className="text-primary-foreground/80 mt-3 leading-relaxed">
              Transform raw evidence — PDFs, scans, audio, video — into structured,
              AI-ready datasets with enterprise-grade trust validation.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: Database, label: "Evidence ingestion with SHA-256 immutability" },
              { icon: Brain, label: "AI-powered OCR, transcription & document intelligence" },
              { icon: Shield, label: "Human-in-the-loop trust validation & RBAC" },
              { icon: Layers, label: "Multi-artifact dataset publishing (ML, KG, RAG)" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <div className="p-1.5 bg-primary-foreground/10 rounded">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { label: "Evidence types", value: "9+" },
              { label: "AI models", value: "3" },
              { label: "Export formats", value: "4" },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 bg-primary-foreground/10 rounded-lg text-center backdrop-blur">
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-primary-foreground/70 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ROLE_INFO).map(([key, info]) => (
              <Badge key={key} variant="outline" className="border-primary-foreground/20 text-primary-foreground/80 text-xs">
                {info.label}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-primary-foreground/50 mt-2">Role-based access control across all features</p>
        </div>
      </div>

      {/* ── Right panel — form ───────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">AI Institute Africa</p>
              <p className="text-muted-foreground text-xs">ADRS Platform</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            <LoginForm onRequestAccess={() => setShowRequestAccess(true)} />
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            AI Institute Africa · ADRS v2.0 · Tenant TENANT-001
          </p>
        </div>
      </div>

      <RequestAccessDialog open={showRequestAccess} onClose={() => setShowRequestAccess(false)} />
    </div>
  );
}
