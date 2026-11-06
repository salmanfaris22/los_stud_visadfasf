"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/utils";

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />,
);
Label.displayName = "Label";

/** Label + control + hint/error, the standard form row. The label is linked to a single child control. */
export function Field({ label, hint, error, children, className, required }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; required?: boolean }) {
  const auto = React.useId();
  const only = React.Children.count(children) === 1 && React.isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const id = only ? (only.props.id ?? auto) : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {only ? React.cloneElement(only, { id }) : children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
