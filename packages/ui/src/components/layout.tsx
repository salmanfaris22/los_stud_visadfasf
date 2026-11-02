import * as React from "react";
import { cn } from "../lib/utils";

/** Page title row: title, optional description and right-aligned actions. */
export function PageHeader({ title, description, actions, back, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm text-muted-foreground">{back}</div>}
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center", className)}>
      {icon && <div className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary [&_svg]:size-6">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = "primary", className }: { label: string; value: React.ReactNode; icon?: React.ReactNode; hint?: React.ReactNode; tone?: "primary" | "success" | "warning" | "info" | "destructive"; className?: string }) {
  const tones = { primary: "bg-primary/12 text-primary", success: "bg-success/12 text-success", warning: "bg-warning/15 text-warning", info: "bg-info/12 text-info", destructive: "bg-destructive/12 text-destructive" };
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className={cn("rounded-lg p-2 [&_svg]:size-4", tones[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
