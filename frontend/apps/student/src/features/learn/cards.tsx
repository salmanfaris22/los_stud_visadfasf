"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarPlus, CheckCircle2, ChevronDown, Download, Film, Video } from "lucide-react";
import { errorMessage, type Schemas } from "@lms/api-client";
import { Badge, Button, LineBadge, LineTrack, Stop, StatusBadge, cn, formatTime, lineColor, timeAgo, toast } from "@lms/ui";
import { $api } from "@/lib/api";
import { download } from "@/lib/download";
import { TaskPanel } from "./task-panel";

/** One row on the home page: the course drawn as a line, filled to progress. */
export function CourseLine({ c }: { c: Schemas["MyCourse"] }) {
  const color = lineColor(c.course_id);
  const left = Math.max(0, c.total_tasks - c.approved_tasks);
  return (
    <Link href={`/learn/courses/${c.course_id}`} className="group block rounded-[18px] px-4 py-4 transition hover:bg-muted/60 sm:px-5">
      <div className="flex items-center gap-3">
        <LineBadge id={c.course_id} name={c.title} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{c.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.progress_pct >= 100 ? "Arrived: certificate stop reached" : left > 0 ? `${left} stop${left === 1 ? "" : "s"} to the certificate` : "No tasks yet"}
            {c.batch_name && ` · ${c.batch_name}`}
          </div>
        </div>
        <span className="font-display text-xl font-extrabold tabular-nums">{c.progress_pct}<span className="text-sm text-muted-foreground">%</span></span>
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <LineTrack className="mt-3" color={color} stops={Math.min(Math.max(c.total_tasks, 1), 16)} progress={c.progress_pct} />
    </Link>
  );
}

/** A task in a list. Clicking it opens the task (details, submit form, chat) right here as a dropdown. */
export function TaskRow({ t, defaultOpen = false }: { t: Schemas["MyTask"]; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("overflow-hidden rounded-[18px] border bg-card transition", open ? "border-foreground/25 shadow-md dark:shadow-none" : "hover:border-foreground/25")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3.5 p-3.5 text-left">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${lineColor(t.course_id)} 14%, transparent)` }}>
          {t.status === "approved" ? <CheckCircle2 className="size-5" style={{ color: lineColor(t.course_id) }} /> : <Stop state={t.status === "todo" || t.status === "resubmit" ? "current" : "done"} color={lineColor(t.course_id)} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{t.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{t.course_title} · {t.video_title}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusBadge status={t.status} />
          {t.due_at && <span className={cn("text-[11px]", t.is_overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{t.is_overdue ? "Overdue" : `Due ${timeAgo(t.due_at)}`}</span>}
          {t.marks != null && <span className="text-[11px] text-muted-foreground">{t.marks}/{t.max_marks}</span>}
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="border-t bg-background/50 p-4 sm:p-5">
          <TaskPanel taskId={t.id} inline />
        </motion.div>
      )}
    </div>
  );
}

/** Live session card with join window, calendar buttons and recording link. */
export function LiveCard({ s, past }: { s: Schemas["LiveSession"]; past?: boolean }) {
  const join = $api.useMutation("post", "/api/v1/me/live/{id}/join", {
    onSuccess: (r) => window.open(r.meet_url, "_blank", "noopener"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  const now = Date.now();
  const canJoin = !past && now >= start - 30 * 60_000 && now <= end + 30 * 60_000;
  const live = now >= start && now <= end;
  const d = new Date(s.starts_at);
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
      {/* departures board: time first */}
      <div className={cn("flex w-full shrink-0 items-center gap-3 rounded-2xl px-4 py-3 sm:w-28 sm:flex-col sm:items-start sm:gap-0", live ? "bg-destructive text-white" : "bg-rail text-rail-foreground")}>
        <span className="font-display text-2xl leading-none font-extrabold tabular-nums">{formatTime(s.starts_at)}</span>
        <span className={cn("text-xs font-semibold sm:mt-1.5", live ? "text-white/85" : "text-rail-muted")}>
          {live ? <span className="inline-flex items-center gap-1.5"><span className="size-1.5 animate-ping rounded-full bg-white" />Live now</span> : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{s.title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">Until {formatTime(s.ends_at)} · {s.host_name}</div>
        {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
        {past && s.attended && <Badge variant="success" className="mt-2">Attended</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!past && <Button disabled={!canJoin} loading={join.isPending} onClick={() => join.mutate({ params: { path: { id: s.id } } })}><Video /> {canJoin ? "Join now" : "Join"}</Button>}
        {!past && <Button variant="outline" size="icon" onClick={() => download(`/api/v1/me/live/${s.id}/ics`, "class.ics")} aria-label="Download calendar file"><Download /></Button>}
        {!past && <Button variant="outline" size="icon" asChild><a href={s.google_calendar_url} target="_blank" rel="noreferrer" aria-label="Add to Google Calendar"><CalendarPlus /></a></Button>}
        {past && s.recording_url && <Button variant="outline" asChild><a href={s.recording_url} target="_blank" rel="noreferrer"><Film /> Recording</a></Button>}
      </div>
    </div>
  );
}
