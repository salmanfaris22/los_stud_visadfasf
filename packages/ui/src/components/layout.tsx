import * as React from "react";
import { cn } from "../lib/utils";

/** Page title row: title, optional description and right-aligned actions. */
export function PageHeader({ title, description, actions, back, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm text-muted-foreground">{back}</div>}
        <h1 className="font-display text-[26px] leading-[1.1] font-extrabold sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[20px] border border-dashed bg-card/50 px-6 py-14 text-center", className)}>
      {icon && <div className="relative mb-4 flex size-14 items-center justify-center rounded-full bg-signal/25 text-foreground ring-4 ring-signal/10 [&_svg]:size-6 dark:text-signal">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = "primary", className }: { label: string; value: React.ReactNode; icon?: React.ReactNode; hint?: React.ReactNode; tone?: "primary" | "success" | "warning" | "info" | "destructive"; className?: string }) {
  const tones = { primary: "bg-signal/25 text-foreground dark:text-signal", success: "bg-success/12 text-success", warning: "bg-warning/15 text-warning", info: "bg-info/12 text-info", destructive: "bg-destructive/12 text-destructive" };
  return (
    <div className={cn("rounded-[20px] border bg-card p-5 shadow-sm dark:shadow-none", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className={cn("rounded-full p-2 [&_svg]:size-4", tones[tone])}>{icon}</span>}
      </div>
      <div className="mt-3 font-display text-[28px] leading-none font-extrabold tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
