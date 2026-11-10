"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardList, FileQuestion, Info, MessagesSquare, PlayCircle } from "lucide-react";
import { Badge, Button, Card, EmptyState, LineBadge, Markdown, Progress, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, VideoPlayer, lineColor } from "@lms/ui";

import { useSession } from "@/lib/session";
import { TaskRow } from "@/features/learn/cards";
import { Playlist } from "@/features/learn/playlist";
import { VideoQA } from "@/features/learn/video-qa";
import { PortalService, useRpcQuery } from "@lms/api-client";

function Watch() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { me } = useSession();
  const q = useRpcQuery(PortalService.method.getWatchPage, { videoId: id });
  if (q.isLoading) return <div className="grid gap-6 lg:grid-cols-[1fr_400px]"><Skeleton className="aspect-video" /><Skeleton className="h-96" /></div>;
  const page = q.data?.page;
  if (!page?.video) return <EmptyState title="Video not available" description="You may not be enrolled in this course." />;
  const { video: v, playlist, tasks, quizzes } = page;
  const color = lineColor(page.courseId);
  const stop = playlist.findIndex((p) => p.id === v.id) + 1;
  return (
    <div className="mx-auto grid max-w-[1700px] gap-6 xl:grid-cols-[1fr_420px]">
      <div className="min-w-0">
        {/* dark stage in both themes */}
        <div className="rounded-[28px] bg-stage p-2 shadow-xl sm:p-3">
          <VideoPlayer embedUrl={v.embedUrl} title={v.title} watermark={me ? `${me.name} · ${me.email}` : undefined} />
          <div className="flex items-center gap-3 px-2 pt-3 pb-1 text-white/70">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${page.progressPct}%`, background: color }} /></span>
            <span className="text-xs font-semibold tabular-nums">Course {page.progressPct}%</span>
          </div>
        </div>
        <div className="mt-5 text-xs font-bold text-muted-foreground">{stop > 0 ? `Stop ${stop} of ${playlist.length}` : "Lesson"}</div>
        <h1 className="mt-1 font-display text-2xl leading-tight font-extrabold sm:text-[28px]">{v.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href={`/learn/courses/${page.courseId}`} className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3.5 pl-1 text-sm font-semibold transition hover:border-foreground/30"><LineBadge id={page.courseId} name={page.courseTitle} size="sm" />{page.courseTitle}</Link>
          <div className="sr-only"><Progress value={page.progressPct} /></div>
          <div className="ml-auto flex gap-2">
            {page.prevId ? <Button variant="outline" size="sm" asChild><Link href={`/learn/watch/${page.prevId}`}><ChevronLeft /> Previous</Link></Button> : <Button variant="outline" size="sm" disabled><ChevronLeft /> Previous</Button>}
            {page.nextId ? <Button size="sm" asChild><Link href={`/learn/watch/${page.nextId}`}>Next <ChevronRight /></Link></Button> : <Button size="sm" disabled>Next <ChevronRight /></Button>}
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
                <Card key={z.id} className="p-5">
                  <div className="flex items-center gap-2 font-semibold"><FileQuestion className="size-4 text-info" />{z.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{z.questionCount} questions · pass {z.passPct}%{z.timeLimitMinutes ? ` · ${z.timeLimitMinutes} min` : ""}{z.maxAttempts ? ` · ${z.attemptsUsed}/${z.maxAttempts} attempts` : ""}</p>
                  {z.attemptsUsed > 0 && <p className="mt-2 text-sm">Best: <b>{z.bestScore}/{z.bestMax}</b> {z.passed ? <Badge variant="success">Passed</Badge> : <Badge variant="warning">Not passed</Badge>}</p>}
                  {z.canStart ? <Button size="sm" className="mt-3" asChild><Link href={`/learn/quiz/${z.id}`}>{z.attemptsUsed ? "Try again" : "Start quiz"}</Link></Button> : <Button size="sm" className="mt-3" disabled>No attempts left</Button>}
                </Card>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="qa"><VideoQA videoId={v.id} /></TabsContent>
          <TabsContent value="about">{v.description ? <Markdown>{v.description}</Markdown> : <p className="text-sm text-muted-foreground">No description.</p>}</TabsContent>
        </Tabs>
      </div>
      <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <div className="rounded-[20px] border bg-card p-2 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between px-3 pt-2 pb-2"><span className="font-display font-extrabold">Route</span><span className="text-xs font-semibold text-muted-foreground">{playlist.length} stops</span></div>
          <Playlist items={playlist} currentId={v.id} compact color={color} />
        </div>
      </aside>
    </div>
  );
}

export default function WatchPage() {
  return <React.Suspense><Watch /></React.Suspense>;
}
