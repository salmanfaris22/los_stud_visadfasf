"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Megaphone, Play, Video } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { Button, Card, EmptyState, LineBadge, Markdown, Skeleton, cn, formatTime, lineColor, timeAgo } from "@lms/ui";
import { $api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CourseLine, TaskRow } from "@/features/learn/cards";

function SectionHead({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {href && <Button variant="link" asChild><Link href={href}>{link} <ArrowRight /></Link></Button>}
    </div>
  );
}

/** The most useful next thing: the first open task, else the least-finished course. */
function NextStop({ d }: { d: Schemas["Dashboard"] }) {
  const t = d.next_tasks[0];
  const c = [...d.courses].filter((x) => x.progress_pct < 100).sort((a, b) => b.progress_pct - a.progress_pct)[0];
  if (!t && !c) {
    return (
      <div className="flex h-full flex-col justify-between rounded-[28px] bg-signal p-7 text-signal-foreground">
        <span className="text-sm font-bold opacity-70">Next stop</span>
        <div><div className="font-display text-3xl font-extrabold">All caught up</div><p className="mt-2 opacity-80">No tasks waiting right now.</p></div>
      </div>
    );
  }
  const key = t?.course_id ?? c!.course_id;
  const href = t ? `/learn/watch/${t.video_id}` : `/learn/courses/${c!.course_id}`;
  return (
    <Link href={href} className="dark group relative flex h-full min-h-56 flex-col overflow-hidden rounded-[28px] bg-rail p-7 text-foreground">
      <div className="map-grid pointer-events-none absolute inset-0 opacity-60" />
      <svg aria-hidden viewBox="0 0 300 120" className="pointer-events-none absolute -right-6 bottom-6 w-[62%] max-w-80" fill="none">
        <path d="M0 90 H120 Q150 90 165 70 L190 40 Q205 20 235 20 H300" stroke={lineColor(key)} strokeWidth="10" strokeLinecap="round" />
        <circle cx="120" cy="90" r="9" fill="var(--card)" stroke="#edf0f7" strokeWidth="4" />
        <circle cx="235" cy="20" r="14" fill="var(--signal)" className="here-pulse" />
        <circle cx="235" cy="20" r="10" fill="var(--signal)" stroke="#edf0f7" strokeWidth="4" />
      </svg>
      <div className="relative flex items-center gap-2 text-sm font-bold text-signal"><span className="size-2.5 rounded-full bg-signal" />Next stop</div>
      <div className="relative mt-auto max-w-md pt-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><LineBadge id={key} name={t?.course_title ?? c!.title} size="sm" />{t ? t.course_title : c!.title}</div>
        <div className="mt-2 font-display text-2xl leading-tight font-extrabold sm:text-[28px]">{t ? t.title : `${c!.progress_pct}% of the way there`}</div>
        <p className="mt-1.5 text-sm text-muted-foreground">{t ? `Lesson: ${t.video_title}` : `${c!.approved_tasks} of ${c!.total_tasks} tasks approved`}</p>
        <span className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-signal px-5 text-sm font-semibold text-signal-foreground transition group-hover:bg-signal-strong">
          <Play className="size-4 fill-current" /> {t ? "Open the lesson" : "Continue"}
        </span>
      </div>
    </Link>
  );
}

function Departures({ items }: { items: Schemas["LiveSession"][] }) {
  const now = Date.now();
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border bg-card shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="font-display text-lg font-extrabold">Departures</h2>
        <Link href="/learn/live" className="text-xs font-semibold text-muted-foreground hover:text-foreground">All live classes</Link>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><Video className="size-5" />No live classes scheduled</div>
      ) : (
        <ul className="divide-y">
          {items.slice(0, 4).map((s) => {
            const live = now >= new Date(s.starts_at).getTime() && now <= new Date(s.ends_at).getTime();
            return (
              <li key={s.id}>
                <Link href="/learn/live" className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-muted/50">
                  <span className="w-14 font-display text-lg font-extrabold tabular-nums">{formatTime(s.starts_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{new Date(s.starts_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {s.host_name}</span>
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", live ? "bg-destructive text-white" : "bg-muted text-muted-foreground")}>
                    <span className={cn("size-1.5 rounded-full", live ? "animate-ping bg-white" : "bg-success")} />{live ? "Live" : "On time"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function LearnHome() {
  const { me } = useSession();
  const q = $api.useQuery("get", "/api/v1/me/dashboard");
  const d = q.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const closest = d?.courses.filter((c) => c.progress_pct < 100 && c.total_tasks > 0).sort((a, b) => b.progress_pct - a.progress_pct)[0];
  const left = closest ? closest.total_tasks - closest.approved_tasks : 0;
  const counters = d ? [
    { label: "To do", value: d.stats.to_do, href: "/learn/tasks" },
    { label: "In review", value: d.stats.in_review, href: "/learn/tasks" },
    { label: "Approved", value: d.stats.approved, href: "/learn/tasks" },
    { label: "Certificates", value: d.stats.certificates, href: "/learn/certificates" },
  ] : [];
  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-extrabold sm:text-[36px]">{greet}, {me?.name.split(" ")[0]}</h1>
        <p className="mt-1.5 text-muted-foreground">
          {closest ? <>{left} stop{left === 1 ? "" : "s"} left on your <b className="text-foreground">{closest.title}</b> line.</> : "Pick up where you left off."}
        </p>
      </div>
      {q.isLoading || !d ? (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><Skeleton className="h-64 rounded-[28px]" /><Skeleton className="h-64 rounded-[28px]" /><Skeleton className="h-72 rounded-[28px] lg:col-span-2" /></div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <NextStop d={d} />
            <Departures items={d.upcoming_live} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {counters.map((c, i) => (
              <Link key={c.label} href={c.href} className="group rounded-[20px] border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:shadow-none">
                <span className="block h-1.5 w-7 rounded-full" style={{ background: `var(--line-${[1, 4, 3, 2][i]})` }} />
                <div className="mt-4 font-display text-3xl leading-none font-extrabold tabular-nums">{c.value}</div>
                <div className="mt-1.5 text-sm text-muted-foreground">{c.label}</div>
              </Link>
            ))}
          </div>

          <section>
            <SectionHead title="Your lines" href="/learn/courses" link="All courses" />
            {d.courses.length === 0 ? <EmptyState title="No courses yet" description="Your institute will assign courses to you. They appear here." /> : (
              <Card className="divide-y p-2">{d.courses.map((c) => <CourseLine key={c.enrollment_id} c={c} />)}</Card>
            )}
          </section>

          <section>
            <SectionHead title="Next tasks" href="/learn/tasks" link="All tasks" />
            {d.next_tasks.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="All done!" description="No tasks waiting for you right now." /> : <div className="space-y-2.5">{d.next_tasks.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
          </section>

          {d.announcements.length > 0 && (
            <section>
              <SectionHead title="Announcements" href="/learn/announcements" link="All" />
              <div className="grid gap-4 md:grid-cols-2">
                {d.announcements.map((a) => (
                  <Card key={a.id} className="p-6">
                    <div className="flex items-center gap-2.5 font-bold"><span className="flex size-8 items-center justify-center rounded-full bg-signal text-signal-foreground"><Megaphone className="size-4" /></span>{a.title}</div>
                    <Markdown className="mt-3 line-clamp-4 text-sm text-muted-foreground">{a.body}</Markdown>
                    <p className="mt-3 text-xs text-muted-foreground">{a.author_name} · {timeAgo(a.created_at)}</p>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
