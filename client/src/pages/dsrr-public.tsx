/**
 * Public DSRR Intake � Data Subject Rights Request (s.14 CDPA)
 * No authentication required. Any member of the public can submit.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle, FileText, Eye, XCircle, AlertCircle, Users, ChevronRight } from "lucide-react";

const REQUEST_TYPES = [
  { value: "INFORMED", label: "Right to be Informed", desc: "Learn what personal data is held about you and why.", icon: FileText },
  { value: "ACCESS", label: "Right of Access", desc: "Receive a copy of your personal data.", icon: Eye },
  { value: "OBJECT", label: "Right to Object", desc: "Object to processing, including for direct marketing.", icon: AlertCircle },
  { value: "CORRECT", label: "Right to Correct", desc: "Have inaccurate or incomplete data corrected.", icon: CheckCircle },
  { value: "DELETE", label: "Right to Erasure", desc: "Request deletion of your personal data.", icon: XCircle },
];

const ID_METHODS = [
  { value: "EMAIL_CONFIRM", label: "Email confirmation link" },
  { value: "NATIONAL_ID", label: "National ID / Passport number" },
  { value: "GUARDIAN_VERIFIED", label: "Guardian/representative verification (for minors or incapacitated persons)" },
];

type Step = "type" | "details" | "identity" | "submitted";

export default function DsrrPublicPage() {
  const [step, setStep] = useState<Step>("type");
  const [requestType, setRequestType] = useState("");
  const [form, setForm] = useState({ subjectName: "", subjectEmail: "", details: "", isMinor: false, guardianName: "", guardianRelationship: "", identityVerificationMethod: "EMAIL_CONFIRM", targetControllerId: "" });
  const [reference, setReference] = useState<string | null>(null);
  const tenantId = import.meta.env.VITE_DEFAULT_TENANT || "TENANT-001";

  const { data: controllers = [] } = useQuery({
    queryKey: ["public-controllers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/public/controllers?tenantId=${encodeURIComponent(tenantId)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (controllers.length > 0 && !form.targetControllerId) {
      setForm((previous) => ({ ...previous, targetControllerId: controllers[0].id }));
    }
  }, [controllers, form.targetControllerId]);

  const submitMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/dsrr", {
      ...form,
      requestType,
      tenantId,
    }).then(r => r.json()),
    onSuccess: (data: any) => { setReference(data.id || "REF-" + Date.now()); setStep("submitted"); },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Data Subject Rights Request</h1>
        <p className="text-sm text-muted-foreground">Under the Cyber and Data Protection Act [Chapter 12:07] (s.14), you have rights over your personal data.</p>
      </div>

      <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
        {(["type", "details", "identity"] as Step[]).map((s, i) => {
          const steps = ["type", "details", "identity"];
          const done = steps.indexOf(step) > i || step === "submitted";
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted/30 border-border/40"}`}>{i + 1}</div>
              <span className="capitalize hidden sm:inline">{s === "type" ? "Right" : s === "details" ? "Details" : "Identity"}</span>
              {i < 2 && <ChevronRight className="w-3 h-3" />}
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-2xl">
        {step === "type" && (
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-base">Which right do you wish to exercise?</CardTitle><CardDescription className="text-xs">Select one option. You can submit separate requests for additional rights.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {REQUEST_TYPES.map(rt => {
                const Icon = rt.icon;
                return (
                  <button key={rt.value} id={`dsrr-type-${rt.value.toLowerCase()}`} onClick={() => setRequestType(rt.value)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${requestType === rt.value ? "border-primary bg-primary/5" : "border-border/40 bg-muted/20 hover:border-primary/40"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${requestType === rt.value ? "bg-primary/20" : "bg-muted/40"}`}><Icon className="w-4 h-4 text-primary" /></div>
                    <div><p className="text-sm font-semibold">{rt.label}</p><p className="text-xs text-muted-foreground">{rt.desc}</p></div>
                  </button>
                );
              })}
              <Button className="w-full mt-2" onClick={() => setStep("details")} disabled={!requestType}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </CardContent>
          </Card>
        )}

        {step === "details" && (
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-base">Your Details</CardTitle><CardDescription className="text-xs">All fields encrypted at rest per s.18 CDPA. Used solely to locate your data and respond to you.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Full Name *</Label><input id="dsrr-name" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="Your full legal name" value={form.subjectName} onChange={e => setForm(p => ({ ...p, subjectName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Email Address *</Label><input id="dsrr-email" type="email" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="your@email.com" value={form.subjectEmail} onChange={e => setForm(p => ({ ...p, subjectEmail: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Organisation / Data Controller *</Label>
                <select id="dsrr-controller" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.targetControllerId} onChange={e => setForm(p => ({ ...p, targetControllerId: e.target.value }))}>
                  {controllers.length === 0 ? (
                    <option value="">No organisations available yet</option>
                  ) : controllers.map((controller: any) => (
                    <option key={controller.id} value={controller.id}>{controller.name || controller.organisation || controller.controllerCode}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">Choose the organisation you are submitting this request to so it routes to the correct controller.</p>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Details of your request</Label><textarea id="dsrr-details" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2 h-24 resize-none" placeholder="Describe what data you are requesting, what you want corrected, etc." value={form.details} onChange={e => setForm(p => ({ ...p, details: e.target.value }))} /></div>
              <div className="p-3 rounded-xl border border-border/30 bg-muted/10">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" id="dsrr-is-minor" checked={form.isMinor} onChange={e => setForm(p => ({ ...p, isMinor: e.target.checked }))} className="w-4 h-4 rounded" />
                  <div><p className="text-sm font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />On behalf of a minor or incapacitated person (ss.26�27)</p><p className="text-xs text-muted-foreground">Guardian/representative verification will be required.</p></div>
                </label>
                {form.isMinor && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/30">
                    <div className="space-y-1.5"><Label className="text-xs">Guardian Name *</Label><input id="dsrr-guardian-name" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2" value={form.guardianName} onChange={e => setForm(p => ({ ...p, guardianName: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Relationship *</Label><input id="dsrr-guardian-rel" className="w-full text-sm bg-muted/30 border border-border/40 rounded-lg px-3 py-2" placeholder="e.g. Parent" value={form.guardianRelationship} onChange={e => setForm(p => ({ ...p, guardianRelationship: e.target.value }))} /></div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("type")}>Back</Button>
                <Button className="flex-1" onClick={() => setStep("identity")} disabled={!form.subjectName || !form.subjectEmail || !form.targetControllerId || (form.isMinor && !form.guardianName)}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "identity" && (
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-base">Identity Verification</CardTitle><CardDescription className="text-xs">We must verify your identity before processing your request to protect your data from unauthorised access.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {ID_METHODS.filter(m => form.isMinor ? m.value === "GUARDIAN_VERIFIED" : m.value !== "GUARDIAN_VERIFIED").map(m => (
                  <label key={m.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${form.identityVerificationMethod === m.value ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"}`}>
                    <input type="radio" name="id-method" value={m.value} checked={form.identityVerificationMethod === m.value} onChange={() => setForm(p => ({ ...p, identityVerificationMethod: m.value }))} className="w-4 h-4" />
                    <span className="text-sm">{m.label}</span>
                  </label>
                ))}
              </div>
              <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-muted-foreground">
                <p className="font-semibold text-blue-400 mb-1">What happens next?</p>
                <p>You will receive a reference number. The organisation must respond within the SLA period (typically 30 days). If they fail to respond, you may escalate to the Data Protection Authority.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("details")}>Back</Button>
                <Button id="dsrr-submit-btn" className="flex-1" onClick={() => submitMut.mutate()} disabled={submitMut.isPending || !form.targetControllerId}>{submitMut.isPending ? "Submitting�" : "Submit Request"}</Button>
              </div>
              {submitMut.isError && <p className="text-xs text-red-400 text-center">Submission failed. Please try again or contact the DPO directly.</p>}
            </CardContent>
          </Card>
        )}

        {step === "submitted" && (
          <Card className="bg-card/60 border-emerald-500/20">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-emerald-400" /></div>
              <h2 className="text-xl font-bold mb-2">Request Submitted Successfully</h2>
              <p className="text-sm text-muted-foreground mb-4">Your Data Subject Rights Request has been received. A confirmation will be sent to <span className="text-foreground font-medium">{form.subjectEmail}</span>.</p>
              {reference && (
                <div className="p-3 rounded-xl border border-border/40 bg-muted/20 inline-block mb-4">
                  <p className="text-xs text-muted-foreground mb-0.5">Your Reference Number</p>
                  <p className="font-mono font-bold text-primary text-sm">{reference}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Keep this reference. If the organisation does not respond within the SLA period, you may escalate to the Data Protection Authority citing this reference number.</p>
              <Badge variant="outline" className="mt-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">{REQUEST_TYPES.find(r => r.value === requestType)?.label}</Badge>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
