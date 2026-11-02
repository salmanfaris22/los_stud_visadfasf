"use client";
import * as React from "react";
import { Lock, PlayCircle } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle, VideoPlayer, formatDuration } from "@lms/ui";

/** Lesson list; free previews open in a player dialog. */
export function Lessons({ lessons }: { lessons: Schemas["PublicLesson"][] }) {
  const [open, setOpen] = React.useState<Schemas["PublicLesson"] | null>(null);
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {lessons.map((l, i) => (
        <button key={l.id} disabled={!l.is_preview} onClick={() => setOpen(l)} className="flex w-full items-center gap-4 p-4 text-left transition enabled:hover:bg-muted/40">
          <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
          {l.is_preview ? <PlayCircle className="size-5 text-primary" /> : <Lock className="size-4 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{l.title}</span>
            {l.task_count > 0 && <span className="text-xs text-muted-foreground">{l.task_count} task{l.task_count > 1 ? "s" : ""}</span>}
          </span>
          {l.is_preview && <Badge variant="info">Preview</Badge>}
          <span className="text-sm text-muted-foreground">{formatDuration(l.duration_seconds)}</span>
        </button>
      ))}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>{open?.title}</DialogTitle></DialogHeader>
          {open?.embed_url && <VideoPlayer embedUrl={open.embed_url} title={open.title} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
