import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ShieldCheck, Archive, ClipboardList } from "lucide-react";

const policyItems = [
  { title: "Data Protection Policy", status: "Published", updated: "2 days ago" },
  { title: "Third-Party Data Sharing", status: "Review", updated: "1 week ago" },
  { title: "Retention & Disposal Policy", status: "Published", updated: "3 weeks ago" },
];

const evidenceItems = [
  { title: "Consent dashboard report", type: "Report", status: "Available" },
  { title: "Retention exception log", type: "Audit", status: "Pending" },
  { title: "Incident investigation package", type: "Evidence", status: "Available" },
];

export default function PoliciesPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Policies & Evidence</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Organise privacy policies, evidence artifacts and supporting documentation for audit readiness.
            </p>
          </div>
          <Badge className="text-xs">Governance & Evidence</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Policies</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">{policyItems.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidence items</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">{evidenceItems.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance-ready</p>
            </div>
            <p className="text-3xl font-semibold text-foreground">92%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/50 bg-card/40">
          <CardHeader>
            <CardTitle>Policies</CardTitle>
            <CardDescription>Latest published and in-review documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[420px] p-4">
              <div className="space-y-4">
                {policyItems.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">Updated {item.updated}</p>
                      </div>
                      <Badge className={item.status === "Published" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardHeader>
            <CardTitle>Evidence artifacts</CardTitle>
            <CardDescription>Core evidence supporting compliance controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[420px] p-4">
              <div className="space-y-4">
                {evidenceItems.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.type}</p>
                      </div>
                      <Badge className={item.status === "Available" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
