"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Popover, PopoverContent, PopoverTrigger, cn, timeAgo, toast } from "@lms/ui";
import { invalidatePaths, useApi, useRealtime, type Schemas } from "@lms/api-client";

/** Bell with unread count; new notifications arrive live over WebSocket and show a toast. */
export function NotificationBell({ enabled, viewAllHref }: { enabled: boolean; viewAllHref?: string }) {
  const qc = useQueryClient();
  const api = useApi();
  const $api = api.$api;
  const invalidate = invalidatePaths;
  const feed = $api.useQuery("get", "/api/v1/notifications", { params: { query: { limit: 15 } } }, { enabled, refetchInterval: 120_000 });
  const read = $api.useMutation("post", "/api/v1/notifications/read", { onSuccess: () => invalidate(qc, "/api/v1/notifications") });

  useRealtime(api, enabled, (e) => {
    if (e.type !== "notification") return;
    const n = e.data as Schemas["Notification"];
    toast(n.title, { description: n.body });
    void invalidate(qc, "/api/v1/notifications");
  });

  const unread = feed.data?.unread ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">Notifications</span>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => read.mutate({ body: {} })}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(feed.data?.items ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">You're all caught up 🎉</p>}
          {feed.data?.items.map((n) => (
            <Link
              key={n.id}
              href={n.link || "#"}
              onClick={() => !n.read_at && read.mutate({ body: { ids: [n.id] } })}
              className={cn("flex gap-3 border-b px-4 py-3 text-sm transition last:border-0 hover:bg-muted/50", !n.read_at && "bg-primary/5")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{n.title}</span>
                {n.body && <span className="line-clamp-2 block text-muted-foreground">{n.body}</span>}
                <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="block border-t px-4 py-2 text-center text-sm text-primary hover:bg-muted/50">View all</Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
