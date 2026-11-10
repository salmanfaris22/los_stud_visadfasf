"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState, Skeleton, StatusBadge } from "@lms/ui";

import { TaskPanel } from "@/features/learn/task-panel";
import { PortalService, useRpcQuery } from "@lms/api-client";

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const q = useRpcQuery(PortalService.method.getMyTask, { id });
  if (q.isLoading) return <Skeleton className="h-96" />;
  const page = q.data?.page;
  if (!page) return <EmptyState title="Task not available" />;
  const t = page.task!;
  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/learn/watch/${t.videoId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t.videoTitle}</Link>
      <div className="mt-3 mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{t.courseTitle}</p>
          <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">{t.title}</h1>
        </div>
        <StatusBadge status={page.status} className="text-sm" />
      </div>
      <TaskPanel taskId={id} />
    </div>
  );
}
