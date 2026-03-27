import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, FolderOpen, Brain, CheckSquare, Database, Upload, FileText, Shield, BarChart3, Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type UserRole } from "@/context/auth";

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5",
  ADMIN: "border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/5",
  ANALYST: "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  REVIEWER: "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5",
  VIEWER: "border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/5",
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
      { title: "Publishing",   url: "/publishing", icon: Upload,   minRole: "ADMIN"  },
    ],
  },
  {
    group: "Governance",
    items: [
      { title: "Audit Log", url: "/audit", icon: Shield, minRole: "ADMIN" },
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">AI Data Readiness</span>
            <span className="text-xs text-muted-foreground leading-tight">ADRS Platform</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(item =>
            !item.minRole || can(item.minRole)
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.group}>
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">
                {group.group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          data-active={isActive}
                          className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                        >
                          <Link href={item.url} className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <item.icon className="w-4 h-4 flex-shrink-0" />
                              <span>{item.title}</span>
                            </span>
                            {item.badge === "pending" && stats?.pendingValidation ? (
                              <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
                                {stats.pendingValidation}
                              </Badge>
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
              <SidebarSeparator className="my-1" />
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary-foreground">{initials}</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-sidebar-foreground truncate">
                  {user.firstName} {user.lastName}
                </span>
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] w-full justify-center py-0.5 ${ROLE_COLORS[user.role] ?? ""}`}
              data-testid="badge-sidebar-role"
            >
              <Shield className="w-2.5 h-2.5 mr-1" />
              {user.role.replace("_", " ")}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-muted-foreground">?</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
