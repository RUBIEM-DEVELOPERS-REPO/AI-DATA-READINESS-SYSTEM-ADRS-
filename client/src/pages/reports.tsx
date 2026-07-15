import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, FileText, ClipboardList, ShieldCheck } from "lucide-react";

const reports = [
  { title: "Connected Systems Compliance", type: "Executive Summary", updated: "Today" },
  { title: "Retention Review Report", type: "Retention", updated: "Yesterday" },
  { title: "DSR Activity Summary", type: "Rights Request", updated: "3 days ago" },
  { title: "Third-Party Risk Report", type: "Vendor", updated: "Last week" },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Generate governance, compliance and executive reports from integrated system intelligence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Create report</Button>
            <Badge className="text-xs">Regulatory-ready</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Available reports</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">{reports.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">2</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance quality</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">96%</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Exported</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">14</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Recent reports</CardTitle>
          <CardDescription>Latest generated and scheduled reports for compliance reviews.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[440px] p-4">
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{report.title}</p>
                      <p className="text-sm text-muted-foreground">{report.type}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Updated {report.updated}</p>
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
