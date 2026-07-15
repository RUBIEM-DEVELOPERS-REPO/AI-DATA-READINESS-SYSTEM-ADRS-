import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, FolderOpen, Brain, CheckSquare, Database, Upload, FileText, Shield, BarChart3, Users, BookOpen, Target, GitBranch, Cpu, Bot
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type UserRole } from "@/context/auth";

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "border-destructive/40 text-destructive bg-destructive/10",
  ADMIN: "border-primary/40 text-primary bg-primary/10",
  DATA_CONTROLLER: "border-cyan-500/40 text-cyan-500 bg-cyan-500/10",
  DATA_PROTECTION_OFFICER: "border-sky-500/40 text-sky-500 bg-sky-500/10",
  ANALYST: "border-blue-500/40 text-blue-500 bg-blue-500/10",
  REVIEWER: "border-accent/40 text-accent bg-accent/10",
  VIEWER: "border-green-500/40 text-green-500 bg-green-500/10",
  REGULATOR: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
};

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: "pending";
  minRole?: UserRole;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    group: "Core Pipeline",
    items: [
      { title: "Dashboard",    url: "/",            icon: LayoutDashboard },
      { title: "Evidence",     url: "/evidence",    icon: FolderOpen,  minRole: "ANALYST" },
      { title: "Intelligence", url: "/intelligence",icon: Brain,        minRole: "ANALYST" },
      { title: "Validation",   url: "/validation",  icon: CheckSquare, minRole: "REVIEWER", badge: "pending" },
    ],
  },
  {
    group: "Data Layer",
    items: [
      { title: "CDM Explorer", url: "/cdm",        icon: Database, minRole: "ANALYST" },
      { title: "Data Catalogue", url: "/catalogue", icon: BookOpen, minRole: "ANALYST" },
      { title: "Publishing",   url: "/publishing", icon: Upload,   minRole: "ADMIN"  },
    ],
  },
  {
    group: "AI Intelligence",
    items: [
      { title: "Feature Representation", url: "/feature-representation", icon: Cpu,       minRole: "ANALYST" },
      { title: "Intelligence Insights",  url: "/intelligence-layer",     icon: GitBranch, minRole: "ANALYST" },
      { title: "Agent Console",         url: "/agent-layer",            icon: Bot,       minRole: "ANALYST" },
      { title: "Evaluation Hub",        url: "/evaluate",               icon: Target,    minRole: "ANALYST" },
    ],
  },
  {
    group: "Governance",
    items: [
      { title: "Audit Log", url: "/audit", icon: Shield, minRole: "ADMIN" },
      { title: "Registry", url: "/registry", icon: Database, minRole: "DATA_CONTROLLER" },
    ],
  },
  {
    group: "Supervision",
    items: [
      { title: "Regulator Hub", url: "/regulator", icon: Shield, minRole: "REGULATOR" },
    ],
  },
  {
    group: "Administration",
    items: [
      { title: "User Management", url: "/users", icon: Users, minRole: "ADMIN" },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, can } = useAuth();
  const { data: stats } = useQuery<{ pendingValidation: number }>({
    queryKey: ["/api/dashboard/stats"],
  });

  const initials = user
    ? (`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || user.username.slice(0, 2).toUpperCase())
    : "??";

  const isPortalRole = user?.role === "DATA_CONTROLLER" || user?.role === "DATA_PROTECTION_OFFICER";
  const isRegulatorRole = user?.role === "REGULATOR";

  const activeNavGroups: NavGroup[] = isPortalRole
    ? [
        {
          group: "Privacy Command Centre",
          items: [
            { title: "Overview", url: "/", icon: LayoutDashboard },
            { title: "Connected Systems", url: "/connected-systems", icon: Database },
            { title: "Findings & Alerts", url: "/findings", icon: Shield },
            { title: "My Work", url: "/my-work", icon: CheckSquare },
          ],
        },
        {
          group: "Operations",
          items: [
            { title: "Data & Processing", url: "/data-processing", icon: BookOpen },
            { title: "Privacy Rights", url: "/privacy-rights", icon: Users },
            { title: "Incidents & Breaches", url: "/incidents", icon: Target },
            { title: "Risk & Assessments", url: "/risk-assessments", icon: BarChart3 },
            { title: "Third Parties", url: "/third-parties", icon: Cpu },
            { title: "Retention & Disposal", url: "/retention", icon: Upload },
            { title: "Policies & Evidence", url: "/policies", icon: FileText },
          ],
        },
        {
          group: "Reporting & Admin",
          items: [
            { title: "Reports", url: "/reports", icon: BarChart3 },
            { title: "Administration", url: "/administration", icon: Shield },
          ],
        },
      ]
    : isRegulatorRole
    ? [
        {
          group: "Authority Portal",
          items: [
            { title: "Authority Dashboard", url: "/", icon: Shield },
            { title: "Supervision Hub", url: "/regulator", icon: Shield },
          ],
        },
      ]
    : navGroups;

  return (
    <Sidebar variant="floating" aria-label="Primary navigation" className="m-4 h-[calc(100vh-2rem)] rounded-2xl glass-panel overflow-hidden border-0 shadow-2xl">
      <SidebarHeader className="p-5 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-[0_8px_24px_rgba(15,23,42,0.08)] relative group overflow-hidden">
            <div className="absolute inset-0 bg-primary/20 blur-md group-hover:bg-primary/40 transition-colors duration-500" />
            <BarChart3 className="w-5 h-5 text-primary relative z-10" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-tight truncate tracking-wide">IntelliNexus</span>
            <span className="text-[10px] text-primary font-semibold tracking-[0.2em] uppercase leading-tight mt-0.5">Control Plane</span>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
          <Shield className="w-3.5 h-3.5" />
          Secure administration workspace
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4">
        {activeNavGroups.map((group) => {
          const visibleItems = group.items.filter(item => {
            return !item.minRole || can(item.minRole);
          });
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.group}>
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">
                {group.group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <nav aria-label={group.group}>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            data-active={isActive}
                            className={`data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold hover:bg-muted/40 rounded-xl transition-all duration-200 py-5 my-1 relative group overflow-hidden ${isActive ? 'shadow-[inset_3px_0_0_0_hsl(var(--primary))]' : ''}`}
                          >
                            <Link href={item.url} aria-current={isActive ? "page" : undefined} aria-label={`${item.title} page`} className="flex items-center justify-between w-full relative z-10 px-2">
                            <span className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg transition-all duration-300 ${isActive ? 'bg-primary/20 text-primary scale-110 shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'bg-transparent text-muted-foreground group-hover:bg-muted group-hover:text-foreground group-hover:scale-105'}`}>
                                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                              </div>
                              <span className="text-[13px] tracking-wide">{item.title}</span>
                            </span>
                            {item.badge === "pending" && stats?.pendingValidation ? (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0.5 h-5 min-w-5 flex items-center justify-center rounded-full animate-pulse">
                                {stats.pendingValidation}
                              </Badge>
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  </SidebarMenu>
                </nav>
              </SidebarGroupContent>
              <SidebarSeparator className="my-1" />
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/20 p-4">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/70 px-3 py-2">
              <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-sm font-bold text-primary">{initials}</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-foreground truncate tracking-wide">
                  {user.firstName} {user.lastName}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">{user.email}</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.35)]" />
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-[0.2em] w-full justify-center py-1.5 rounded-full ${ROLE_COLORS[user.role] ?? ""}`}
              data-testid="badge-sidebar-role"
            >
              <Shield className="w-3 h-3 mr-1.5" />
              {user.role.replace("_", " ")}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 animate-pulse">
              <span className="text-sm text-muted-foreground">?</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1 space-y-1">
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-2 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
