import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, FileText, Clock, CheckCircle2 } from "lucide-react";

const requests = [
  { id: "DSR-491", subject: "Jane Doe", type: "Access", system: "Salesforce", status: "In Progress", due: "2 days" },
  { id: "DSR-492", subject: "Acme Corp", type: "Deletion", system: "Workday", status: "Pending", due: "5 days" },
  { id: "DSR-493", subject: "John Smith", type: "Portability", system: "Google Workspace", status: "Resolved", due: "Completed" },
  { id: "DSR-494", subject: "Emma Liu", type: "Rectification", system: "ServiceNow", status: "Review", due: "Today" },
];

const statusClasses: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-800 border-slate-200",
  "In Progress": "bg-blue-100 text-blue-800 border-blue-200",
  Resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Review: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function PrivacyRightsPage() {
  const totals = useMemo(
    () => ({
      open: requests.filter((item) => item.status !== "Resolved").length,
      pending: requests.filter((item) => item.status === "Pending").length,
      overdue: requests.filter((item) => item.due === "Today" || item.due === "Overdue").length,
      systems: Array.from(new Set(requests.map((item) => item.system))).length,
    }),
    []
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Privacy Rights</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Track and manage data subject requests across systems, deadlines and status updates.
            </p>
          </div>
          <Badge className="text-xs">Cross-System DSR Monitoring</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open requests</p>
            <p className="text-3xl font-semibold text-foreground">{totals.open}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="text-3xl font-semibold text-blue-600">{totals.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Due today</p>
            <p className="text-3xl font-semibold text-destructive">{totals.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Systems covered</p>
            <p className="text-3xl font-semibold text-foreground">{totals.systems}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Recent Data Subject Requests</CardTitle>
          <CardDescription>Requests that require attention from the privacy team.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] p-4">
            <div className="space-y-4">
              {requests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">{request.type} request for {request.subject}</p>
                      <p className="text-sm text-muted-foreground">{request.system} · {request.id}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusClasses[request.status]}>{request.status}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Due {request.due}</Badge>
                    </div>
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
