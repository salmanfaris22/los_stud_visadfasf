"use client";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, Skeleton, cn, timeAgo } from "@lms/ui";
import { $api, invalidate } from "@/lib/api";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = $api.useQuery("get", "/api/v1/notifications", { params: { query: { limit: 100 } } });
  const read = $api.useMutation("post", "/api/v1/notifications/read", { onSuccess: () => invalidate(qc, "/api/v1/notifications") });
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between"><h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Notifications</h1><Button variant="outline" disabled={!q.data?.unread} onClick={() => read.mutate({ body: {} })}><CheckCheck /> Mark all read</Button></div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.items.length === 0 ? <EmptyState icon={<Bell />} title="No notifications yet" /> : (
        <div className="divide-y rounded-[20px] border bg-card">
          {q.data?.items.map((n) => (
            <Link key={n.id} href={n.link || "#"} onClick={() => !n.read_at && read.mutate({ body: { ids: [n.id] } })} className={cn("flex gap-3 p-4 transition hover:bg-muted/40", !n.read_at && "bg-signal/10")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-signal ring-2 ring-foreground/80")} />
              <span className="min-w-0 flex-1"><b className="block text-sm">{n.title}</b>{n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}<span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
