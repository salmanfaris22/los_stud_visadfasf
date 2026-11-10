"use client";
import { Megaphone, Pin } from "lucide-react";
import { Card, EmptyState, Markdown, Skeleton, timeAgo } from "@lms/ui";
import { AnnouncementService, useRpcQuery } from "@lms/api-client";

export default function AnnouncementsPage() {
  const q = useRpcQuery(AnnouncementService.method.listMyAnnouncements, { limit: 100 });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Announcements</h1>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.items.length === 0 ? <EmptyState icon={<Megaphone />} title="No announcements" /> : (
        <div className="space-y-4">
          {q.data?.items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-center gap-2 font-semibold">{a.pinned && <Pin className="size-4 text-primary" />}{a.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{a.authorName} · {timeAgo(a.createdAt)}</p>
              <Markdown className="mt-3 text-sm">{a.body}</Markdown>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
