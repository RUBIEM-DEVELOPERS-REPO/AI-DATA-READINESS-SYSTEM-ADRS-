import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, FolderOpen, Brain, CheckSquare, Database, Upload, FileText, Shield, BarChart3, Settings, ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

const navItems = [
  {
    group: "Core Pipeline",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Evidence", url: "/evidence", icon: FolderOpen },
      { title: "Intelligence", url: "/intelligence", icon: Brain },
      { title: "Validation", url: "/validation", icon: CheckSquare, badge: "pending" },
    ],
  },
  {
    group: "Data Layer",
    items: [
      { title: "CDM Explorer", url: "/cdm", icon: Database },
      { title: "Publishing", url: "/publishing", icon: Upload },
    ],
  },
  {
    group: "Governance",
    items: [
      { title: "Audit Log", url: "/audit", icon: Shield },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: stats } = useQuery<{ pendingValidation: number }>({
    queryKey: ["/api/dashboard/stats"],
  });

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
        {navItems.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">
              {group.group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
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
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary-foreground">W</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-sidebar-foreground truncate">Wills</span>
            <span className="text-xs text-muted-foreground truncate">Project Lead</span>
          </div>
          <div className="w-2 h-2 rounded-full bg-status-online flex-shrink-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
