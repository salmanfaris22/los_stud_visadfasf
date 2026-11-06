"use client";
import Link from "next/link";
import { Play } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { RouteGutter, cn, formatDuration } from "@lms/ui";

/**
 * Course playlist drawn as a route: each video is a stop, done = every task of the video approved.
 * The current stop is the playing video, or the first stop not done yet.
 */
export function Playlist({ items, currentId, compact, color }: { items: Schemas["PlaylistItem"][]; currentId?: string; compact?: boolean; color: string }) {
  const current = currentId ?? items.find((v) => !v.done)?.id;
  return (
    <div className="flex flex-col">
      {items.map((v, i) => {
        const here = v.id === current;
        const state = here ? "current" : v.done ? "done" : "next";
        return (
          <Link key={v.id} href={`/learn/watch/${v.id}`} aria-current={v.id === currentId ? "true" : undefined}
            className={cn("group flex items-stretch gap-2 rounded-2xl pr-2 transition", here ? "bg-muted" : "hover:bg-muted/60")}>
            <RouteGutter color={color} state={state} first={i === 0} last={i === items.length - 1} trail={!!items[i - 1]?.done} ahead={v.done} className="ml-1" />
            <span className="flex min-w-0 flex-1 gap-3 py-2">
              <span className={cn("relative shrink-0 overflow-hidden rounded-xl bg-muted", compact ? "h-[54px] w-24" : "h-[72px] w-32")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="size-full object-cover" />}
                {v.id === currentId && <span className="absolute inset-0 flex items-center justify-center bg-black/35"><Play className="size-5 fill-white text-white" /></span>}
                {v.duration_seconds > 0 && <span className="absolute right-1 bottom-1 rounded-md bg-black/80 px-1 text-[10px] font-medium text-white tabular-nums">{formatDuration(v.duration_seconds)}</span>}
              </span>
              <span className="min-w-0 flex-1 py-0.5">
                <span className="text-[11px] font-bold text-muted-foreground tabular-nums">Stop {i + 1}</span>
                <span className={cn("line-clamp-2 text-sm leading-snug", here ? "font-bold" : "font-medium")}>{v.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {v.done ? "Done" : v.task_count > 0 ? `${v.approved_count}/${v.task_count} tasks` : "No tasks"}
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
