import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff, KeyRound, ShieldCheck, AlertTriangle } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose?: () => void;
  mandatory?: boolean;
}

export function ChangePasswordDialog({ open, onClose, mandatory = false }: ChangePasswordDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    if (!current) return "Enter your current (temporary) password.";
    if (next.length < 8) return "New password must be at least 8 characters.";
    if (next === current) return "New password must be different from your current password.";
    if (next !== confirm) return "Passwords do not match.";
    return null;
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/auth/change-password", { currentPassword: current, newPassword: next }).then(r => r.json()),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: async (err: any) => {
      let msg = "Password change failed. Please try again.";
      try { msg = (await err.response?.json?.())?.error ?? msg; } catch { /* noop */ }
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const error = validate();
    if (error) { toast({ title: "Validation error", description: error, variant: "destructive" }); return; }
    mutation.mutate();
  };

  const handleDone = () => {
    setSuccess(false);
    setCurrent(""); setNext(""); setConfirm("");
    if (onClose) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !mandatory && !success) onClose?.(); }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={mandatory ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={mandatory ? e => e.preventDefault() : undefined}
      >
        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-semibold">Password Updated</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your password has been changed successfully. A confirmation has been sent to your email.
              </p>
            </div>
            <Button onClick={handleDone} className="w-full" data-testid="button-password-changed-done">
              Continue
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                {mandatory ? "Set Your New Password" : "Change Password"}
              </DialogTitle>
              {mandatory && (
                <DialogDescription asChild>
                  <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Your account was created with a temporary password. You must set a new password before you can continue.
                    </p>
                  </div>
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {mandatory ? "Temporary password (from your email)" : "Current password"}
                </Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    placeholder="Enter current password"
                    className="pr-10"
                    data-testid="input-current-password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">New password</Label>
                <div className="relative">
                  <Input
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={e => setNext(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-10"
                    data-testid="input-new-password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {next.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {[
                      next.length >= 8,
                      /[A-Z]/.test(next),
                      /[0-9]/.test(next),
                      /[^A-Za-z0-9]/.test(next),
                    ].map((ok, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${ok ? "bg-green-500" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Strong passwords include uppercase, numbers and special characters.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Confirm new password</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  data-testid="input-confirm-password"
                  autoComplete="new-password"
                  onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                  className={confirm && next !== confirm ? "border-destructive" : ""}
                />
                {confirm && next !== confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-change-password"
                >
                  {mutation.isPending ? "Updating…" : "Update Password"}
                </Button>
                {!mandatory && (
                  <Button variant="outline" onClick={onClose} data-testid="button-cancel-change-password">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
