"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Award, Check, CheckCircle2, ChevronRight, ClipboardCheck, MonitorPlay, Play } from "lucide-react";
import { Avatar, Button, EmptyState, Markdown, Skeleton, cn, formatDuration, formatHours } from "@lms/ui";
import { $api } from "@/lib/api";
import { CourseCover, ThinProgress, accent } from "@/features/learn/course-card";

export default function MyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const q = $api.useQuery("get", "/api/v1/me/courses/{id}", { params: { path: { id } } });
  const [more, setMore] = React.useState(false);

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Course not available" description="You may not be enrolled in this course." />;

  const { course: c, playlist, mentors, what_you_learn, description } = q.data;
  const next = playlist.find((v) => !v.done) ?? playlist[0];
  const doneCount = playlist.filter((v) => v.done).length;
  const totalSec = playlist.reduce((s, v) => s + (v.duration_seconds || 0), 0);
  const taskCount = playlist.reduce((s, v) => s + v.task_count, 0);
  const finished = c.progress_pct >= 100;
  const cta = finished ? "Watch again" : c.progress_pct > 0 ? "Continue course" : "Start course";
  const longText = description.length > 600;

  const sideCard = (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl dark:border-rail-border">
      <Link href={next ? `/learn/watch/${next.id}` : "#"} className="group relative block aspect-video overflow-hidden bg-muted">
        <CourseCover id={id} title={c.title} label={c.category} src={c.thumbnail_url || next?.thumbnail_url} />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25 transition group-hover:bg-black/40">
          <span className="flex size-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition group-hover:scale-110"><Play className="size-6 translate-x-0.5 fill-current" /></span>
        </span>
      </Link>
      <div className="p-5">
        {next ? (
          <Button size="lg" asChild className={cn("h-12 w-full rounded-md text-base font-bold", accent.button)}>
            <Link href={`/learn/watch/${next.id}`}>{cta}</Link>
          </Button>
        ) : <p className="text-sm text-muted-foreground">Lessons will appear here soon.</p>}
        {next && !finished && <p className="mt-2.5 truncate text-center text-xs text-muted-foreground">Up next: <b className="text-foreground">{next.title}</b></p>}
        <h3 className="mt-5 text-sm font-bold">This course includes:</h3>
        <ul className="mt-2.5 space-y-2 text-sm">
          <li className="flex items-center gap-2.5"><MonitorPlay className="size-4 text-muted-foreground" />{formatHours(totalSec)} of video in {playlist.length} lectures</li>
          <li className="flex items-center gap-2.5"><ClipboardCheck className="size-4 text-muted-foreground" />{taskCount} hands-on task{taskCount === 1 ? "" : "s"} reviewed by mentors</li>
          <li className="flex items-center gap-2.5"><Award className="size-4 text-muted-foreground" />Certificate of completion</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Desktop: card floats over the hero and sticks while scrolling, like Udemy */}
      <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
        <div className="mx-auto flex h-full max-w-7xl justify-end pt-11">
          <div className="pointer-events-auto w-[340px]"><div className="sticky top-20">{sideCard}</div></div>
        </div>
      </div>

      {/* Hero band */}
      <div className="-mx-4 -mt-7 bg-rail text-rail-foreground sm:-mx-6 lg:-mx-8">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8 lg:py-10">
          <div className="min-w-0 lg:py-2">
            <nav className="flex flex-wrap items-center gap-1 text-sm font-bold text-violet-300" aria-label="Breadcrumb">
              <Link href="/learn/courses" className="hover:text-violet-200">My learning</Link>
              {c.category && <><ChevronRight className="size-4 text-rail-muted" /><span>{c.category}</span></>}
            </nav>
            <h1 className="mt-3 font-display text-[28px] leading-tight font-extrabold sm:text-[36px]">{c.title}</h1>
            {c.subtitle && <p className="mt-3 max-w-3xl text-base sm:text-lg">{c.subtitle}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {c.level && <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950 capitalize">{c.level}</span>}
              {c.batch_name && <span>Batch <b>{c.batch_name}</b></span>}
              <span className="text-rail-muted">{playlist.length} lectures · {formatHours(totalSec)} total</span>
            </div>
            {mentors.length > 0 && (
              <p className="mt-3 text-sm">Mentors {mentors.map((m, i) => <React.Fragment key={m.id}>{i > 0 && ", "}<b className="text-violet-300">{m.name}</b></React.Fragment>)}</p>
            )}
            <div className="mt-6 max-w-md">
              <div className="mb-1.5 flex justify-between text-xs text-rail-muted">
                <span><b className="text-rail-foreground tabular-nums">{c.progress_pct}%</b> complete</span>
                <span className="tabular-nums">{c.approved_tasks}/{c.total_tasks} tasks approved</span>
              </div>
              <ThinProgress value={c.progress_pct} className="bg-white/15" />
            </div>
          </div>

          {/* Side card on phones and tablets */}
          <div className="lg:hidden">{sideCard}</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 pt-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-9">
          {what_you_learn.length > 0 && (
            <section className="rounded-lg border p-6">
              <h2 className="font-display text-xl font-extrabold">What you'll learn</h2>
              <ul className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                {what_you_learn.map((w) => <li key={w} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0" />{w}</li>)}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-display text-xl font-extrabold">Course content</h2>
            <p className="mt-2 mb-4 text-sm text-muted-foreground">{playlist.length} lectures · {formatHours(totalSec)} total length · {doneCount} done</p>
            {playlist.length === 0 ? (
              <p className="rounded-lg border p-5 text-sm text-muted-foreground">No lectures yet.</p>
            ) : (
              <ol className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                {playlist.map((v, i) => {
                  const isNext = v.id === next?.id && !finished;
                  return (
                    <li key={v.id}>
                      <Link href={`/learn/watch/${v.id}`} className="group block rounded-xl outline-offset-4">
                        <div className={cn("relative aspect-video overflow-hidden rounded-xl bg-muted ring-2 ring-transparent transition", isNext && "ring-violet-500")}>
                          <CourseCover id={id} title={v.title} label={`Lecture ${i + 1}`} src={v.thumbnail_url} className="transition duration-300 group-hover:scale-105" />
                          <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <Play className="size-9 fill-white text-white drop-shadow" />
                          </span>
                          {v.done && <CheckCircle2 className="absolute top-2 left-2 size-5 rounded-full bg-black/60 text-white" aria-label="Done" />}
                          {v.duration_seconds > 0 && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{formatDuration(v.duration_seconds)}</span>}
                        </div>
                        <span className="mt-2.5 line-clamp-2 text-sm leading-snug font-bold group-hover:underline">{i + 1}. {v.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {isNext ? <span className={cn("font-bold", accent.text)}>Up next · </span> : null}
                          {v.task_count > 0 ? `${v.approved_count}/${v.task_count} tasks approved` : "No tasks"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {description && (
            <section>
              <h2 className="font-display text-xl font-extrabold">Description</h2>
              <div className={cn("relative mt-3", longText && !more && "max-h-56 overflow-hidden")}>
                <Markdown>{description}</Markdown>
                {longText && !more && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background" />}
              </div>
              {longText && <button type="button" onClick={() => setMore(!more)} className={cn("mt-2 text-sm font-bold", accent.text)}>{more ? "Show less" : "Show more"}</button>}
            </section>
          )}

          {mentors.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-extrabold">{mentors.length === 1 ? "Mentor" : "Mentors"}</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {mentors.map((m) => (
                  <div key={m.id} className="flex items-center gap-4">
                    <Avatar src={m.avatar_url} name={m.name} className="size-16 text-lg" />
                    <span className="min-w-0">
                      <b className={cn("block underline-offset-2", accent.text)}>{m.name}</b>
                      <span className="block truncate text-sm text-muted-foreground">{m.email}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
