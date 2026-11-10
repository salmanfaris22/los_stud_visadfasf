"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarPlus, CheckCircle2, ChevronDown, Download, Film, Video } from "lucide-react";
import { errorMessage, type LiveSession, type MyCourse, type MyTask, LiveService, useRpcMutation } from "@lms/api-client";
import { Badge, Button, LineBadge, LineTrack, Stop, StatusBadge, cn, formatTime, lineColor, timeAgo, toast, asDate } from "@lms/ui";

import { rpc } from "@/lib/api";
import { download } from "@/lib/download";
import { TaskPanel } from "./task-panel";

/** One row on the home page: the course drawn as a line, filled to progress. */
export function CourseLine({ c }: { c: MyCourse }) {
  const color = lineColor(c.courseId);
  const left = Math.max(0, c.totalTasks - c.approvedTasks);
  return (
    <Link href={`/learn/courses/${c.courseId}`} className="group block rounded-[18px] px-4 py-4 transition hover:bg-muted/60 sm:px-5">
      <div className="flex items-center gap-3">
        <LineBadge id={c.courseId} name={c.title} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{c.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.progressPct >= 100 ? "Arrived: certificate stop reached" : left > 0 ? `${left} stop${left === 1 ? "" : "s"} to the certificate` : "No tasks yet"}
            {c.batchName && ` · ${c.batchName}`}
          </div>
        </div>
        <span className="font-display text-xl font-extrabold tabular-nums">{c.progressPct}<span className="text-sm text-muted-foreground">%</span></span>
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <LineTrack className="mt-3" color={color} stops={Math.min(Math.max(c.totalTasks, 1), 16)} progress={c.progressPct} />
    </Link>
  );
}

/** A task in a list. Clicking it opens the task (details and upload form) right here as a dropdown. */
export function TaskRow({ t, defaultOpen = false }: { t: MyTask; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("overflow-hidden rounded-[18px] border bg-card transition", open ? "border-foreground/25 shadow-md dark:shadow-none" : "hover:border-foreground/25")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3.5 p-3.5 text-left">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${lineColor(t.courseId)} 14%, transparent)` }}>
          {t.status === "approved" ? <CheckCircle2 className="size-5" style={{ color: lineColor(t.courseId) }} /> : <Stop state={t.status === "todo" || t.status === "resubmit" ? "current" : "done"} color={lineColor(t.courseId)} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{t.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{t.courseTitle} · {t.videoTitle}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusBadge status={t.status} />
          {t.dueAt && <span className={cn("text-[11px]", t.isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>{t.isOverdue ? "Overdue" : `Due ${timeAgo(t.dueAt)}`}</span>}
          {t.marks != null && <span className="text-[11px] text-muted-foreground">{t.marks}/{t.maxMarks}</span>}
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
export function LiveCard({ s, past }: { s: LiveSession; past?: boolean }) {
  const join = useRpcMutation(LiveService.method.joinLive, {
    onSuccess: (r) => window.open(r.result?.meetUrl, "_blank", "noopener"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const start = asDate(s.startsAt).getTime();
  const end = asDate(s.endsAt).getTime();
  const now = Date.now();
  const canJoin = !past && now >= start - 30 * 60_000 && now <= end + 30 * 60_000;
  const live = now >= start && now <= end;
  const d = asDate(s.startsAt);
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
      {/* departures board: time first */}
      <div className={cn("flex w-full shrink-0 items-center gap-3 rounded-2xl px-4 py-3 sm:w-28 sm:flex-col sm:items-start sm:gap-0", live ? "bg-destructive text-white" : "bg-rail text-rail-foreground")}>
        <span className="font-display text-2xl leading-none font-extrabold tabular-nums">{formatTime(s.startsAt)}</span>
        <span className={cn("text-xs font-semibold sm:mt-1.5", live ? "text-white/85" : "text-rail-muted")}>
          {live ? <span className="inline-flex items-center gap-1.5"><span className="size-1.5 animate-ping rounded-full bg-white" />Live now</span> : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{s.title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">Until {formatTime(s.endsAt)} · {s.hostName}</div>
        {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
        {past && s.attended && <Badge variant="success" className="mt-2">Attended</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!past && <Button disabled={!canJoin} loading={join.isPending} onClick={() => join.mutate({ id: s.id })}><Video /> {canJoin ? "Join now" : "Join"}</Button>}
        {!past && <Button variant="outline" size="icon" onClick={() => download(() => rpc(LiveService).getMyLiveIcs({ id: s.id }), "class.ics")} aria-label="Download calendar file"><Download /></Button>}
        {!past && <Button variant="outline" size="icon" asChild><a href={s.googleCalendarUrl} target="_blank" rel="noreferrer" aria-label="Add to Google Calendar"><CalendarPlus /></a></Button>}
        {past && s.recordingUrl && <Button variant="outline" asChild><a href={s.recordingUrl} target="_blank" rel="noreferrer"><Film /> Recording</a></Button>}
      </div>
    </div>
  );
}
