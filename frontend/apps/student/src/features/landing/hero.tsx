"use client";
import * as React from "react";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight, Bell, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Flame } from "lucide-react";
import { cn } from "@lms/ui";

type Block = Record<string, unknown>;
const str = (b: Block | undefined, k: string, d = "") => (typeof b?.[k] === "string" && b[k] ? (b[k] as string) : d);
const EASE = [0.21, 0.6, 0.35, 1] as const;
const rise = (delay: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.7, ease: EASE } });

/** Grid cells (column from the page centre, row) that are filled with lilac, like sticky squares on graph paper. */
const CELLS: [number, number][] = [[-12, 2], [-9, 5], [-5, 1], [-14, 10], [-10, 12], [7, 3], [11, 6], [13, 1], [9, 12], [14, 9], [-3, 16], [5, 17]];

/**
 * The landing hero: an announcement pill, the CMS headline and subtitle, two actions, then the app on a
 * phone between two tilted cards. The whole hero plays one entrance sequence on load.
 * `today` (YYYY-MM-DD from the server) drives the phone's week strip until the browser's own date is known.
 */
export function Hero({ data, today, course }: { data?: Block; today: string; course?: string }) {
  const ctaLink = str(data, "cta_link", "/courses");
  const secondary = str(data, "secondary_text");
  const badge = str(data, "badge");
  return (
    <MotionConfig reducedMotion="user">
      <section className="relative isolate overflow-hidden pt-32 sm:pt-40">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="site-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_55%,transparent_92%)]">
            {CELLS.map(([col, row]) => (
              <span key={`${col}:${row}`} className="absolute size-[47px] bg-[var(--site-cell)]" style={{ left: `calc(50% + ${col * 48 + 1}px)`, top: `${row * 48 + 1}px` }} />
            ))}
          </div>
          <div className="site-glow absolute inset-x-[-10%] top-[8%] h-[900px]" />
        </div>

        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
          {badge && (
            <motion.div {...rise(0)} className="mb-7 flex justify-center">
              <Link href={str(data, "badge_link", ctaLink)}
                className="group inline-flex max-w-full items-center gap-3 rounded-full bg-[var(--site-butter)] py-1.5 pr-1.5 pl-4 text-[14px] font-medium text-[var(--site-butter-ink)] shadow-[0_0_0_1px_rgb(220_180_40/0.18)] sm:text-[15px]">
                <span className="truncate">{badge}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--site-butter-strong)] px-3 py-1 text-[13px] font-semibold text-[#3b3216] sm:text-sm">
                  {str(data, "badge_cta", "Check it out")}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          )}
          <motion.h1 {...rise(0.08)} className="font-display mx-auto max-w-[15ch] text-[44px] leading-[1.02] font-extrabold tracking-[-0.045em] min-[400px]:text-[50px] sm:text-[72px] lg:text-[92px]">
            {str(data, "title", "Learn skills that get you hired")}
          </motion.h1>
          <motion.p {...rise(0.16)} className="mx-auto mt-6 max-w-[40rem] text-[17px] leading-8 text-muted-foreground sm:text-xl sm:leading-[1.65]">
            {str(data, "subtitle", "Video lessons, hands-on tasks reviewed by mentors, live classes and certificates.")}
          </motion.p>
          <motion.div {...rise(0.24)} className="mx-auto mt-10 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            {secondary && <Link href={str(data, "secondary_link", "/contact")} className="site-btn site-btn-lg site-btn-light order-last sm:order-none">{secondary}</Link>}
            <Link href={ctaLink} className="site-btn site-btn-lg site-btn-violet">{str(data, "cta_text", "Explore courses")}<ChevronRight /></Link>
          </motion.div>
        </div>

        <HeroStage today={today} course={course} />
      </section>
    </MotionConfig>
  );
}

/* ───────────────────────── Phone + side cards ───────────────────────── */

function HeroStage({ today, course }: { today: string; course?: string }) {
  return (
    // A picture of the app: decorative, so screen readers skip the sample content.
    <div aria-hidden className="relative mx-auto mt-14 h-[430px] max-w-6xl sm:mt-20 sm:h-[560px]">
      <motion.div initial={{ opacity: 0, x: 150, rotate: 0 }} animate={{ opacity: 1, x: 0, rotate: -7 }} transition={{ delay: 0.75, duration: 0.9, ease: EASE }}
        className="absolute top-[104px] hidden w-[410px] lg:block" style={{ left: "calc(50% - min(530px, 50vw - 24px))" }}>
        <LessonCard />
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -150, rotate: 0 }} animate={{ opacity: 1, x: 0, rotate: 7 }} transition={{ delay: 0.85, duration: 0.9, ease: EASE }}
        className="absolute top-[84px] hidden w-[410px] lg:block" style={{ left: "calc(50% + min(120px, 50vw - 434px))" }}>
        <GrowthCard />
      </motion.div>
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <motion.div initial={{ opacity: 0, y: 110 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 1, ease: EASE }} className="w-[318px] min-[400px]:w-[340px]">
          <Phone today={today} course={course} />
        </motion.div>
      </div>
      {/* the stage is cut off at the bottom, like the fold in the reference */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

function LessonCard() {
  // A lesson's audio, drawn as a waveform: tall in the middle, quiet at the edges.
  const bars = Array.from({ length: 26 }, (_, i) => {
    const wave = Math.abs(Math.sin(i * 0.9) * 0.6 + Math.sin(i * 0.37) * 0.4);
    const envelope = Math.sin((Math.PI * (i + 1)) / 27);
    return 0.18 + wave * envelope * 0.82;
  });
  return (
    <div className="site-float rounded-[28px] border bg-card p-7 pr-24 pb-8 lg:pr-28">
      <p className="text-left text-[23px] leading-[1.25] font-semibold tracking-[-0.02em]">Watch a short lesson, then build it yourself!</p>
      <div className="relative mt-7 flex h-20 items-center gap-[5px] overflow-hidden pl-24">
        {bars.map((h, i) => (
          <span key={i} className={cn("w-[5px] rounded-full", i < 7 ? "bg-[var(--site-rose)]/70" : "bg-muted-foreground/25")} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
        <span className="absolute top-1/2 left-6 flex size-16 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--site-rose)] shadow-[0_10px_24px_-8px_rgb(232_103_156/0.8)] ring-8 ring-[color-mix(in_oklab,var(--site-rose)_18%,transparent)]">
          <svg viewBox="0 0 24 24" className="ml-1 size-6 fill-white" aria-hidden><path d="M7 4.8v14.4c0 .9.97 1.45 1.74.98l11.5-7.2a1.15 1.15 0 0 0 0-1.96L8.74 3.82C7.97 3.35 7 3.9 7 4.8Z" /></svg>
        </span>
      </div>
    </div>
  );
}

function GrowthCard() {
  const rows = [52, 74, 38, 88];
  return (
    <div className="site-float rounded-[28px] border bg-card p-7 pl-20 lg:pl-24">
      <div className="flex items-center justify-between">
        <span className="text-[23px] font-semibold tracking-[-0.02em]">This month</span>
        <ArrowRight className="size-6" />
      </div>
      <div className="mt-6 flex items-end gap-5">
        <div className="site-float -ml-8 w-[150px] shrink-0 rounded-[18px] border bg-card p-3.5 text-left">
          <div className="flex items-center gap-2 text-[19px] font-bold"><span className="size-2.5 rounded-full bg-[var(--site-butter-strong)]" />+21%</div>
          <div className="mt-1 text-[13px] leading-snug text-muted-foreground">more tasks approved by mentors</div>
        </div>
        <div className="grid flex-1 gap-2.5 pb-1">
          {rows.map((w, i) => (
            <span key={i} className={cn("h-3 rounded-full", i === 3 ? "bg-[var(--site-violet)]" : "bg-muted")} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── The app on a phone ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function weekOf(iso: string) {
  const t = new Date(`${iso}T12:00:00`);
  const dow = (t.getDay() + 6) % 7; // Monday = 0
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t);
    d.setDate(t.getDate() - dow + i);
    return { key: localISO(d), label: "MTWTFSS"[i]!, date: d.getDate(), today: i === dow, weekend: i >= 5 };
  });
  return { days, month: `${t.toLocaleDateString("en-US", { month: "long" })}, ${t.getFullYear()}` };
}

function Phone({ today, course }: { today: string; course?: string }) {
  // Start from the server's date (no hydration mismatch), then switch to the visitor's own date.
  const [iso, setIso] = React.useState(today);
  React.useEffect(() => setIso(localISO(new Date())), []);
  const { days, month } = weekOf(iso);

  return (
    <div className="site-float rounded-[56px] bg-[#16141c] p-[10px] ring-1 ring-black/60">
      <div className="relative overflow-hidden rounded-[46px] bg-white pb-8 text-left text-[#19171f] [font-stretch:100%]">
        <div aria-hidden className="absolute top-[11px] left-1/2 h-[30px] w-[98px] -translate-x-1/2 rounded-full bg-black" />
        <div className="flex h-[50px] items-center justify-between px-7 pt-1 text-[14px] font-semibold">
          <span>11:20</span>
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg viewBox="0 0 18 12" className="h-3 w-[18px] fill-current"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
            <svg viewBox="0 0 16 12" className="h-3 w-4 fill-current"><path d="M8 2.5a9 9 0 0 1 6.3 2.6l1.2-1.3A10.8 10.8 0 0 0 8 .7 10.8 10.8 0 0 0 .5 3.8l1.2 1.3A9 9 0 0 1 8 2.5Zm0 3.6a5.4 5.4 0 0 1 3.8 1.6l1.2-1.3A7.2 7.2 0 0 0 8 4.3a7.2 7.2 0 0 0-5 2.1l1.2 1.3A5.4 5.4 0 0 1 8 6.1Zm0 3.6a1.8 1.8 0 0 0-1.3.5L8 11.7l1.3-1.5a1.8 1.8 0 0 0-1.3-.5Z" /></svg>
            <svg viewBox="0 0 27 12" className="h-3 w-[26px]"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="19" height="8" rx="2.2" fill="currentColor" /><rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".4" /></svg>
          </span>
        </div>

        <div className="px-4">
          <div className="flex items-center gap-2.5 pt-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd2b8] to-[#f59cc4] text-[14px] font-bold text-white ring-2 ring-white">PN</span>
            <div className="min-w-0 leading-tight">
              <div className="text-[12px] text-[#77748a]">Hello,</div>
              <div className="truncate text-[15px] font-semibold">Priya Nair</div>
            </div>
            <span className="ml-auto flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#efedf5] px-2.5 text-[14px] font-bold"><Flame className="size-4 fill-[#ff9f43] text-[#ff7a1a]" />12</span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#efedf5]"><Bell className="size-4" /></span>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#f0eef6] p-3">
            <div className="flex items-center justify-between px-1 text-[14px] font-semibold">
              <ChevronLeft className="size-4 text-[#77748a]" /><span suppressHydrationWarning>{month}</span><ChevronRight className="size-4 text-[#77748a]" />
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {days.map((d) => (
                <div key={d.key} className="grid justify-items-center gap-1.5">
                  <span className={cn("text-[11px] font-medium", d.weekend ? "text-[#b8b5c6]" : "text-[#4a4757]")}>{d.label}</span>
                  <span className={cn("flex size-[30px] items-center justify-center rounded-full text-[12px] font-semibold",
                    d.today ? "bg-[#ffd9c2] text-[#19171f]" : d.weekend ? "bg-[#f7f6fa] text-[#b8b5c6]" : "bg-[#f4f3f8] text-[#2c2a36]")}>{d.date}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-[22px] bg-[#ece6ff] p-4">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1 pt-1">
                <div className="text-[16px] leading-tight font-bold">Today&apos;s lesson</div>
                <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#5b4fa0]">{course || "Go Backend Mastery"}</div>
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#6b6880]"><BookOpen className="size-3.5" />Lesson 3 of 12</div>
              </div>
              <Mascot className="-mt-3 -mr-2 w-[92px] shrink-0" />
            </div>
            <span className="mt-2 flex h-10 items-center justify-center gap-1.5 rounded-full bg-white text-[14px] font-semibold shadow-sm">Continue <ArrowRight className="size-4" /></span>
          </div>

          <div className="mt-4 flex items-center justify-between px-1 text-[14px] font-semibold"><span>Your tasks</span><span className="text-[12px] font-medium text-[#77748a]">See all</span></div>
          <div className="mt-2 grid gap-2">
            <TaskRow title="Build a REST API" meta="Due Friday" state="review" />
            <TaskRow title="Share your repo" meta="Marked 9/10" state="done" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ title, meta, state }: { title: string; meta: string; state: "review" | "done" }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[#f0eef6] px-3 py-2.5">
      <span className={cn("flex size-8 items-center justify-center rounded-full", state === "done" ? "bg-[#e3f7ec] text-[#13955a]" : "bg-[#fff4cf] text-[#a07400]")}>
        {state === "done" ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-semibold">{title}</div>
        <div className="text-[11px] text-[#77748a]">{meta}</div>
      </div>
      <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold", state === "done" ? "bg-[#e3f7ec] text-[#13955a]" : "bg-[#fff4cf] text-[#8a6400]")}>{state === "done" ? "Approved" : "In review"}</span>
    </div>
  );
}

/** A small study robot waving a pencil. */
function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <ellipse cx="60" cy="112" rx="30" ry="4" fill="#5b4fa0" opacity=".12" />
      <path d="M60 14v10" stroke="#8b6bff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="11" r="6" fill="#ff8fb8" />
      <rect x="40" y="76" width="40" height="30" rx="13" fill="#ffffff" stroke="#d9d0ff" strokeWidth="2" />
      <circle cx="60" cy="90" r="5" fill="#8b6bff" opacity=".85" />
      <path d="M41 84c-10-2-17-10-19-20" stroke="#d9d0ff" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M41 84c-10-2-17-10-19-20" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="21" cy="61" r="6.5" fill="#ffffff" stroke="#d9d0ff" strokeWidth="2" />
      <path d="M79 86c9 1 15-3 19-10" stroke="#d9d0ff" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M79 86c9 1 15-3 19-10" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" fill="none" />
      <g transform="rotate(28 104 60)">
        <rect x="100" y="38" width="8" height="34" rx="2" fill="#ffc94a" />
        <path d="M100 72h8l-4 8z" fill="#f2d7b5" />
        <path d="M103 77h2l-1 3z" fill="#19171f" />
        <rect x="100" y="36" width="8" height="5" rx="1.5" fill="#ff8fb8" />
      </g>
      <circle cx="99" cy="74" r="6.5" fill="#ffffff" stroke="#d9d0ff" strokeWidth="2" />
      <rect x="24" y="24" width="72" height="54" rx="24" fill="#ffffff" stroke="#d9d0ff" strokeWidth="2" />
      <rect x="33" y="35" width="54" height="32" rx="16" fill="#2a2350" />
      <ellipse cx="48" cy="51" rx="6" ry="7" fill="#9ef0ff" />
      <ellipse cx="72" cy="51" rx="6" ry="7" fill="#9ef0ff" />
      <circle cx="50" cy="48" r="2" fill="#ffffff" />
      <circle cx="74" cy="48" r="2" fill="#ffffff" />
      <path d="M55 60q5 4 10 0" stroke="#9ef0ff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="58" r="4" fill="#ffb3cf" opacity=".7" />
      <circle cx="91" cy="58" r="4" fill="#ffb3cf" opacity=".7" />
    </svg>
  );
}
