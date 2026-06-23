import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth, type UserRole } from "@/context/auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Evidence from "@/pages/evidence";
import Intelligence from "@/pages/intelligence";
import Validation from "@/pages/validation";
import CdmExplorer from "@/pages/cdm";
import Publishing from "@/pages/publishing";
import KgVisualizer from "@/pages/kg-visualizer";
import AuditLog from "@/pages/audit";
import UserManagement from "@/pages/users";
import AuthPage from "@/pages/auth";
import Catalogue from "@/pages/catalogue";
import Evaluate from "@/pages/evaluate";
import IntelligenceLayer from "@/pages/intelligence-layer";
import { useEffect, useState } from "react";
import { Moon, Sun, LogOut, ChevronDown, Shield, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { AiCopilot } from "@/components/ai-copilot";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  ANALYST: "Analyst",
  REVIEWER: "Reviewer",
  VIEWER: "Viewer",
};

function AccessDenied({ requiredRole }: { requiredRole: UserRole }) {
  const { user } = useAuth();
  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="text-center max-w-sm space-y-5">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-2">
            This section requires at least the <strong>{ROLE_LABEL[requiredRole]}</strong> role.
            Your current role is <strong>{user ? ROLE_LABEL[user.role] : "Unknown"}</strong>.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Contact your system administrator if you believe you should have access.
        </p>
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-go-to-dashboard">
            Go to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

function RoleGuard({ minRole, component: Component }: { minRole: UserRole; component: React.ComponentType }) {
  const { can } = useAuth();
  if (!can(minRole)) return <AccessDenied requiredRole={minRole} />;
  return <Component />;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  return (
    <Button size="icon" variant="ghost" onClick={() => setDark(d => !d)} data-testid="button-theme-toggle" aria-label="Toggle theme">
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "border-destructive/40 text-destructive bg-destructive/10",
  ADMIN: "border-primary/40 text-primary bg-primary/10",
  ANALYST: "border-blue-500/40 text-blue-500 bg-blue-500/10",
  REVIEWER: "border-accent/40 text-accent bg-accent/10",
  VIEWER: "border-green-500/40 text-green-500 bg-green-500/10",
};

function UserMenu() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  if (!user) return null;

  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || user.username.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // logout() always redirects even on error, so nothing to handle here
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-3 h-10 px-3 hover:bg-primary/5 rounded-xl transition-all" data-testid="button-user-menu">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shadow-sm">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-sm font-semibold leading-none">{user.firstName} {user.lastName}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 font-medium">{user.role.replace("_", " ")}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="py-2">
            <p className="font-medium">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-muted-foreground font-normal truncate">{user.email}</p>
            <Badge variant="outline" className={`text-xs mt-1 ${ROLE_COLORS[user.role] ?? ""}`} data-testid="badge-user-role">
              <Shield className="w-2.5 h-2.5 mr-1" />
              {user.role.replace("_", " ")}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-muted-foreground cursor-default" data-testid="menu-tenant">
            <span className="w-1.5 h-1.5 rounded-full bg-chart-3 mr-2" />
            Tenant: {user.tenantId}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowChangePassword(true)}
            className="cursor-pointer"
            data-testid="button-change-password"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            Change Password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive cursor-pointer"
            data-testid="button-logout"
            disabled={signingOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        mandatory={false}
      />
    </>
  );
}

function MandatoryPasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return (
    <>
      {children}
      <ChangePasswordDialog open={!!user.mustChangePassword} mandatory={true} />
    </>
  );
}

function ProtectedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [location] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && location !== "/auth") {
      navigate("/auth");
    }
  }, [isLoading, isAuthenticated, location, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading ADRS…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <MandatoryPasswordChangeGate>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full bg-background relative overflow-hidden">
          {/* Animated Background Mesh */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] animate-float" />
            <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] rounded-full bg-accent/10 blur-[120px] animate-float" style={{ animationDelay: '2s' }} />
          </div>
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 relative z-10">
            <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/40 backdrop-blur-xl sticky top-0 z-50 h-16 shadow-sm">
              <div className="flex items-center gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="h-8 w-8" />
                <span className="text-sm font-medium text-muted-foreground hidden sm:block ml-2">AI Institute Africa</span>
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <UserMenu />
              </div>
            </header>
            <main className="flex-1 overflow-auto">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/evidence">
                  {() => <RoleGuard minRole="ANALYST" component={Evidence} />}
                </Route>
                <Route path="/intelligence">
                  {() => <RoleGuard minRole="ANALYST" component={Intelligence} />}
                </Route>
                <Route path="/validation">
                  {() => <RoleGuard minRole="REVIEWER" component={Validation} />}
                </Route>
                <Route path="/cdm">
                  {() => <RoleGuard minRole="ANALYST" component={CdmExplorer} />}
                </Route>
                <Route path="/publishing">
                  {() => <RoleGuard minRole="ADMIN" component={Publishing} />}
                </Route>
                <Route path="/graph">
                  {() => <RoleGuard minRole="ANALYST" component={KgVisualizer} />}
                </Route>
                <Route path="/graph/:datasetId">
                  {() => <RoleGuard minRole="ANALYST" component={KgVisualizer} />}
                </Route>
                <Route path="/audit">
                  {() => <RoleGuard minRole="ADMIN" component={AuditLog} />}
                </Route>
                <Route path="/users">
                  {() => <RoleGuard minRole="ADMIN" component={UserManagement} />}
                </Route>
                <Route path="/catalogue">
                  {() => <RoleGuard minRole="ANALYST" component={Catalogue} />}
                </Route>
                <Route path="/evaluate">
                  {() => <RoleGuard minRole="ANALYST" component={Evaluate} />}
                </Route>
                <Route path="/intelligence-layer">
                  {() => <RoleGuard minRole="ANALYST" component={IntelligenceLayer} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
          <AiCopilot />
        </div>
      </SidebarProvider>
    </MandatoryPasswordChangeGate>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/auth") {
      navigate("/");
    }
  }, [isLoading, isAuthenticated, location, navigate]);

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
