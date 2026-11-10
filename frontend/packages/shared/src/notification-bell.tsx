"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Popover, PopoverContent, PopoverTrigger, cn, timeAgo, toast } from "@lms/ui";
import { NotificationService, invalidateRpc, useApi, useRealtime, useRpcMutation, useRpcQuery } from "@lms/api-client";

/** Bell with unread count; new notifications arrive live over the realtime stream and show a toast. */
export function NotificationBell({ enabled, viewAllHref }: { enabled: boolean; viewAllHref?: string }) {
  const qc = useQueryClient();
  const api = useApi();
  const feed = useRpcQuery(NotificationService.method.listNotifications, { limit: 15 }, { enabled, refetchInterval: 120_000 });
  const read = useRpcMutation(NotificationService.method.markNotificationsRead, { onSuccess: () => invalidateRpc(qc, NotificationService) });

  useRealtime(api, enabled, (e) => {
    if (e.type !== "notification") return;
    const n = (e.data ?? {}) as { title?: string; body?: string };
    toast(n.title ?? "New notification", { description: n.body });
    void invalidateRpc(qc, NotificationService);
  });

  const unread = feed.data?.feed?.unread ?? 0;
  const items = feed.data?.feed?.items ?? [];
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
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => read.mutate({})}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">You're all caught up 🎉</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link || "#"}
              onClick={() => !n.readAt && read.mutate({ ids: [n.id] })}
              className={cn("flex gap-3 border-b px-4 py-3 text-sm transition last:border-0 hover:bg-muted/50", !n.readAt && "bg-signal/10")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{n.title}</span>
                {n.body && <span className="line-clamp-2 block text-muted-foreground">{n.body}</span>}
                <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
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
