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
import AuditLog from "@/pages/audit";
import UserManagement from "@/pages/users";
import AuthPage from "@/pages/auth";
import { useEffect, useState } from "react";
import { Moon, Sun, LogOut, ChevronDown, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
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
  SUPER_ADMIN: "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5",
  ADMIN: "border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/5",
  ANALYST: "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  REVIEWER: "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5",
  VIEWER: "border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/5",
};

function UserMenu() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-8 px-2" data-testid="button-user-menu">
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-xs font-medium leading-none">{user.firstName} {user.lastName}</span>
          </div>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
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
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-50 h-12">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="h-8 w-8" />
              <span className="text-xs text-muted-foreground hidden sm:block">AI Institute Africa</span>
            </div>
            <div className="flex items-center gap-2">
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
              <Route path="/audit">
                {() => <RoleGuard minRole="ADMIN" component={AuditLog} />}
              </Route>
              <Route path="/users">
                {() => <RoleGuard minRole="ADMIN" component={UserManagement} />}
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
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
