import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, Zap, GitBranch, Shield, CheckCircle2 } from "lucide-react";

const PROFILES = [
  {
    id: "profile-generic",
    name: "Generic Document",
    color: "from-blue-500/20 to-blue-600/5 border-blue-500/20",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    similarity: 72,
    description: "A general-purpose document without specific financial or employment structure. Includes correspondence, memos, forms, and agreements.",
    targetEntities: ["PERSON", "ORGANIZATION"],
    weights: [{ field: "name", weight: "1.0×" }, { field: "email", weight: "1.0×" }],
  },
  {
    id: "profile-finance",
    name: "Financial Record",
    color: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    similarity: 91,
    description: "A financial or transactional document involving money, goods, or services — invoices, receipts, bank statements, quotations.",
    targetEntities: ["ORGANIZATION", "TRANSACTION"],
    weights: [{ field: "amount", weight: "1.5×" }, { field: "invoice_number", weight: "1.5×" }, { field: "tax_number", weight: "1.2×" }, { field: "bank_account", weight: "1.5×" }],
  },
  {
    id: "profile-hr",
    name: "HR & Employment",
    color: "from-violet-500/20 to-violet-600/5 border-violet-500/20",
    badge: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    similarity: 85,
    description: "A human resources or identity document — CVs, payslips, national IDs, passports, certificates, and work permits.",
    targetEntities: ["PERSON", "SKILL", "ROLE"],
    weights: [{ field: "national_id", weight: "2.0×" }, { field: "email", weight: "1.5×" }, { field: "phone", weight: "1.2×" }],
  },
];

const ONTOLOGY_AXIOMS = [
  { relationship: "ISSUED_BY", sources: "DOCUMENT, TRANSACTION", targets: "ORGANIZATION, PERSON", autoCorrect: "—" },
  { relationship: "ISSUED_TO", sources: "DOCUMENT, TRANSACTION", targets: "ORGANIZATION, PERSON", autoCorrect: "—" },
  { relationship: "EMPLOYED_BY", sources: "PERSON", targets: "ORGANIZATION", autoCorrect: "—" },
  { relationship: "SUBJECT_OF", sources: "PERSON, ORGANIZATION, ASSET", targets: "DOCUMENT", autoCorrect: "MENTIONED_IN" },
  { relationship: "SIGNED_BY", sources: "DOCUMENT, AGREEMENT, CONTRACT", targets: "PERSON, ORGANIZATION", autoCorrect: "—" },
  { relationship: "MENTIONED_IN", sources: "PERSON, ORGANIZATION, TRANSACTION, ASSET", targets: "DOCUMENT", autoCorrect: "—" },
];

export default function IntelligenceLayer() {
  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            AI Intelligence Layer — Layer 5
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Attention, Fusion & Context — where raw AI probability meets structured business logic.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Moonshot Active
        </Badge>
      </div>

      {/* Section 1 – Dynamic Attention */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Zero-Shot Semantic Profile Matching</h2>
            <p className="text-xs text-muted-foreground">
              Each incoming document is embedded into vector space and compared against profile semantic descriptions using cosine similarity. The best-matching profile dynamically weights field confidence scores.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROFILES.map((p) => (
            <Card key={p.id} className={`glass-panel border bg-gradient-to-br ${p.color} relative overflow-hidden hover:-translate-y-1 transition-all duration-300`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold">{p.name}</CardTitle>
                  <Badge variant="outline" className={`text-[10px] ${p.badge}`}>{p.similarity}% match</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Target Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {p.targetEntities.map(e => (
                      <Badge key={e} variant="outline" className="text-[10px] bg-background/40">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Relevance Weights</p>
                  <div className="space-y-1">
                    {p.weights.map(w => (
                      <div key={w.field} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{w.field}</span>
                        <span className="font-bold text-foreground">{w.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Semantic Similarity</p>
                  <Progress value={p.similarity} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 2 – Neuro-Symbolic */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-bold">Neuro-Symbolic Ontology Engine</h2>
            <p className="text-xs text-muted-foreground">
              All AI-inferred Knowledge Graph relationships are validated against strict Subject–Predicate–Object axioms before being stored. Violations are automatically corrected or rejected.
            </p>
          </div>
          <Badge variant="outline" className="ml-auto text-xs gap-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Engine Active
          </Badge>
        </div>

        <Card className="glass-panel border-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Relationship", "Allowed Sources", "Allowed Targets", "Auto-Correct To"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ONTOLOGY_AXIOMS.map((axiom, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20">{axiom.relationship}</Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">{axiom.sources}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">{axiom.targets}</td>
                      <td className="py-3 px-4">
                        {axiom.autoCorrect === "—"
                          ? <span className="text-xs text-muted-foreground/50">—</span>
                          : <Badge variant="outline" className="font-mono text-[10px] bg-amber-500/5 text-amber-400 border-amber-500/20">{axiom.autoCorrect}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Ontology Violation Log
            </CardTitle>
            <CardDescription className="text-xs">Relationships rejected or corrected by the symbolic reasoner.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold">No Violations Detected</p>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                All inferred relationships passed ontological validation. The Knowledge Graph is logically consistent.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
