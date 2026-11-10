"use client";
import * as React from "react";
import { ImagePlus, RefreshCw, UploadCloud, X } from "lucide-react";
import { errorMessage, uploadFile, useApi, type UploadPurpose } from "@lms/api-client";
import { Button, Progress, cn, toast } from "@lms/ui";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Uploads an image (thumbnail, cover, logo…) by click or drag and drop, and returns its public URL. */
export function ImageUpload({ value, onChange, purpose = "thumbnail", className, aspect = "aspect-video" }: { value?: string; onChange: (url: string) => void; purpose?: UploadPurpose; className?: string; aspect?: string }) {
  const api = useApi();
  const input = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [over, setOver] = React.useState(false);
  // dragenter/dragleave also fire for child elements; count them so the highlight doesn't flicker.
  const depth = React.useRef(0);

  const pick = async (f?: File) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      toast.error("Please use a PNG, JPG, WEBP or GIF image.");
      return;
    }
    try {
      setProgress(0);
      const up = await uploadFile(api, f, purpose, setProgress);
      onChange(up.url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const drag = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = busy ? "none" : "copy"; },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!busy) void pick(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <div {...drag}
      className={cn("relative overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 transition-colors", over && "border-primary bg-primary/5", aspect, className)}>
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-full object-cover" />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button type="button" size="icon-sm" variant="secondary" onClick={() => input.current?.click()} disabled={busy} aria-label="Replace image" title="Replace image"><RefreshCw /></Button>
            <Button type="button" size="icon-sm" variant="secondary" onClick={() => onChange("")} disabled={busy} aria-label="Remove image" title="Remove image"><X /></Button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-sm text-muted-foreground hover:text-foreground">
          <ImagePlus className="size-6" />
          <span><span className="font-semibold text-foreground">Click to upload</span> or drag and drop</span>
          <span className="text-xs">PNG, JPG, WEBP or GIF</span>
        </button>
      )}
      {over && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 text-sm font-semibold text-foreground backdrop-blur-sm">
          <UploadCloud className="size-7" /> Drop image to upload
        </div>
      )}
      {busy && <div className="absolute inset-x-3 bottom-3"><Progress value={progress * 100} /></div>}
      <input ref={input} type="file" accept={ACCEPT.join(",")} hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
