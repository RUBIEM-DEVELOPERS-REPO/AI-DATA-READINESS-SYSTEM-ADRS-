import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { registerSchema, loginSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, Lock, Mail, User, UserPlus, LogIn,
  Shield, Brain, Database, CheckCircle2, AlertCircle, ChevronRight, Layers
} from "lucide-react";

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

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

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Special character", ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];

  if (!password) return null;
  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score - 1] : "bg-border"}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-1 text-xs ${c.ok ? "text-chart-3" : "text-muted-foreground"}`}>
            <CheckCircle2 className={`w-3 h-3 ${c.ok ? "text-chart-3" : "text-border"}`} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
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

      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <button onClick={onSwitch} className="text-primary font-medium hover:underline" data-testid="link-switch-to-register">
          Request access
        </button>
      </p>
    </div>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "", email: "", password: "", confirmPassword: "",
      firstName: "", lastName: "", role: "ANALYST",
    },
  });

  const password = form.watch("password");

  const mutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account created", description: "Your account is ready. Sign in to get started." });
      onSwitch();
    },
    onError: (err: any) => {
      const raw = err?.message ?? "";
      const match = raw.match(/^\d+: (.+)$/s);
      if (match) {
        try {
          const json = JSON.parse(match[1]);
          if (json.field === "username") return form.setError("username", { message: json.error });
          if (json.field === "email") return form.setError("email", { message: json.error });
          toast({ title: "Registration failed", description: json.error ?? "Please try again", variant: "destructive" });
          return;
        } catch {}
      }
      toast({ title: "Registration failed", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Create account</h2>
        <p className="text-muted-foreground text-sm mt-1">Join your organisation's ADRS workspace</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField name="firstName" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="John" data-testid="input-first-name" autoComplete="given-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField name="lastName" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Doe" data-testid="input-last-name" autoComplete="family-name" />
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
                  <Input {...field} type="email" placeholder="you@organisation.org" className="pl-9" data-testid="input-email" autoComplete="email" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField name="username" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input {...field} placeholder="john_doe" className="pl-9" data-testid="input-username-register" autoComplete="username" />
                </div>
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, underscores only</p>
            </FormItem>
          )} />

          <FormField name="role" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-role">
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
              <FormMessage />
              {field.value && ROLE_INFO[field.value as keyof typeof ROLE_INFO] && (
                <p className="text-xs text-muted-foreground mt-1">
                  {ROLE_INFO[field.value as keyof typeof ROLE_INFO].desc}
                </p>
              )}
            </FormItem>
          )} />

          <FormField name="password" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input {...field} type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-9 pr-9" data-testid="input-new-password" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <PasswordStrength password={password} />
              <FormMessage />
            </FormItem>
          )} />

          <FormField name="confirmPassword" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input {...field} type={showConfirm ? "text" : "password"} placeholder="••••••••" className="pl-9 pr-9" data-testid="input-confirm-password" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <Button type="submit" className="w-full gap-2" disabled={mutation.isPending} data-testid="button-register">
            {mutation.isPending ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Creating account…</span>
            ) : (
              <><UserPlus className="w-4 h-4" /> Create account</>
            )}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button onClick={onSwitch} className="text-primary font-medium hover:underline" data-testid="link-switch-to-login">
          Sign in
        </button>
      </p>
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left panel — branding ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/90 to-primary flex-col justify-between p-12 text-primary-foreground overflow-hidden">
        {/* Background pattern */}
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
          {/* Mobile logo */}
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
            {mode === "login" ? (
              <LoginForm onSwitch={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitch={() => setMode("login")} />
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            AI Institute Africa · ADRS v2.0 · Tenant TENANT-001
          </p>
        </div>
      </div>
    </div>
  );
}
