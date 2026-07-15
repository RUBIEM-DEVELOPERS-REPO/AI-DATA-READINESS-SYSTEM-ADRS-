import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckSquare, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

type Task = {
  id: string;
  title: string;
  system: string;
  due: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "In Progress" | "Review";
};

const tasks: Task[] = [
  { id: "T-2101", title: "Validate anonymisation for CRM export", system: "Salesforce", due: "Today", priority: "High", status: "Pending" },
  { id: "T-2102", title: "Review retention exception for HR archive", system: "Workday", due: "Tomorrow", priority: "Medium", status: "In Progress" },
  { id: "T-2103", title: "Approve data transfer controls for EU cloud", system: "Azure", due: "3 days", priority: "High", status: "Review" },
  { id: "T-2104", title: "Confirm access request workflow mapping", system: "ServiceNow", due: "5 days", priority: "Low", status: "Pending" },
  { id: "T-2105", title: "Investigate unexpected sync failure", system: "NetSuite", due: "Today", priority: "High", status: "In Progress" },
];

const statusStyles: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-800 border-slate-200",
  "In Progress": "bg-blue-100 text-blue-800 border-blue-200",
  Review: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function MyWorkPage() {
  const groups = useMemo(() => ({
    Pending: tasks.filter((task) => task.status === "Pending"),
    "In Progress": tasks.filter((task) => task.status === "In Progress"),
    Review: tasks.filter((task) => task.status === "Review"),
  }), []);

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Work</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              The operational task board for priority work across connected systems, findings, and remediation workflows.
            </p>
          </div>
          <Button variant="secondary" className="h-10">Create work item</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tasks due today</p>
            <p className="text-3xl font-semibold text-foreground">2</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High priority</p>
            <p className="text-3xl font-semibold text-destructive">3</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending review</p>
            <p className="text-3xl font-semibold text-foreground">1</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Object.entries(groups).map(([status, items]) => (
          <Card key={status} className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">{status}</CardTitle>
              <CardDescription>{items.length} tasks</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[420px] p-4">
                <div className="space-y-4">
                  {items.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{task.system} · due {task.due}</p>
                        </div>
                        <Badge className={statusStyles[task.status]}>{task.priority}</Badge>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tasks in this lane.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
