"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export type CalEvent = { id: string; title: string; start: string; tone?: "primary" | "warning" | "success" | "muted"; href?: string };

const toneCls = { primary: "bg-primary/15 text-primary", warning: "bg-warning/15 text-warning", success: "bg-success/15 text-success", muted: "bg-muted text-muted-foreground line-through" };

/** Simple month grid. `month` is any date inside the month to show. */
export function MonthCalendar({ month, onMonth, events, onSelect }: { month: Date; onMonth: (d: Date) => void; events: CalEvent[]; onSelect?: (e: CalEvent) => void }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, CalEvent[]>();
  events.forEach((e) => { const k = key(new Date(e.start)); byDay.set(k, [...(byDay.get(k) ?? []), e]); });
  const today = key(new Date());
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => onMonth(new Date())}>Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(key(d)) ?? []).sort((a, b) => a.start.localeCompare(b.start));
          const other = d.getMonth() !== month.getMonth();
          return (
            <div key={key(d)} className={cn("min-h-24 border-r border-b p-1.5 text-xs [&:nth-child(7n)]:border-r-0", other && "bg-muted/30 text-muted-foreground")}>
              <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full", key(d) === today && "bg-primary font-bold text-primary-foreground")}>{d.getDate()}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((e) => (
                  <button key={e.id} onClick={() => onSelect?.(e)} className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left", toneCls[e.tone ?? "primary"])}>
                    {new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} {e.title}
                  </button>
                ))}
                {list.length > 3 && <div className="px-1 text-muted-foreground">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
