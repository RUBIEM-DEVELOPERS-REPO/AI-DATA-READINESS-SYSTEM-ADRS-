import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Evidence from "@/pages/evidence";
import Intelligence from "@/pages/intelligence";
import Validation from "@/pages/validation";
import CdmExplorer from "@/pages/cdm";
import Publishing from "@/pages/publishing";
import AuditLog from "@/pages/audit";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setDark((d) => !d)}
      data-testid="button-theme-toggle"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/evidence" component={Evidence} />
      <Route path="/intelligence" component={Intelligence} />
      <Route path="/validation" component={Validation} />
      <Route path="/cdm" component={CdmExplorer} />
      <Route path="/publishing" component={Publishing} />
      <Route path="/audit" component={AuditLog} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-online"></span>
                    <span>TENANT-001</span>
                  </div>
                  <ThemeToggle />
                </div>
              </header>
              <main className="flex-1 overflow-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
