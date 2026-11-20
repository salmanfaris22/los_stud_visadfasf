"use client";
import * as React from "react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { ImageUpload } from "@lms/shared";
import { Button, Checkbox, Field as FormField, Input, Select, Textarea, cn } from "@lms/ui";

import { FONTS, PLACEHOLDERS, type Field } from "./layout";

const num = (v: string, fallback = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

/** Properties of the selected field. */
export function FieldPanel({ field, onChange, onDelete }: { field: Field; onChange: (patch: Partial<Field>) => void; onDelete: () => void }) {
  const text = React.useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = text.current;
    const cur = field.text ?? "";
    const at = el ? el.selectionStart : cur.length;
    onChange({ text: cur.slice(0, at) + token + cur.slice(el ? el.selectionEnd : at) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-2">
        <FormField label="Name in the list" className="flex-1">
          <Input value={field.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. Student name" />
        </FormField>
        <Button variant="ghost" size="icon" aria-label="Delete field" onClick={onDelete}><Trash2 /></Button>
      </div>

      {field.kind === "text" && (
        <>
          <FormField label="Text" hint="Bold: **like this**">
            <Textarea ref={text} rows={3} value={field.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button key={p.token} type="button" onClick={() => insert(p.token)} className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground">
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Font" className="col-span-2">
              <Select value={field.font || "sans"} onChange={(e) => onChange({ font: e.target.value })}>
                {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Size (pt)"><Input type="number" step={0.5} min={1} max={200} value={field.size ?? 12} onChange={(e) => onChange({ size: num(e.target.value, 12) })} /></FormField>
            <FormField label="Colour">
              <div className="flex gap-1.5">
                <input type="color" aria-label="Colour" value={field.color || "#000000"} onChange={(e) => onChange({ color: e.target.value })} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
                <Input value={field.color ?? ""} onChange={(e) => onChange({ color: e.target.value })} className="font-mono text-xs" />
              </div>
            </FormField>
            <FormField label="Letter spacing (mm)"><Input type="number" step={0.05} min={-5} max={20} value={field.spacing ?? 0} onChange={(e) => onChange({ spacing: num(e.target.value) })} /></FormField>
            <FormField label="Line height"><Input type="number" step={0.05} min={0.5} max={5} value={field.lineHeight ?? 1.2} onChange={(e) => onChange({ lineHeight: num(e.target.value, 1.2) })} /></FormField>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Align">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} type="button" aria-label={`Align ${a}`} aria-pressed={(field.align || "left") === a} onClick={() => onChange({ align: a })}
                  className={cn("rounded-md p-1.5 text-muted-foreground", (field.align || "left") === a && "bg-muted text-foreground")}>
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!field.uppercase} onCheckedChange={(v) => onChange({ uppercase: !!v })} /> Capitals</label>
            <label className="flex items-center gap-2 text-sm" title="Long names shrink to stay on one line"><Checkbox checked={!!field.fit} onCheckedChange={(v) => onChange({ fit: !!v })} /> One line</label>
          </div>
        </>
      )}

      {field.kind === "image" && (
        <FormField label="Image" hint="PNG with a transparent background works best (signatures, logos)">
          <ImageUpload value={field.src} onChange={(u) => onChange({ src: u })} purpose="certificate" aspect="aspect-[3/1]" />
        </FormField>
      )}

      {field.kind === "qr" && (
        <FormField label="QR colour" hint="Opens the public verify page of the certificate">
          <div className="flex gap-1.5">
            <input type="color" aria-label="QR colour" value={field.color || "#0d1e53"} onChange={(e) => onChange({ color: e.target.value })} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
            <Input value={field.color ?? ""} onChange={(e) => onChange({ color: e.target.value })} className="font-mono text-xs" />
          </div>
        </FormField>
      )}

      <div className="grid grid-cols-3 gap-2">
        <FormField label="X (mm)"><Input type="number" step={0.25} value={Number(field.x.toFixed(2))} onChange={(e) => onChange({ x: num(e.target.value) })} /></FormField>
        <FormField label="Y (mm)"><Input type="number" step={0.25} value={Number(field.y.toFixed(2))} onChange={(e) => onChange({ y: num(e.target.value) })} /></FormField>
        <FormField label={field.kind === "qr" ? "Size" : "Width"}><Input type="number" step={0.25} min={1} value={Number(field.w.toFixed(2))} onChange={(e) => onChange({ w: Math.max(1, num(e.target.value, 10)) })} /></FormField>
      </div>
    </div>
  );
}
