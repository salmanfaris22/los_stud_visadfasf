"use client";
import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import { errorMessage, uploadFile, useApi, type UploadPurpose } from "@lms/api-client";
import { Button, Progress, cn, toast } from "@lms/ui";

/** Uploads an image (thumbnail, cover, logo…) and returns its public URL. */
export function ImageUpload({ value, onChange, purpose = "thumbnail", className, aspect = "aspect-video" }: { value?: string; onChange: (url: string) => void; purpose?: UploadPurpose; className?: string; aspect?: string }) {
  const api = useApi();
  const input = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const pick = async (f?: File) => {
    if (!f) return;
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
  return (
    <div className={cn("relative overflow-hidden rounded-xl border-2 border-dashed bg-muted/40", aspect, className)}>
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-full object-cover" />
          <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2" onClick={() => onChange("")} aria-label="Remove image"><X /></Button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ImagePlus className="size-6" /> Upload image (PNG, JPG, WEBP)
        </button>
      )}
      {progress !== null && <div className="absolute inset-x-3 bottom-3"><Progress value={progress * 100} /></div>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
