"use client";
import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, ChevronLeft, ChevronRight, CirclePlus, Eye, LayoutGrid, Link2,
  PlayCircle, Sparkles, UsersRound, X,
} from "lucide-react";
import { Avatar, EmptyState, Skeleton, cn, formatTime, timeAgo } from "@lms/ui";
import { invalidatePaths } from "@lms/api-client";
import { $api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Coil, Flower } from "@/features/dashboard/lilac-art";

const box = "rounded-[24px] bg-card";
const DAY = 86_400_000;
/* Pastel discs for people without a photo */
const SOFT = ["bg-[var(--lilac-soft)]", "bg-[var(--blush-soft)]", "bg-[var(--sky-soft)]", "bg-[var(--mint-soft)]"];
const softAvatar = (i: number) => cn(SOFT[i % SOFT.length], "[&>span]:text-foreground/80 [&>span]:font-semibold");

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ───────────────────────── left column ───────────────────────── */

function Hero({ canStudents }: { canStudents: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#d3c5f5] via-[#d8cbf7] to-[#e2d6fa] px-6 py-6 text-[#16151b] sm:px-7 dark:from-[#2d2550] dark:via-[#30285a] dark:to-[#3a2f66] dark:text-white">
      <Flower className="pointer-events-none absolute -top-10 -right-6 size-56 opacity-35 sm:right-4 sm:opacity-95" />
      <div className="relative max-w-[60%] min-w-[16rem]">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[32px]">Learning's always better together</h1>
      </div>
      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-4 pr-0 sm:pr-40">
        <p className="max-w-md text-sm leading-relaxed text-[#3d3850] dark:text-white/75">
          Add students and mentors and you'll quickly get a sense of what's happening across your academy.
        </p>
        {canStudents && (
          <Link href="/students" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#141318] px-5 text-sm font-medium text-white transition hover:bg-black">
            <CirclePlus className="size-[18px]" /> Add student
          </Link>
        )}
      </div>
    </section>
  );
}

function Members() {
  const q = $api.useQuery("get", "/api/v1/students", { params: { query: { per_page: 6 } } });
  const items = q.data?.items ?? [];
  return (
    <section className={cn(box, "flex flex-col p-5")}>
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Students</h2>
        <Link href="/students" aria-label="All students" className="text-foreground/80 hover:text-foreground"><CirclePlus className="size-5" /></Link>
      </div>
      {q.isLoading ? (
        <div className="mt-4 grid grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="mx-auto size-16 rounded-full" />)}</div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No students yet.</p>
      ) : (
        <ul className="mt-4 grid max-h-[188px] grid-cols-3 gap-x-2 gap-y-3 overflow-hidden">
          {items.map((s, i) => {
            const [first, ...rest] = s.name.split(" ");
            return (
              <li key={s.id}>
                <Link href={`/students/${s.id}`} className="group flex flex-col items-center text-center">
                  <Avatar src={s.avatar_url} name={s.name} className={cn("size-[68px] transition group-hover:scale-105 [&>span]:text-base", softAvatar(i))} />
                  <span className="mt-1.5 text-[13px] leading-tight">{first}<br />{rest.join(" ") || " "}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskData({ daily, pending }: { daily: { submitted: number; approved: number }[]; pending: number }) {
  const submitted = sum(daily.map((d) => d.submitted));
  const approved = sum(daily.map((d) => d.approved));
  const other = Math.max(submitted - approved - pending, 0);
  const segs = [
    { label: "approved", value: approved, bar: "h-3 bg-foreground", dot: "bg-foreground" },
    { label: "waiting", value: pending, bar: "h-3 bg-[var(--lilac)]", dot: "bg-[var(--lilac)]" },
    { label: "returned", value: other, bar: "h-1 bg-border", dot: "bg-border" },
  ];
  const total = Math.max(approved + pending + other, 1);
  return (
    <section className={cn(box, "flex flex-col p-5")}>
      <div className="flex items-center justify-between text-sm">
        <span>Tasks · 30 days</span>
        <Link href="/submissions" aria-label="Task reviews" className="hover:text-muted-foreground"><ArrowRight className="size-[18px]" /></Link>
      </div>
      <div className="mt-3 text-[46px] leading-none font-medium tracking-[-0.03em] tabular-nums">{submitted}<span className="ml-1 text-base font-normal text-muted-foreground">sent</span></div>
      <div className="mt-auto flex gap-1.5 pt-6">
        {segs.map((s) => (
          <div key={s.label} className="min-w-12 border-l border-border pl-1" style={{ flexGrow: Math.max(s.value, total * 0.12) }}>
            <div className="text-[11px] text-muted-foreground tabular-nums">{s.value} {s.label}</div>
            <div className={cn("mt-6 -ml-1 rounded-full", s.bar)} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] font-medium tabular-nums">
        {segs.map((s) => <span key={s.label} className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", s.dot)} />{Math.round((s.value / total) * 100)}%</span>)}
      </div>
    </section>
  );
}

function Impact({ daily }: { daily: { submitted: number }[] }) {
  const last = daily.slice(-21);
  const weeks = [0, 1, 2].map((w) => sum(last.slice(w * 7, w * 7 + 7).map((d) => d.submitted)));
  const max = Math.max(...weeks, 1);
  const top = weeks.indexOf(Math.max(...weeks));
  const names = ["2 weeks ago", "Last week", "This week"];
  return (
    <section className={cn(box, "flex flex-col p-5")}>
      <span className="text-sm">Weekly</span>
      <div className="mt-auto flex h-28 items-end justify-center gap-2.5 pt-4">
        {weeks.map((v, i) => (
          <div key={i} title={`${names[i]}: ${v} tasks`} className={cn("w-7 rounded-full transition-[height] duration-700", i === top ? "bg-[var(--lilac)]" : "bg-[var(--blush-soft)]")}
            style={{ height: `${Math.max(18, (v / max) * 100)}%` }} />
        ))}
      </div>
    </section>
  );
}

function Statistics({ daily, published, batches }: { daily: { submitted: number; approved: number }[]; published: number; batches: number }) {
  const [range, setRange] = React.useState<"week" | "month">("week");
  const rows = range === "week" ? daily.slice(-7) : daily;
  const approved = sum(rows.map((d) => d.approved));
  const submitted = sum(rows.map((d) => d.submitted));
  return (
    <section className={cn(box, "flex flex-col p-5")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Statistics</h2>
        <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist">
          {(["week", "month"] as const).map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}
              className={cn("rounded-full px-2.5 py-0.5 transition", range === r ? "bg-foreground text-background" : "text-foreground/80 hover:text-foreground")}>
              {r === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <span className="text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums">{approved}</span>
        <span className="mb-1 h-9 w-px bg-border" />
        <span className="text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums">{submitted}</span>
        <span className="mb-1 ml-1 text-sm text-muted-foreground">tasks approved</span>
      </div>
      <div className="mt-5 grid flex-1 grid-cols-2 gap-3">
        <Link href="/courses" className="flex min-h-36 flex-col items-center justify-center rounded-[18px] bg-muted p-4 text-center transition hover:bg-accent">
          <span className="size-6 rounded-[3px] border-[1.5px] border-foreground/60" />
          <span className="mt-6 text-lg font-medium tabular-nums">{published}</span>
          <span className="text-sm text-foreground/75">Courses published</span>
        </Link>
        <Link href="/batches" className="flex min-h-36 flex-col items-center justify-center rounded-[18px] bg-muted p-4 text-center transition hover:bg-accent">
          <span className="size-7 rounded-full border-[1.5px] border-foreground/60" />
          <span className="mt-6 text-lg font-medium tabular-nums">{batches}</span>
          <span className="text-sm text-foreground/75">Batches running</span>
        </Link>
      </div>
    </section>
  );
}

type Live = { id: string; title: string; starts_at: string; ends_at: string; status: string; host_name: string };

function NextClass({ day, classes }: { day: Date; classes: Live[] }) {
  const [hidden, setHidden] = React.useState<string[]>([]);
  const list = classes.filter((l) => l.status === "scheduled" && sameDay(new Date(l.starts_at), day) && !hidden.includes(l.id));
  const first = list[0];
  return (
    <section className="dark relative flex min-h-[106px] items-center rounded-[24px] bg-rail px-5 py-5 text-foreground ring-1 ring-transparent [:root.dark_&]:ring-border">
      {first ? (
        <div className="relative w-full">
          {list.length > 1 && <div className="absolute inset-x-4 -bottom-2.5 h-full rounded-full bg-white/70" aria-hidden />}
          <div className="relative flex items-center gap-3 rounded-full bg-white py-2 pr-2 pl-2 text-[#16151b] shadow-[0_8px_18px_-10px_rgb(0_0_0/0.6)]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ece6fc] text-[#5b44b8]"><LayoutGrid className="size-4" /></span>
            <Link href={`/live/${first.id}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{first.title}</span>
              <span className="block text-xs text-[#6e6c78]">{formatTime(first.starts_at)}{first.host_name ? ` · ${first.host_name}` : ""}</span>
            </Link>
            <button onClick={() => setHidden((h) => [...h, first.id])} aria-label="Hide this class" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#16151b]/70 hover:bg-[#f1eefa]">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center gap-3 text-sm text-muted-foreground">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"><CalendarDays className="size-4" /></span>
          No live classes on {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
          <Link href="/live" className="ml-auto text-xs font-medium text-white/80 hover:text-white">All live</Link>
        </div>
      )}
    </section>
  );
}

function Promo() {
  return (
    <section className={cn(box, "flex gap-4 p-3 pr-5")}>
      <div className="flex w-[118px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-b from-[#efe7fd] to-[#fbe6f3] dark:from-[#2a2440] dark:to-[#33232f]">
        <Coil className="h-44 w-auto" />
      </div>
      <div className="flex flex-col py-3">
        <h3 className="text-[22px] leading-tight font-medium tracking-[-0.02em]">Grow your<br />academy</h3>
        <p className="mt-2.5 text-sm text-muted-foreground">Publish a new course and open its first batch.</p>
        <Link href="/courses" className="mt-auto inline-flex h-10 w-fit items-center gap-2 rounded-full bg-[var(--lilac)] px-4 text-[15px] font-medium text-[#1d1633] transition hover:brightness-95 dark:text-white">
          <Sparkles className="size-[18px]" /> New course
        </Link>
      </div>
    </section>
  );
}

/* ───────────────────────── right column ───────────────────────── */

function WeekStrip({ day, setDay, liveDays }: { day: Date; setDay: (d: Date) => void; liveDays: Set<string> }) {
  const week = startOfWeek(day);
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY));
  const shift = (n: number) => setDay(new Date(day.getTime() + n * 7 * DAY));
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[30px] font-medium tracking-[-0.03em]">{day.toLocaleDateString(undefined, { month: "long" })}, {day.getFullYear()}</h2>
        <div className="flex gap-2">
          <button onClick={() => shift(-1)} aria-label="Previous week" className="flex size-10 items-center justify-center rounded-full bg-card shadow-sm hover:bg-muted"><ChevronLeft className="size-4" /></button>
          <button onClick={() => shift(1)} aria-label="Next week" className="flex size-10 items-center justify-center rounded-full bg-card shadow-sm hover:bg-muted"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const on = sameDay(d, day);
          const today = sameDay(d, new Date());
          return (
            <button key={d.toISOString()} onClick={() => setDay(d)} aria-pressed={on}
              className={cn("relative flex flex-col items-center gap-1.5 rounded-[16px] py-2.5 text-sm transition", on ? "bg-foreground text-background" : "hover:bg-card")}>
              <span className={cn("text-[13px]", on ? "text-background/80" : "text-muted-foreground")}>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className={cn("text-lg font-medium tabular-nums", today && !on && "text-[var(--lilac-deep)]")}>{d.getDate()}</span>
              {liveDays.has(d.toDateString()) && <span className={cn("absolute bottom-1 size-1 rounded-full", on ? "bg-background" : "bg-[var(--lilac-deep)]")} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LatestCourses() {
  const q = $api.useQuery("get", "/api/v1/courses", { params: { query: { per_page: 8 } } });
  const items = q.data?.items ?? [];
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-medium tracking-[-0.02em]">Latest courses</h2>
        <Link href="/courses" aria-label="All courses" className="text-foreground/80 hover:text-foreground"><CirclePlus className="size-5" /></Link>
      </div>
      <div className="no-scrollbar -mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {q.isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-52 w-[168px] shrink-0 rounded-[20px]" />)}
        {!q.isLoading && items.length === 0 && <p className="text-sm text-muted-foreground">No courses yet.</p>}
        {items.map((c) => (
          <Link key={c.id} href={`/courses/${c.id}`} className={cn(box, "group w-[168px] shrink-0 snap-start p-2 transition hover:-translate-y-0.5")}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-gradient-to-br from-[var(--lilac-soft)] to-[var(--blush-soft)]">
              {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" className="size-full object-cover transition group-hover:scale-105" /> : <BookOpen className="absolute inset-0 m-auto size-8 text-[var(--lilac-deep)]" />}
              <span className="absolute right-1.5 bottom-1.5 rounded-full bg-[#141318] px-2 py-0.5 text-[11px] font-medium text-white">{c.video_count} videos</span>
            </div>
            <div className="mt-2 line-clamp-3 min-h-[3.4rem] px-1 text-[13px] leading-snug font-medium">{c.title}</div>
            <div className="mt-2 flex items-center gap-2.5 px-1 pb-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays className="size-3" />{new Date(c.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span className="flex items-center gap-1"><UsersRound className="size-3" />{c.student_count}</span>
              <span className="flex items-center gap-1"><PlayCircle className="size-3" />{c.video_count}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

type Row = { id: string; who: string; avatar?: string; text: string; kind: string; at: string; href: string };

function Notifications() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"overview" | "reviews" | "comments">("overview");
  const feed = $api.useQuery("get", "/api/v1/notifications", { params: { query: { limit: 8 } } });
  const reviews = $api.useQuery("get", "/api/v1/submissions", { params: { query: { status: "pending", per_page: 8 } } }, { enabled: tab === "reviews" && can("submissions") });
  const comments = $api.useQuery("get", "/api/v1/comments", { params: { query: { unanswered: true, per_page: 8 } } }, { enabled: tab === "comments" && can("comments") });
  const read = $api.useMutation("post", "/api/v1/notifications/read", { onSuccess: () => invalidatePaths(qc, "/api/v1/notifications") });

  const tabs = [
    { id: "overview" as const, label: "Overview", show: true },
    { id: "reviews" as const, label: "Reviews", show: can("submissions") },
    { id: "comments" as const, label: "Comments", show: can("comments") },
  ].filter((t) => t.show);

  let rows: Row[] = [];
  let loading = false;
  if (tab === "overview") {
    loading = feed.isLoading;
    rows = (feed.data?.items ?? []).map((n) => ({ id: n.id, who: n.title, text: n.body ? `${n.title}: ${n.body}` : n.title, kind: n.kind || "Update", at: n.created_at, href: n.link || "" }));
  } else if (tab === "reviews") {
    loading = reviews.isLoading;
    rows = (reviews.data?.items ?? []).map((s) => ({ id: s.id, who: s.student_name, text: `${s.student_name} sent “${s.task_title}” for review`, kind: s.course_title, at: s.created_at, href: `/submissions/${s.id}` }));
  } else {
    loading = comments.isLoading;
    rows = (comments.data?.items ?? []).map((c) => ({ id: c.id, who: c.author_name, text: `${c.author_name} asked on “${c.video_title}”: ${c.body}`, kind: "Question", at: c.created_at, href: "/comments" }));
  }
  const unread = feed.data?.unread ?? 0;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-medium tracking-[-0.02em]">Notifications</h2>
        <button onClick={() => read.mutate({ body: {} })} disabled={unread === 0} aria-label="Mark all as read" title={unread ? `Mark ${unread} as read` : "All read"}
          className="relative flex size-8 items-center justify-center rounded-full bg-foreground text-background transition disabled:opacity-60">
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-[var(--lilac-deep)] px-1 text-[10px] font-semibold text-white">{unread}</span>}
        </button>
      </div>
      <div className="mt-3 flex gap-5 border-b text-sm" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 pb-2 transition", tab === t.id ? "border-[var(--lilac)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>
      <ul className="mt-3 space-y-2.5">
        {loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[18px]" />)}
        {!loading && rows.length === 0 && <li className={cn(box, "p-5 text-center text-sm text-muted-foreground")}>Nothing new here.</li>}
        {rows.map((r, i) => (
          <li key={r.id} className={cn(box, "rounded-[18px] p-3")}>
            <div className="flex gap-3">
              <Avatar src={r.avatar} name={r.who} className={cn("size-10", softAvatar(i))} />
              <p className="line-clamp-3 flex-1 text-[13px] leading-snug font-medium">{r.text}</p>
              {r.href && (
                <Link href={r.href} className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-foreground px-2.5 text-[11px] font-medium text-background">
                  <Link2 className="size-3" /> Open
                </Link>
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span className="truncate capitalize">{r.kind.replace(/_/g, " ")}</span>
              <span className="shrink-0">{timeAgo(r.at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function DashboardPage() {
  const { can } = useSession();
  const [day, setDay] = React.useState(() => new Date());
  const week = startOfWeek(day);
  const overview = $api.useQuery("get", "/api/v1/analytics/overview", { params: { query: { days: 30 } } }, { enabled: can("analytics") });
  const live = $api.useQuery("get", "/api/v1/live", { params: { query: { from: week.toISOString(), to: new Date(week.getTime() + 7 * DAY).toISOString(), per_page: 100 } } }, { enabled: can("live") });
  const classes = live.data?.items ?? [];
  const liveDays = React.useMemo(() => new Set(classes.filter((l) => l.status === "scheduled").map((l) => new Date(l.starts_at).toDateString())), [classes]);
  const c = overview.data?.counts;
  const daily = overview.data?.daily ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,370px)]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
        <Hero canStudents={can("students")} />

        <div className="grid gap-5 md:grid-cols-[1.35fr_1fr_0.62fr]">
          {can("students") ? <Members /> : <div className={cn(box, "hidden md:block")} />}
          {can("analytics") && (c ? <TaskData daily={daily} pending={c.pending_reviews} /> : <Skeleton className="h-60 rounded-[24px]" />)}
          {can("analytics") && (c ? <Impact daily={daily} /> : <Skeleton className="h-60 rounded-[24px]" />)}
        </div>

        <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]">
          {can("analytics") && (c ? <Statistics daily={daily} published={c.published_courses} batches={c.active_batches} /> : <Skeleton className="h-80 rounded-[24px]" />)}
          <div className="grid content-start gap-5">
            {can("live") && <NextClass day={day} classes={classes} />}
            <Promo />
          </div>
        </div>

        {!can("analytics") && !can("students") && (
          <EmptyState icon={<Eye />} title="Welcome!" description="Use the menu to open the areas your role gives you access to." />
        )}
      </div>

      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7">
        <WeekStrip day={day} setDay={setDay} liveDays={liveDays} />
        {can("courses") && <LatestCourses />}
        <Notifications />
      </aside>
    </div>
  );
}
