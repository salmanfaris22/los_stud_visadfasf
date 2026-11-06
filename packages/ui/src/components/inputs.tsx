"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, Search, UploadCloud, X } from "lucide-react";
import { cn, formatBytes } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { Checkbox, Popover, PopoverContent, PopoverTrigger } from "./primitives";

/** Search box that reports its value after the user stops typing. */
export function SearchInput({ value, onChange, placeholder = "Search…", className, delay = 300 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; delay?: number }) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => {
    setLocal(value);
  }, [value]);
  React.useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
  }, [local, value, onChange, delay]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Pagination({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
      <span>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="px-2">{page} / {pages}</span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}

export type Option = { value: string; label: string; hint?: string; group?: string };

/** Searchable multi-select (mentors, roles, live-session targets…). */
export function MultiSelect({ options, value, onChange, placeholder = "Select…", className, emptyText = "Nothing found" }: { options: Option[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; className?: string; emptyText?: string }) {
  const [q, setQ] = React.useState("");
  const selected = options.filter((o) => value.includes(o.value));
  const shown = options.filter((o) => (o.label + " " + (o.hint ?? "") + " " + (o.group ?? "")).toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  let lastGroup = "";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("flex min-h-9 w-full flex-wrap items-center gap-1 rounded-xl border border-input bg-card px-2 py-1 text-left text-sm shadow-xs", className)}>
          {selected.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
          {selected.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {o.label}
              <X className="size-3 cursor-pointer opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); toggle(o.value); }} />
            </span>
          ))}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-2">
        <Input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />
        <div className="max-h-64 overflow-y-auto">
          {shown.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">{emptyText}</p>}
          {shown.map((o) => {
            const header = o.group && o.group !== lastGroup ? ((lastGroup = o.group), <div key={"g-" + o.group} className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{o.group}</div>) : null;
            return (
              <React.Fragment key={o.value}>
                {header}
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
                </label>
              </React.Fragment>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Drag & drop area. Validation (type/size) is reported through onError. */
export function FileDrop({ onFiles, accept, multiple = true, maxBytes, hint, disabled, className, onError }: { onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; maxBytes?: number; hint?: string; disabled?: boolean; className?: string; onError?: (msg: string) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const take = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const ok = files.filter((f) => {
      if (maxBytes && f.size > maxBytes) {
        onError?.(`${f.name} is larger than ${formatBytes(maxBytes)}`);
        return false;
      }
      return true;
    });
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };
  return (
    <div
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
      className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed px-4 py-7 text-center transition", over ? "border-foreground bg-signal/10" : "hover:border-foreground/40 hover:bg-muted/40", disabled && "pointer-events-none opacity-50", className)}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-signal/25 dark:text-signal"><UploadCloud className="size-5" /></span>
      <div className="text-sm font-medium">Drop files here or <span className="underline decoration-signal decoration-2 underline-offset-4">browse</span></div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
