import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, ShieldCheck, FileText, RefreshCw } from "lucide-react";

const retentionSummary = [
  { label: "Retention rules", value: 12, icon: FileText },
  { label: "Overdue records", value: 9, icon: Clock },
  { label: "Under review", value: 4, icon: ShieldCheck },
  { label: "Pending deletion", value: 2, icon: RefreshCw },
];

const retentionItems = [
  { rule: "Customer data archive", system: "Salesforce", status: "Overdue", due: "2 days" },
  { rule: "Employee file cleanup", system: "Workday", status: "In review", due: "5 days" },
  { rule: "Marketing list disposal", system: "Marketo", status: "On schedule", due: "15 days" },
];

const statusClasses: Record<string, string> = {
  Overdue: "bg-red-100 text-red-700 border-red-200",
  "In review": "bg-amber-100 text-amber-700 border-amber-200",
  "On schedule": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function RetentionPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Retention & Disposal</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Track retention schedules, overdue deletion actions, and compliance status across the data estate.
            </p>
          </div>
          <Badge className="text-xs">Retention Management</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {retentionSummary.map((item) => (
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
          <CardTitle>Retention exceptions</CardTitle>
          <CardDescription>Open rules and overdue deletion tasks requiring action.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] p-4">
            <div className="space-y-4">
              {retentionItems.map((item) => (
                <div key={item.rule} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{item.rule}</p>
                      <p className="text-sm text-muted-foreground">{item.system}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusClasses[item.status] || "bg-slate-100 text-slate-700 border-slate-200 text-xs"}>{item.status}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Due {item.due}</Badge>
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
