import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3", {
  variants: {
    variant: {
      default: "border-transparent bg-signal/25 text-foreground dark:bg-signal/15 dark:text-signal",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      success: "border-transparent bg-success/15 text-success",
      warning: "border-transparent bg-warning/15 text-warning",
      destructive: "border-transparent bg-destructive/15 text-destructive",
      info: "border-transparent bg-info/15 text-info",
      solid: "border-transparent bg-foreground text-background",
      signal: "border-transparent bg-signal text-signal-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS: Record<string, { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }> = {
  pending: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  resubmit: { label: "Resubmit", variant: "info" },
  todo: { label: "To do", variant: "secondary" },
  active: { label: "Active", variant: "success" },
  disabled: { label: "Disabled", variant: "destructive" },
  suspended: { label: "Suspended", variant: "destructive" },
  completed: { label: "Completed", variant: "success" },
  draft: { label: "Draft", variant: "secondary" },
  published: { label: "Published", variant: "success" },
  archived: { label: "Archived", variant: "outline" },
  upcoming: { label: "Upcoming", variant: "info" },
  running: { label: "Running", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  scheduled: { label: "Scheduled", variant: "info" },
  new: { label: "New", variant: "default" },
  contacted: { label: "Contacted", variant: "info" },
  converted: { label: "Converted", variant: "success" },
  lost: { label: "Lost", variant: "outline" },
  present: { label: "Present", variant: "success" },
  late: { label: "Late", variant: "warning" },
  absent: { label: "Absent", variant: "destructive" },
  excused: { label: "Excused", variant: "secondary" },
};

/** Coloured badge for any workflow status used in the API. */
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const s = STATUS[status ?? ""] ?? { label: status || "—", variant: "outline" as const };
  return <Badge variant={s.variant} className={className}>{s.label}</Badge>;
}
