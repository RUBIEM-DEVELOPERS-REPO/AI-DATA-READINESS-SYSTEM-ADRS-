import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, FileText, ShieldCheck, Users, Zap } from "lucide-react";

const processors = [
  { label: "Data Entities", value: 142, icon: Users },
  { label: "Processing Activities", value: 18, icon: Zap },
  { label: "Lawful Bases", value: 7, icon: ShieldCheck },
  { label: "Consent Records", value: 324, icon: FileText },
];

const ropas = [
  { title: "Customer Profiling", controller: "Marketing", status: "Review", basis: "Legitimate Interest" },
  { title: "Payroll Management", controller: "HR", status: "Approved", basis: "Contract" },
  { title: "Security Monitoring", controller: "Security", status: "Approved", basis: "Legal Obligation" },
];

export default function DataProcessingPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Data & Processing</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Cross-system inventory of processing activities, legal bases, and consent status.
            </p>
          </div>
          <Badge className="text-xs">Phase 1 Core Operations</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {processors.map((item) => (
          <Card key={item.label} className="border-border/50 bg-card/40">
            <CardContent className="space-y-3 p-5">
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
          <CardTitle>Records of Processing Activities</CardTitle>
          <CardDescription>Active ROPAs and their compliance status</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[440px] p-4">
            <div className="space-y-4">
              {ropas.map((ropa) => (
                <div key={ropa.title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">{ropa.title}</p>
                      <p className="text-sm text-muted-foreground">Controller: {ropa.controller}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-xs">{ropa.basis}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{ropa.status}</Badge>
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
