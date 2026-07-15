import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Search, Shield, ShieldCheck } from "lucide-react";

type Finding = {
  id: string;
  title: string;
  category: string;
  risk: "Critical" | "High" | "Medium" | "Low";
  system: string;
  status: "Open" | "In Review" | "Resolved";
};

const findings: Finding[] = [
  { id: "F-1023", title: "Unencrypted personal identifiers found in CRM exports", category: "Data Security", risk: "Critical", system: "Salesforce", status: "Open" },
  { id: "F-1024", title: "Retention rule mismatch on archived HR records", category: "Retention", risk: "High", system: "Workday", status: "In Review" },
  { id: "F-1025", title: "Sensitive health metadata exposed in BI dashboards", category: "Sensitive Data", risk: "High", system: "Tableau", status: "Open" },
  { id: "F-1026", title: "Incomplete lawful basis logging for lead generation", category: "Lawful Basis", risk: "Medium", system: "Marketo", status: "Resolved" },
  { id: "F-1027", title: "Unindexed PSI records in analytics pipeline", category: "Privacy Impact", risk: "Low", system: "Snowflake", status: "Open" },
];

const riskColors: Record<string, string> = {
  Critical: "bg-red-500/10 text-red-600 border-red-500/20",
  High: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  Medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  Low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

export default function FindingsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => findings.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.system.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
    ),
    [query]
  );

  const summary = useMemo(
    () => ({
      total: findings.length,
      critical: findings.filter((item) => item.risk === "Critical").length,
      high: findings.filter((item) => item.risk === "High").length,
      unresolved: findings.filter((item) => item.status !== "Resolved").length,
    }),
    []
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-background p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Findings & Alerts</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Visibility into privacy findings, system alerts and compliance issues from all connected systems.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row items-start sm:items-center">
            <Badge className="text-xs">25 Total Findings</Badge>
            <Badge className="text-xs">5 Critical</Badge>
            <Badge className="text-xs">3 Resolved today</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Findings</p>
            <p className="text-3xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="text-3xl font-semibold text-destructive">{summary.critical}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High Risk</p>
            <p className="text-3xl font-semibold text-orange-600">{summary.high}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unresolved</p>
            <p className="text-3xl font-semibold text-foreground">{summary.unresolved}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Active Findings</CardTitle>
            <CardDescription>Search by title, system, or category to find the next item that needs action.</CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search findings..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full"
              aria-label="Search findings"            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[480px] p-4">
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">
                  No findings match your search.
                </div>
              ) : (
                filtered.map((finding) => (
                  <div key={finding.id} className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge className={riskColors[finding.risk]}>{finding.risk}</Badge>
                          <Badge variant="outline" className="text-xs">{finding.status}</Badge>
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">{finding.title}</h2>
                        <p className="text-sm text-muted-foreground">{finding.category} · {finding.system}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase text-muted-foreground">Finding ID</p>
                        <p className="font-mono text-sm text-foreground">{finding.id}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
