import { ReactNode } from "react";
import { ArrowRight, Sparkles, ShieldCheck, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PortalSectionProps = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PortalSection({ id, title, description, children, actions }: PortalSectionProps) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-4 scroll-mt-28">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h2 id={id ? `${id}-heading` : undefined} className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">{title}</h2>
          {description ? <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

const alertStyles: Record<string, string> = {
  critical: "border-red-300/60 bg-red-50 text-red-700 dark:border-red-600/60 dark:bg-red-500/10 dark:text-red-200",
  warning: "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200",
  info: "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-200",
  success: "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-200",
};

type PortalAlertProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  variant?: keyof typeof alertStyles;
  ctaLabel?: string;
  ctaHref?: string;
};

export function PortalAlert({ icon, title, subtitle, variant = "info", ctaLabel, ctaHref }: PortalAlertProps) {
  return (
    <div role="status" aria-live="polite" className={`rounded-3xl border p-4 shadow-sm ${alertStyles[variant]}`}>
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-foreground shadow-sm dark:bg-slate-900/80">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
        </div>
        {ctaLabel && ctaHref ? (
          <Button asChild size="sm" variant="outline" className="whitespace-nowrap">
            <a href={ctaHref}>{ctaLabel} <ArrowRight className="w-3 h-3" /></a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type PortalKpiCardProps = {
  title: string;
  value: string | number;
  description?: string;
  trend?: string;
  icon: ReactNode;
  highlight?: boolean;
};

export function PortalKpiCard({ title, value, description, trend, icon, highlight }: PortalKpiCardProps) {
  return (
    <Card className={`rounded-3xl border ${highlight ? "border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/80" : "border-border bg-card/95"}`}>
      <CardContent role="group" aria-label={title} className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary">{icon}</div>
        </div>
        {description ? <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
        {trend ? <Badge variant="outline" className="text-xs uppercase tracking-[0.18em] text-primary">{trend}</Badge> : null}
      </CardContent>
    </Card>
  );
}

type PortalWorkflowCardProps = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
};

export function PortalWorkflowCard({ title, description, href, icon }: PortalWorkflowCardProps) {
  return (
    <Card className="group rounded-3xl border border-border bg-card/95 transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600">
      <a href={href} className="block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/5 text-primary transition-colors group-hover:bg-primary/10">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <span>Open</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </a>
    </Card>
  );
}

type SectionNavItem = { id: string; label: string };

type PortalSectionNavProps = { items: SectionNavItem[] };

export function PortalSectionNav({ items }: PortalSectionNavProps) {
  return (
    <nav aria-label="Regulator portal sections" className="sticky top-24 z-20 rounded-3xl border border-border bg-background/90 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="min-w-[10rem] rounded-3xl border border-border bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:bg-slate-800"
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export const portalNavItems: SectionNavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "focus", label: "Focus" },
  { id: "audits", label: "Audit Planning" },
  { id: "investigations", label: "Investigations" },
  { id: "dsr", label: "DSR Oversight" },
  { id: "integrations", label: "Integrations" },
  { id: "discovery", label: "Discovery" },
  { id: "approvals", label: "Approvals" },
];
