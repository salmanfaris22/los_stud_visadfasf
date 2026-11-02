"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarPlus, CheckCircle2, ChevronDown, ClipboardList, Download, Film, PlayCircle, Video } from "lucide-react";
import { errorMessage, type Schemas } from "@lms/api-client";
import { Badge, Button, Card, StatusBadge, cn, formatDateTime, formatTime, timeAgo, toast } from "@lms/ui";
import { $api } from "@/lib/api";
import { download } from "@/lib/download";
import { TaskPanel } from "./task-panel";

/** YouTube-style course thumbnail with a progress bar along the bottom. */
export function CourseTile({ c }: { c: Schemas["MyCourse"] }) {
  return (
    <Link href={`/learn/courses/${c.course_id}`} className="group block">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-primary/50 via-fuchsia-600/40 to-amber-400/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="size-full object-cover transition duration-300 group-hover:scale-105" />}
        <span className="absolute right-2 bottom-3 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">{c.video_count} videos</span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><span className="block h-full bg-primary" style={{ width: `${c.progress_pct}%` }} /></span>
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"><PlayCircle className="size-12 text-white" /></span>
      </div>
      <div className="mt-3">
        <h3 className="line-clamp-2 font-semibold leading-snug">{c.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{c.batch_name || c.category || "Course"} · {c.approved_tasks}/{c.total_tasks} tasks · {c.progress_pct}%</p>
      </div>
    </Link>
  );
}

/** A task in a list. Clicking it opens the task (details, submit form, chat) right here as a dropdown. */
export function TaskRow({ t, defaultOpen = false }: { t: Schemas["MyTask"]; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("overflow-hidden rounded-xl border transition", open ? "border-primary/40 bg-card shadow-sm" : "hover:border-primary/50 hover:bg-muted/30")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className={cn("rounded-lg p-2", t.status === "approved" ? "bg-success/12 text-success" : "bg-primary/10 text-primary")}>
          {t.status === "approved" ? <CheckCircle2 className="size-5" /> : <ClipboardList className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{t.title}</span>
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
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="border-t bg-background/40 p-4">
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
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className={cn("flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl", live ? "bg-destructive text-white" : "bg-primary/10 text-primary")}>
        {live ? <><span className="size-2 animate-ping rounded-full bg-white" /><span className="mt-1 text-xs font-bold">LIVE</span></> : (
          <><span className="text-[10px] font-semibold uppercase">{new Date(s.starts_at).toLocaleDateString(undefined, { month: "short" })}</span><span className="text-2xl leading-none font-bold">{new Date(s.starts_at).getDate()}</span></>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{s.title}</div>
        <div className="text-sm text-muted-foreground">{formatDateTime(s.starts_at)} – {formatTime(s.ends_at)} · {s.host_name}</div>
        {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
        {past && s.attended && <Badge variant="success" className="mt-2">Attended</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!past && <Button disabled={!canJoin} loading={join.isPending} onClick={() => join.mutate({ params: { path: { id: s.id } } })}><Video /> {canJoin ? "Join now" : "Join"}</Button>}
        {!past && <Button variant="outline" size="icon" onClick={() => download(`/api/v1/me/live/${s.id}/ics`, "class.ics")} aria-label="Download calendar file"><Download /></Button>}
        {!past && <Button variant="outline" size="icon" asChild><a href={s.google_calendar_url} target="_blank" rel="noreferrer" aria-label="Add to Google Calendar"><CalendarPlus /></a></Button>}
        {past && s.recording_url && <Button variant="outline" asChild><a href={s.recording_url} target="_blank" rel="noreferrer"><Film /> Recording</a></Button>}
      </div>
    </Card>
  );
}
