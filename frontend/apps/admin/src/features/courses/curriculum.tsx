"use client";
import * as React from "react";
import { ChevronDown, ClipboardList, Clock, Eye, FileQuestion, Info, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CourseVersionService, errorMessage, type Task, type Video as VideoItem, CourseService, QuizService, useRpcMutation, useRpcQuery } from "@lms/api-client";
import { Badge, Button, Card, EmptyState, Skeleton, cn, formatDuration, toast, useConfirm, asDate } from "@lms/ui";
import { invalidate, rpc } from "@/lib/api";
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
  const q = useRpcQuery(QuizService.method.listVideoQuizzes, { videoId }, { enabled: can("quizzes"), select: (r) => r.items });
  const qc = useQueryClient();
  const confirm = useConfirm();
  const del = useRpcMutation(QuizService.method.deleteQuiz, feedback(qc, "Quiz deleted", [QuizService, CourseVersionService]));
  if (!can("quizzes")) return null;
  return (
    <div className="mt-3 space-y-2">
      {q.data?.map((z) => (
        <div key={z.id} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm">
          <FileQuestion className="size-4 text-info" />
          <span className="flex-1 font-medium">{z.title}</span>
          <span className="text-xs text-muted-foreground">{z.questionCount} questions · pass {z.passPct}% · {z.attemptCount} attempts</span>
          {can("quizzes", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setEdit({ id: z.id })} aria-label="Edit quiz"><Pencil /></Button>}
          {can("quizzes", "delete") && <Button variant="ghost" size="icon-sm" onClick={async () => { if (await confirm({ title: `Delete quiz “${z.title}”?`, destructive: true, confirmText: "Delete" })) del.mutate({ id: z.id }); }} aria-label="Delete quiz"><Trash2 /></Button>}
        </div>
      ))}
      {can("quizzes", "create") && <Button variant="ghost" size="sm" onClick={() => setEdit({})}><Plus /> Quiz</Button>}
      <QuizBuilder videoId={videoId} quizId={edit?.id} open={!!edit} onOpenChange={(o) => !o && setEdit(null)} />
    </div>
  );
}

function VideoCard({ courseId, video, handle }: { courseId: string; video: VideoItem; handle: React.ReactNode }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [open, setOpen] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [task, setTask] = React.useState<{ task?: Task } | null>(null);
  const paths = [CourseService, CourseVersionService];
  const delVideo = useRpcMutation(CourseService.method.deleteVideo, feedback(qc, "Video deleted", paths));
  const delTask = useRpcMutation(CourseService.method.deleteTask, feedback(qc, "Task deleted", paths));
  const reorderTasks = async (ids: string[]) => {
    await rpc(CourseService).reorderTasks({ videoId: video.id, ids }).catch((e) => toast.error(errorMessage(e)));
    void invalidate(qc, ...paths);
  };
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {can("courses", "edit") && handle}
        <div className="relative hidden h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="size-full object-cover" /> : <Video className="m-auto mt-5 size-6 text-muted-foreground" />}
          {video.durationSeconds > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(video.durationSeconds)}</span>}
        </div>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{video.position + 1}.</span>
            <span className="truncate font-medium">{video.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded px-1.5 py-0.5 font-medium capitalize", providerColor[video.provider])}>{video.provider}</span>
            {video.isPreview && <Badge variant="info"><Eye /> Free preview</Badge>}
            <span className="inline-flex items-center gap-1"><ClipboardList className="size-3" />{video.tasks.length} tasks</span>
            {video.durationSeconds > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{formatDuration(video.durationSeconds)}</span>}
          </div>
        </button>
        {can("courses", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit video"><Pencil /></Button>}
        {can("courses", "delete") && (
          <Button variant="ghost" size="icon-sm" aria-label="Delete video" onClick={async () => { if (await confirm({ title: `Delete “${video.title}”?`, description: "It leaves the curriculum with its tasks and quizzes. Students on a built version keep it, with their work, until you move them.", destructive: true, confirmText: "Delete" })) delVideo.mutate({ id: video.id }); }}><Trash2 /></Button>
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
                <span className="hidden text-xs text-muted-foreground md:inline">{t.allowedTypes.join(" · ")} · {t.maxMarks} marks{t.dueAt && ` · due ${asDate(t.dueAt).toLocaleDateString()}`}</span>
                {can("courses", "edit") && <Button variant="ghost" size="icon-sm" onClick={() => setTask({ task: t })} aria-label="Edit task"><Pencil /></Button>}
                {can("courses", "delete") && <Button variant="ghost" size="icon-sm" aria-label="Delete task" onClick={async () => { if (await confirm({ title: `Delete task “${t.title}”?`, description: "It leaves the curriculum. Students on a built version keep it, with their work, until you move them.", destructive: true, confirmText: "Delete" })) delTask.mutate({ id: t.id }); }}><Trash2 /></Button>}
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
  const q = useRpcQuery(CourseService.method.getCurriculum, { courseId }, { select: (r) => r.items });
  const summary = useVersionSummary(courseId);
  const reorder = async (ids: string[]) => {
    await rpc(CourseService).reorderVideos({ courseId, ids }).catch((e) => toast.error(errorMessage(e)));
    void invalidate(qc, CourseService, CourseVersionService);
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
