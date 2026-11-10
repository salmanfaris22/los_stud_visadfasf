"use client";
import * as React from "react";
import { ChevronDown, ClipboardList, Clock, Eye, FileQuestion, Info, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CourseVersionService, errorMessage, type Schemas } from "@lms/api-client";
import { Badge, Button, Card, EmptyState, Skeleton, cn, formatDuration, toast, useConfirm } from "@lms/ui";
import { $api, api, invalidate } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { SortableList } from "@/features/common/sortable";
import { QuizBuilder } from "./quiz-builder";
import { TaskDialog } from "./task-dialog";
import { useVersionSummary } from "./version-dialog";
import { VideoDialog } from "./video-dialog";

const providerColor: Record<string, string> = { youtube: "bg-red-500/15 text-red-500", vimeo: "bg-sky-500/15 text-sky-500", bunny: "bg-orange-500/15 text-orange-500", cloudflare: "bg-amber-500/15 text-amber-600" };

function Quizzes({ videoId }: { videoId: string }) {
  const { can } = useSession();
  const [edit, setEdit] = React.useState<{ id?: string } | null>(null);
  const q = $api.useQuery("get", "/api/v1/videos/{id}/quizzes", { params: { path: { id: videoId } } }, { enabled: can("quizzes") });
  const qc = useQueryClient();
  const confirm = useConfirm();
  const del = $api.useMutation("delete", "/api/v1/quizzes/{id}", feedback(qc, "Quiz deleted", [`/api/v1/videos/${videoId}/quizzes`, CourseVersionService]));
  if (!can("quizzes")) return null;
  return (
    <div className="mt-3 space-y-2">
      {q.data?.map((z) => (
        <div key={z.id} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm">
          <FileQuestion className="size-4 text-info" />
          <span className="flex-1 font-medium">{z.title}</span>
          <span className="text-xs text-muted-foreground">{z.question_count} questions · pass {z.pass_pct}% · {z.attempt_count} attempts</span>
          {can("quizzes", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setEdit({ id: z.id })} aria-label="Edit quiz"><Pencil /></Button>}
          {can("quizzes", "delete") && <Button variant="ghost" size="icon-sm" onClick={async () => { if (await confirm({ title: `Delete quiz “${z.title}”?`, destructive: true, confirmText: "Delete" })) del.mutate({ params: { path: { id: z.id } } }); }} aria-label="Delete quiz"><Trash2 /></Button>}
        </div>
      ))}
      {can("quizzes", "create") && <Button variant="ghost" size="sm" onClick={() => setEdit({})}><Plus /> Quiz</Button>}
      <QuizBuilder videoId={videoId} quizId={edit?.id} open={!!edit} onOpenChange={(o) => !o && setEdit(null)} />
    </div>
  );
}

function VideoCard({ courseId, video, handle }: { courseId: string; video: Schemas["Video"]; handle: React.ReactNode }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [open, setOpen] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [task, setTask] = React.useState<{ task?: Schemas["Task"] } | null>(null);
  const paths = [`/api/v1/courses/${courseId}`, CourseVersionService];
  const delVideo = $api.useMutation("delete", "/api/v1/videos/{id}", feedback(qc, "Video deleted", paths));
  const delTask = $api.useMutation("delete", "/api/v1/tasks/{id}", feedback(qc, "Task deleted", paths));
  const reorderTasks = async (ids: string[]) => {
    const r = await api.client.PUT("/api/v1/videos/{id}/tasks/order", { params: { path: { id: video.id } }, body: { ids } });
    if (r.error) toast.error(errorMessage(r.error));
    void invalidate(qc, ...paths);
  };
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {can("courses", "edit") && handle}
        <div className="relative hidden h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" className="size-full object-cover" /> : <Video className="m-auto mt-5 size-6 text-muted-foreground" />}
          {video.duration_seconds > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(video.duration_seconds)}</span>}
        </div>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{video.position + 1}.</span>
            <span className="truncate font-medium">{video.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded px-1.5 py-0.5 font-medium capitalize", providerColor[video.provider])}>{video.provider}</span>
            {video.is_preview && <Badge variant="info"><Eye /> Free preview</Badge>}
            <span className="inline-flex items-center gap-1"><ClipboardList className="size-3" />{video.tasks.length} tasks</span>
            {video.duration_seconds > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{formatDuration(video.duration_seconds)}</span>}
          </div>
        </button>
        {can("courses", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit video"><Pencil /></Button>}
        {can("courses", "delete") && (
          <Button variant="ghost" size="icon-sm" aria-label="Delete video" onClick={async () => { if (await confirm({ title: `Delete “${video.title}”?`, description: "It leaves the curriculum with its tasks and quizzes. Students on a built version keep it, with their work, until you move them.", destructive: true, confirmText: "Delete" })) delVideo.mutate({ params: { path: { id: video.id } } }); }}><Trash2 /></Button>
        )}
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </div>
      {open && (
        <div className="border-t bg-muted/20 px-4 py-3 sm:pl-12">
          <SortableList
            items={video.tasks}
            onReorder={reorderTasks}
            className="space-y-2"
            render={(t, h) => (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-sm">
                {can("courses", "edit") && h}
                <ClipboardList className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <span className="hidden text-xs text-muted-foreground md:inline">{t.allowed_types.join(" · ")} · {t.max_marks} marks{t.due_at && ` · due ${new Date(t.due_at).toLocaleDateString()}`}</span>
                {can("courses", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setTask({ task: t })} aria-label="Edit task"><Pencil /></Button>}
                {can("courses", "delete") && <Button variant="ghost" size="icon-sm" aria-label="Delete task" onClick={async () => { if (await confirm({ title: `Delete task “${t.title}”?`, description: "It leaves the curriculum. Students on a built version keep it, with their work, until you move them.", destructive: true, confirmText: "Delete" })) delTask.mutate({ params: { path: { id: t.id } } }); }}><Trash2 /></Button>}
              </div>
            )}
          />
          {can("courses", "create") && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTask({})}><Plus /> Task</Button>}
          <Quizzes videoId={video.id} />
        </div>
      )}
      <VideoDialog courseId={courseId} video={video} open={editing} onOpenChange={setEditing} />
      <TaskDialog courseId={courseId} videoId={video.id} task={task?.task} open={!!task} onOpenChange={(o) => !o && setTask(null)} />
    </Card>
  );
}

/** Course → videos → tasks (+ quizzes) builder with drag & drop ordering. */
export function Curriculum({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [adding, setAdding] = React.useState(false);
  const q = $api.useQuery("get", "/api/v1/courses/{id}/curriculum", { params: { path: { id: courseId } } });
  const summary = useVersionSummary(courseId);
  const reorder = async (ids: string[]) => {
    const r = await api.client.PUT("/api/v1/courses/{id}/videos/order", { params: { path: { id: courseId } }, body: { ids } });
    if (r.error) toast.error(errorMessage(r.error));
    void invalidate(qc, `/api/v1/courses/${courseId}`, CourseVersionService);
  };
  if (q.isLoading) return <Skeleton className="h-64" />;
  const videos = q.data ?? [];
  const tasks = videos.reduce((n, v) => n + v.tasks.length, 0);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{videos.length} videos · {tasks} tasks · drag to reorder</p>
        {can("courses", "create") && <Button onClick={() => setAdding(true)}><Plus /> Add video</Button>}
      </div>
      {can("courses", "edit") && summary.data?.hasChanges && summary.data.versions.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>Nobody sees these changes yet. <b>Build update</b> releases them to new students, then you can move current students across.</span>
        </p>
      )}
      {videos.length === 0 ? (
        <EmptyState icon={<Video />} title="No videos yet" description="Add YouTube, Vimeo, Bunny or Cloudflare videos, then add tasks under each one." action={can("courses", "create") && <Button onClick={() => setAdding(true)}><Plus /> Add first video</Button>} />
      ) : (
        <SortableList items={videos} onReorder={reorder} render={(v, h) => <VideoCard courseId={courseId} video={v} handle={h} />} />
      )}
      <VideoDialog courseId={courseId} open={adding} onOpenChange={setAdding} />
    </div>
  );
}
