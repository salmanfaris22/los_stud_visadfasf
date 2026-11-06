"use client";
import * as React from "react";
import { Lock, Play } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, RouteGutter, VideoPlayer, cn, formatDuration } from "@lms/ui";

/** Lessons drawn as stops on the course line; free previews open in a player dialog. */
export function Lessons({ lessons, color }: { lessons: Schemas["PublicLesson"][]; color: string }) {
  const [open, setOpen] = React.useState<Schemas["PublicLesson"] | null>(null);
  return (
    <div className="rounded-[20px] border bg-card p-2 shadow-sm dark:shadow-none">
      {lessons.map((l, i) => (
        <button
          key={l.id}
          disabled={!l.is_preview}
          onClick={() => setOpen(l)}
          className={cn("group flex w-full items-stretch gap-3 rounded-2xl px-3 text-left transition", l.is_preview ? "hover:bg-muted/60" : "cursor-default")}
        >
          <RouteGutter color={color} state="next" first={i === 0} last={false} trail={false} ahead={false} />
          <span className="flex min-w-0 flex-1 items-center gap-4 border-b py-4 group-last:border-0">
            <span className="w-7 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{l.title}</span>
              {l.task_count > 0 && <span className="text-xs text-muted-foreground">{l.task_count} task{l.task_count > 1 ? "s" : ""}</span>}
            </span>
            {l.is_preview ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-signal px-3 py-1 text-xs font-bold text-signal-foreground"><Play className="size-3 fill-current" />Preview</span>
            ) : (
              <Lock className="size-4 text-muted-foreground/70" />
            )}
            <span className="w-12 text-right text-sm text-muted-foreground tabular-nums">{formatDuration(l.duration_seconds)}</span>
          </span>
        </button>
      ))}
      {/* last stop */}
      <div className="flex items-stretch gap-3 px-3">
        <RouteGutter color={color} state="next" terminus last trail={false} />
        <span className="flex flex-1 items-center gap-4 py-4">
          <span className="w-7" />
          <span className="font-display font-bold">Certificate</span>
          <span className="text-xs text-muted-foreground">after the last task is approved</span>
        </span>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>{open?.title}</DialogTitle></DialogHeader>
          {open?.embed_url && <VideoPlayer embedUrl={open.embed_url} title={open.title} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
