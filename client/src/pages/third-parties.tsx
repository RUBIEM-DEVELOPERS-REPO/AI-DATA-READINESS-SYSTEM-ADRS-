import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, FileText, Globe, ShieldCheck } from "lucide-react";

const processors = [
  { name: "Acme Data Services", type: "Processor", jurisdiction: "EU", status: "Compliant" },
  { name: "CloudSync Ltd.", type: "Sub-processor", jurisdiction: "US", status: "Review" },
  { name: "MetricsHub", type: "Processor", jurisdiction: "APAC", status: "Compliant" },
];

const statusMap: Record<string, string> = {
  Compliant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Review: "bg-amber-100 text-amber-700 border-amber-200",
  NonCompliant: "bg-red-100 text-red-700 border-red-200",
};

export default function ThirdPartiesPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Third Parties</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Track processor and sub-processor relationships, contract status, and transfer jurisdictions.
            </p>
          </div>
          <Badge className="text-xs">Processor Registry</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active processors</p>
            <p className="text-3xl font-semibold text-foreground">{processors.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviewed this quarter</p>
            <p className="text-3xl font-semibold text-foreground">2</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cross-border processors</p>
            <p className="text-3xl font-semibold text-foreground">3</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Processor relationships</CardTitle>
          <CardDescription>Active third parties and their compliance status.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] p-4">
            <div className="space-y-4">
              {processors.map((processor) => (
                <div key={processor.name} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{processor.name}</p>
                      <p className="text-sm text-muted-foreground">{processor.type} · {processor.jurisdiction}</p>
                    </div>
                    <Badge className={statusMap[processor.status] ?? "bg-slate-100 text-slate-700 border-slate-200 text-xs"}>{processor.status}</Badge>
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
