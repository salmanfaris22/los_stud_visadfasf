"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea } from "@lms/ui";
import { ImageUpload } from "@lms/shared";
import type { BlockDef, FieldDef } from "./blocks";

type Data = Record<string, unknown>;

function Control({ def, value, onChange, id }: { def: FieldDef; value: unknown; onChange: (v: string) => void; id?: string }) {
  const v = typeof value === "string" ? value : "";
  switch (def.type) {
    case "textarea": return <Textarea id={id} rows={3} value={v} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />;
    case "image": return <ImageUpload value={v} onChange={onChange} purpose="cms" className="max-w-xs" />;
    case "select": return <Select id={id} value={v} onChange={(e) => onChange(e.target.value)}>{def.options?.map((o) => <option key={o} value={o}>{o}</option>)}</Select>;
    default: return <Input id={id} value={v} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />;
  }
}

/** Renders fields + an optional repeatable list from a BlockDef. */
export function BlockEditor({ def, value, onChange }: { def: BlockDef; value: Data; onChange: (d: Data) => void }) {
  const items = (def.list ? (value[def.list.key] as Data[] | undefined) : undefined) ?? [];
  const setItems = (next: Data[]) => onChange({ ...value, [def.list!.key]: next });
  const move = (i: number, d: number) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setItems(n); };
  return (
    <div className="grid gap-4">
      {def.fields.map((f) => <Field key={f.key} label={f.label}><Control def={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} /></Field>)}
      {def.list && (
        <div className="grid gap-3">
          <div className="text-sm font-medium">{def.list.label}</div>
          {items.map((it, i) => (
            <Card key={i} className="grid gap-3 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>#{i + 1}</span>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {def.list!.fields.map((f) => (
                  <Field key={f.key} label={f.label} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                    <Control def={f} value={it[f.key]} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))} />
                  </Field>
                ))}
              </div>
            </Card>
          ))}
          <Button type="button" variant="outline" className="w-fit" onClick={() => setItems([...items, {}])}><Plus /> Add</Button>
        </div>
      )}
    </div>
  );
}
