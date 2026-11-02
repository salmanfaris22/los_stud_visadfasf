"use client";
import Link from "next/link";
import { CheckCircle2, PlayCircle } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { cn, formatDuration } from "@lms/ui";

/** Course playlist; done = every task of the video approved. */
export function Playlist({ items, currentId, compact }: { items: Schemas["PlaylistItem"][]; currentId?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((v, i) => (
        <Link key={v.id} href={`/learn/watch/${v.id}`} className={cn("group flex gap-3 rounded-xl p-2 transition", v.id === currentId ? "bg-accent" : "hover:bg-accent/50")}>
          <span className="mt-1 w-5 shrink-0 text-center text-xs text-muted-foreground">{v.id === currentId ? <PlayCircle className="size-4 text-primary" /> : i + 1}</span>
          <span className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted", compact ? "h-[54px] w-24" : "h-20 w-36")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="size-full object-cover" />}
            {v.duration_seconds > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(v.duration_seconds)}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</span>
            <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {v.done ? <><CheckCircle2 className="size-3.5 text-success" /> Done</> : v.task_count > 0 ? `${v.approved_count}/${v.task_count} tasks` : "No tasks"}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
