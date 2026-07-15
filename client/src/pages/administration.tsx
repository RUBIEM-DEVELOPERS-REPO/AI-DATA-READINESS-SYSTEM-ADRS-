import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, User, Settings, ServerCog } from "lucide-react";

const adminMetrics = [
  { label: "Connectors", value: 12, icon: ServerCog },
  { label: "Users", value: 28, icon: User },
  { label: "Roles", value: 6, icon: Shield },
  { label: "Policies", value: 14, icon: Settings },
];

const adminTasks = [
  { title: "Review connector health dashboard", type: "Monitoring", status: "Pending" },
  { title: "Approve new user role requests", type: "User admin", status: "In Progress" },
  { title: "Update system settings for EU region", type: "Configuration", status: "Pending" },
];

export default function AdministrationPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Administration</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Technical administration, connector management, and organisation-level compliance settings.
            </p>
          </div>
          <Button size="sm">Open admin settings</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {adminMetrics.map((item) => (
          <Card key={item.label} className="border-border/50 bg-card/40">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-primary" />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              </div>
              <p className="text-3xl font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Admin actions</CardTitle>
          <CardDescription>Tasks that require administrative attention.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] p-4">
            <div className="space-y-4">
              {adminTasks.map((task) => (
                <div key={task.title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{task.title}</p>
                      <p className="text-sm text-muted-foreground">{task.type}</p>
                    </div>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{task.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

    </div>
  );
}
