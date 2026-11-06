"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState, Skeleton, StatusBadge } from "@lms/ui";
import { $api } from "@/lib/api";
import { TaskPanel } from "@/features/learn/task-panel";

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const q = $api.useQuery("get", "/api/v1/me/tasks/{id}", { params: { path: { id } } });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Task not available" />;
  const t = q.data.task;
  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/learn/watch/${t.video_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t.video_title}</Link>
      <div className="mt-3 mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{t.course_title}</p>
          <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">{t.title}</h1>
        </div>
        <StatusBadge status={q.data.status} className="text-sm" />
      </div>
      <TaskPanel taskId={id} />
    </div>
  );
}
