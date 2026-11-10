"use client";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, Skeleton, cn, timeAgo } from "@lms/ui";
import { invalidate } from "@/lib/api";
import { NotificationService, useRpcMutation, useRpcQuery } from "@lms/api-client";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useRpcQuery(NotificationService.method.listNotifications, { limit: 100 });
  const read = useRpcMutation(NotificationService.method.markNotificationsRead, { onSuccess: () => invalidate(qc, NotificationService) });
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between"><h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Notifications</h1><Button variant="outline" disabled={!q.data?.feed?.unread} onClick={() => read.mutate({})}><CheckCheck /> Mark all read</Button></div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.feed?.items.length === 0 ? <EmptyState icon={<Bell />} title="No notifications yet" /> : (
        <div className="divide-y rounded-[20px] border bg-card">
          {q.data?.feed?.items.map((n) => (
            <Link key={n.id} href={n.link || "#"} onClick={() => !n.readAt && read.mutate({ ids: [n.id] })} className={cn("flex gap-3 p-4 transition hover:bg-muted/40", !n.readAt && "bg-signal/10")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-signal ring-2 ring-foreground/80")} />
              <span className="min-w-0 flex-1"><b className="block text-sm">{n.title}</b>{n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}<span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
