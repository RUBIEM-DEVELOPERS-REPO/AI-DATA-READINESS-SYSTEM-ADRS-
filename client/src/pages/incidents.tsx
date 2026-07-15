import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Shield, Clock, Zap } from "lucide-react";

const incidentCounts = [
  { label: "Open Incidents", value: 3, icon: AlertTriangle, className: "text-red-600" },
  { label: "Under Review", value: 2, icon: Shield, className: "text-orange-600" },
  { label: "Containment Actions", value: 4, icon: Zap, className: "text-emerald-600" },
  { label: "Outstanding", value: 1, icon: Clock, className: "text-slate-600" },
];

const incidents = [
  { id: "INC-310", title: "Unauthorized export of customer PII", system: "Salesforce", severity: "Critical", status: "Open" },
  { id: "INC-311", title: "Retention rule failure on archived HR files", system: "Workday", severity: "High", status: "Under Review" },
  { id: "INC-312", title: "External analytics access policy gap", system: "Looker", severity: "Medium", status: "Open" },
];

const severityStyles: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function IncidentsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Incidents & Breaches</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Operational view of privacy incidents, containment status, and response actions.
            </p>
          </div>
          <Badge className="text-xs">Incident Response</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {incidentCounts.map((item) => (
          <Card key={item.label} className="border-border/50 bg-card/40">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${item.className}`} />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              </div>
              <p className="text-3xl font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Recent Incidents</CardTitle>
          <CardDescription>Review open incidents, severity and system impact.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[480px] p-4">
            <div className="space-y-4">
              {incidents.map((incident) => (
                <div key={incident.id} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{incident.title}</p>
                      <p className="text-sm text-muted-foreground">{incident.system} · {incident.id}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={severityStyles[incident.severity]}>{incident.severity}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{incident.status}</Badge>
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
