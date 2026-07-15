import React from "react";
import { Badge } from "@/components/ui/badge";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  badges?: string[];
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, subtitle, badges, actions }: AdminHeaderProps) {
  return (
    <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-background/70 p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <span>Administration</span>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {badges && badges.length > 0 && (
            <div className="flex gap-2 mr-2">
              {badges.map((b) => (
                <span key={b} className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3.5 py-2 border border-emerald-500/20 font-medium text-xs">
                  {b}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
