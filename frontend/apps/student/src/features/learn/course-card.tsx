"use client";
import * as React from "react";
import Link from "next/link";
import { ClipboardCheck, MonitorPlay, Play } from "lucide-react";
import type { MyCourse } from "@lms/api-client";
import { cn, lineColor } from "@lms/ui";

/** Udemy-style violet accent, used for progress and the main buttons on the course pages. */
export const accent = {
  bar: "bg-violet-700 dark:bg-violet-400",
  text: "text-violet-700 dark:text-violet-300",
  button: "bg-violet-700 text-white shadow-none hover:bg-violet-800 dark:bg-violet-500 dark:hover:bg-violet-400",
};

/** Thin progress bar like Udemy's "x% complete". */
export function ThinProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn("h-1 w-full overflow-hidden bg-track", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full transition-all duration-700", accent.bar)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** Course thumbnail; when the course has no image, a clean generated cover in the course colour. */
export function CourseCover({
  id,
  title,
  label,
  src,
  className,
}: {
  id: string;
  title: string;
  label?: string;
  src?: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("size-full object-cover", className)} />;
  }
  const color = lineColor(id);
  return (
    <div
      className={cn("relative flex size-full flex-col justify-between overflow-hidden p-4 text-white", className)}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, #0b0d14))` }}
    >
      <span aria-hidden className="absolute -top-10 -right-10 size-40 rounded-full border-[18px] border-white/10" />
      <span aria-hidden className="absolute -right-4 -bottom-16 size-32 rounded-full bg-white/10" />
      <span className="relative text-[10px] font-bold tracking-[0.14em] uppercase opacity-80">{label || "Course"}</span>
      <span className="relative line-clamp-2 font-display text-lg leading-tight font-extrabold drop-shadow-sm">
        {title}
      </span>
    </div>
  );
}

/** One course in the grid: framed card, cover with status chip, details, then progress ring and next action. */
export function CourseCard({ c }: { c: MyCourse }) {
  const st = courseStatus(c.progressPct);
  const sub = [c.batchName, c.level && cap(c.level)].filter(Boolean).join(" · ") || c.subtitle;
  // Cover: the course thumbnail, or the first lesson's video thumbnail.
  const cover = c.coverUrl || c.thumbnailUrl;
  const preview = useHoverPreview(!!c.previewUrl);
  return (
    <div
      className="group relative isolate h-full transition duration-300 hover:-translate-y-1"
      onMouseEnter={preview.start}
      onMouseLeave={preview.stop}
    >
      {/* YouTube-style ambient glow: a blurred copy of the cover fades in behind the card on hover. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 bottom-4 -z-10 overflow-hidden rounded-2xl opacity-0 blur-[36px] saturate-150 transition duration-500 group-hover:opacity-100"
      >
        <CourseCover id={c.courseId} title="" src={cover} className="scale-125" />
      </div>
      <Link
        href={`/learn/courses/${c.courseId}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition duration-300 group-hover:border-foreground/15 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:shadow-none"
      >
        <div className="relative aspect-video overflow-hidden bg-muted">
          {/* Extra bottom space on generated covers so the progress pill doesn't sit on the cover title. */}
          <CourseCover
            id={c.courseId}
            title={c.title}
            label={c.category}
            src={cover}
            className={cn("transition duration-500 group-hover:scale-[1.05]", !cover && "pb-10")}
          />
          {/* YouTube-style hover preview: the first lesson plays muted over the cover. */}
          {preview.on && (
            <iframe
              src={c.previewUrl}
              title=""
              aria-hidden
              tabIndex={-1}
              allow="autoplay; encrypted-media; picture-in-picture"
              className="pointer-events-none absolute inset-0 size-full border-0 bg-black"
            />
          )}
          <span
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-black/50 via-black/10 to-transparent opacity-0 transition duration-300 group-hover:opacity-100"
          />
          <span
            className={cn("absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm", st.chip)}
          >
            {st.label}
          </span>
          <span className={cn("absolute inset-0 flex items-center justify-center", preview.on && "hidden")}>
            <span className="flex size-12 scale-90 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition duration-300 group-hover:scale-100 group-hover:opacity-100">
              <Play className="size-5 translate-x-0.5 fill-current" />
            </span>
          </span>
        </div>

        <div className="relative flex flex-1 flex-col p-4 pt-9">
          {/* Progress ring sits on the edge between the cover and the body. */}
          <span className="absolute -top-7 right-4 rounded-full border bg-card p-1 shadow-md">
            <ProgressRing value={c.progressPct} size={50} stroke={5} />
          </span>
          {c.category && (
            <span className={cn("text-[11px] font-bold tracking-[0.12em] uppercase", accent.text)}>{c.category}</span>
          )}
          <h3 className="mt-1 line-clamp-2 text-[17px] leading-snug font-bold">{c.title}</h3>
          {sub && <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>}
          <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <MonitorPlay className="size-3.5" />
              {c.videoCount} lecture{c.videoCount === 1 ? "" : "s"}
            </li>
            <li className="flex items-center gap-1.5">
              <ClipboardCheck className="size-3.5" />
              {c.approvedTasks}/{c.totalTasks} tasks
            </li>
          </ul>
        </div>
      </Link>
    </div>
  );
}

/** Starts the hover preview after a short pause (like YouTube), only on devices with a mouse. */
function useHoverPreview(enabled: boolean) {
  const [on, setOn] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = React.useCallback(() => {
    clearTimeout(timer.current);
    setOn(false);
  }, []);
  const start = React.useCallback(() => {
    if (!enabled || !window.matchMedia("(hover: hover)").matches) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(true), 600);
  }, [enabled]);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return { on, start, stop };
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Status of a course from its progress. */
function courseStatus(pct: number) {
  // cls: soft chip on the card body · chip: solid chip that reads on top of a cover image.
  if (pct >= 100)
    return {
      label: "Completed",
      cta: "Review course",
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
      chip: "bg-emerald-500 text-white",
    };
  if (pct > 0)
    return {
      label: "In progress",
      cta: "Continue",
      cls: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
      chip: "bg-violet-600 text-white",
    };
  return {
    label: "Not started",
    cta: "Start course",
    cls: "bg-muted text-muted-foreground",
    chip: "bg-white/95 text-zinc-900",
  };
}

/** Round progress: a ring that fills to the percentage, with the number in the middle. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const v = Math.round(Math.min(100, Math.max(0, value)));
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${v}% complete`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-track" />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - v / 100)}
            className={cn(
              "transition-[stroke-dashoffset] duration-700",
              v >= 100 ? "stroke-emerald-500" : "stroke-violet-700 dark:stroke-violet-400",
            )}
          />
        )}
      </svg>
      <span className="text-sm leading-none font-bold tabular-nums">
        {v}
        <span className="text-[10px]">%</span>
      </span>
    </div>
  );
}
