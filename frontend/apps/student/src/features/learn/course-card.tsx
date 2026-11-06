"use client";
import Link from "next/link";
import { Play } from "lucide-react";
import type { Schemas } from "@lms/api-client";
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
    <div className={cn("h-1 w-full overflow-hidden bg-track", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full transition-all duration-700", accent.bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/** Course thumbnail; when the course has no image, a clean generated cover in the course colour. */
export function CourseCover({ id, title, label, src, className }: { id: string; title: string; label?: string; src?: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("size-full object-cover", className)} />;
  }
  const color = lineColor(id);
  return (
    <div className={cn("relative flex size-full flex-col justify-between overflow-hidden p-4 text-white", className)}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, #0b0d14))` }}>
      <span aria-hidden className="absolute -top-10 -right-10 size-40 rounded-full border-[18px] border-white/10" />
      <span aria-hidden className="absolute -right-4 -bottom-16 size-32 rounded-full bg-white/10" />
      <span className="relative text-[10px] font-bold tracking-[0.14em] uppercase opacity-80">{label || "Course"}</span>
      <span className="relative line-clamp-2 font-display text-lg leading-tight font-extrabold drop-shadow-sm">{title}</span>
    </div>
  );
}

/** One course in the "My learning" grid: thumbnail, title, batch, thin progress bar. */
export function CourseCard({ c }: { c: Schemas["MyCourse"] }) {
  const started = c.progress_pct > 0;
  return (
    <Link href={`/learn/courses/${c.course_id}`} className="group block focus-visible:outline-none">
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted group-focus-visible:ring-2 group-focus-visible:ring-violet-500">
        <CourseCover id={c.course_id} title={c.title} label={c.category} src={c.thumbnail_url} className="transition duration-300 group-hover:scale-[1.03]" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
          <span className="flex size-12 scale-90 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
            <Play className="size-5 translate-x-0.5 fill-current" />
          </span>
        </span>
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[15px] leading-snug font-bold group-hover:underline">{c.title}</h3>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{[c.batch_name, c.level].filter(Boolean).join(" · ") || c.subtitle}</p>
      <ThinProgress value={c.progress_pct} className="mt-3" />
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {started ? (
          <span className="text-muted-foreground tabular-nums">{c.progress_pct}% complete</span>
        ) : (
          <span className="font-bold tracking-wide uppercase">Start course</span>
        )}
        <span className="text-muted-foreground tabular-nums">{c.video_count} lecture{c.video_count === 1 ? "" : "s"}</span>
      </div>
    </Link>
  );
}
