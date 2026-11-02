"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardList, FileQuestion, Info, MessagesSquare, PlayCircle } from "lucide-react";
import { Badge, Button, Card, EmptyState, Markdown, Progress, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, VideoPlayer } from "@lms/ui";
import { $api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { TaskRow } from "@/features/learn/cards";
import { Playlist } from "@/features/learn/playlist";
import { VideoQA } from "@/features/learn/video-qa";

function Watch() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { me } = useSession();
  const q = $api.useQuery("get", "/api/v1/me/videos/{id}", { params: { path: { id } } });
  if (q.isLoading) return <div className="grid gap-6 lg:grid-cols-[1fr_400px]"><Skeleton className="aspect-video" /><Skeleton className="h-96" /></div>;
  if (!q.data) return <EmptyState title="Video not available" description="You may not be enrolled in this course." />;
  const { video: v, playlist, tasks, quizzes } = q.data;
  return (
    <div className="mx-auto grid max-w-[1700px] gap-6 xl:grid-cols-[1fr_420px]">
      <div className="min-w-0">
        <VideoPlayer embedUrl={v.embed_url} title={v.title} watermark={me ? `${me.name} · ${me.email}` : undefined} />
        <h1 className="mt-4 text-xl font-bold sm:text-2xl">{v.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href={`/learn/courses/${q.data.course_id}`} className="text-sm font-medium text-muted-foreground hover:text-foreground">{q.data.course_title}</Link>
          <div className="flex w-40 items-center gap-2"><Progress value={q.data.progress_pct} className="h-1.5" /><span className="text-xs text-muted-foreground">{q.data.progress_pct}%</span></div>
          <div className="ml-auto flex gap-2">
            {q.data.prev_id ? <Button variant="secondary" size="sm" asChild><Link href={`/learn/watch/${q.data.prev_id}`}><ChevronLeft /> Previous</Link></Button> : <Button variant="secondary" size="sm" disabled><ChevronLeft /> Previous</Button>}
            {q.data.next_id ? <Button size="sm" asChild><Link href={`/learn/watch/${q.data.next_id}`}>Next <ChevronRight /></Link></Button> : <Button size="sm" disabled>Next <ChevronRight /></Button>}
          </div>
        </div>
        <Tabs defaultValue={params.get("tab") ?? "tasks"} className="mt-6">
          <TabsList>
            <TabsTrigger value="tasks"><ClipboardList /> Tasks {tasks.length > 0 && <Badge variant="secondary">{tasks.length}</Badge>}</TabsTrigger>
            {quizzes.length > 0 && <TabsTrigger value="quizzes"><FileQuestion /> Quizzes</TabsTrigger>}
            <TabsTrigger value="qa"><MessagesSquare /> Q&A</TabsTrigger>
            <TabsTrigger value="about"><Info /> About</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks">
            {tasks.length === 0 ? <EmptyState icon={<PlayCircle />} title="No tasks for this video" description="Just watch and move to the next lesson." /> : <div className="space-y-2">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
          </TabsContent>
          <TabsContent value="quizzes">
            <div className="grid gap-3 sm:grid-cols-2">
              {quizzes.map((z) => (
                <Card key={z.id} className="p-4">
                  <div className="flex items-center gap-2 font-semibold"><FileQuestion className="size-4 text-info" />{z.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{z.question_count} questions · pass {z.pass_pct}%{z.time_limit_minutes ? ` · ${z.time_limit_minutes} min` : ""}{z.max_attempts ? ` · ${z.attempts_used}/${z.max_attempts} attempts` : ""}</p>
                  {z.attempts_used > 0 && <p className="mt-2 text-sm">Best: <b>{z.best_score}/{z.best_max}</b> {z.passed ? <Badge variant="success">Passed</Badge> : <Badge variant="warning">Not passed</Badge>}</p>}
                  {z.can_start ? <Button size="sm" className="mt-3" asChild><Link href={`/learn/quiz/${z.id}`}>{z.attempts_used ? "Try again" : "Start quiz"}</Link></Button> : <Button size="sm" className="mt-3" disabled>No attempts left</Button>}
                </Card>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="qa"><VideoQA videoId={v.id} /></TabsContent>
          <TabsContent value="about">{v.description ? <Markdown>{v.description}</Markdown> : <p className="text-sm text-muted-foreground">No description.</p>}</TabsContent>
        </Tabs>
      </div>
      <aside className="xl:sticky xl:top-16 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
        <div className="mb-2 px-2 font-semibold">Up next · {playlist.length} videos</div>
        <Playlist items={playlist} currentId={v.id} compact />
      </aside>
    </div>
  );
}

export default function WatchPage() {
  return <React.Suspense><Watch /></React.Suspense>;
}
