import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Shield, AlertTriangle, FileText } from "lucide-react";

const assessments = [
  { id: "RA-101", title: "Customer data sharing DPIA", status: "Approved", riskLevel: "Medium", owner: "Privacy Team" },
  { id: "RA-102", title: "HR onboarding workflow review", status: "Pending", riskLevel: "High", owner: "HR Ops" },
  { id: "RA-103", title: "Third-party processor assessment", status: "In Progress", riskLevel: "High", owner: "Vendor Risk" },
];

const riskStyles: Record<string, string> = {
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function RiskAssessmentsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Risk & Assessments</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Track privacy risk assessments, DPIAs, and control reviews across the organisation.
            </p>
          </div>
          <Badge className="text-xs">Risk Intelligence</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total assessments</p>
            <p className="text-3xl font-semibold text-foreground">{assessments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High risk</p>
            <p className="text-3xl font-semibold text-orange-600">{assessments.filter((item) => item.riskLevel === "High").length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open reviews</p>
            <p className="text-3xl font-semibold text-foreground">{assessments.filter((item) => item.status !== "Approved").length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle>Assessment pipeline</CardTitle>
          <CardDescription>Review current risk assessments and their owners.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] p-4">
            <div className="space-y-4">
              {assessments.map((assessment) => (
                <div key={assessment.id} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{assessment.title}</p>
                      <p className="text-sm text-muted-foreground">{assessment.id} · Owner: {assessment.owner}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={riskStyles[assessment.riskLevel]}>{assessment.riskLevel}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{assessment.status}</Badge>
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
