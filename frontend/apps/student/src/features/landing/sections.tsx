"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Award, CheckCircle2, ChevronRight, Clock, PlayCircle, Plus, Users } from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { cn, formatHours } from "@lms/ui";
import { FeatureVignette } from "./vignettes";

type Block = Record<string, unknown>;
const str = (b: Block | undefined, k: string, d = "") => (typeof b?.[k] === "string" && b[k] ? (b[k] as string) : d);
const list = <T,>(b: Block | undefined, k: string) => (Array.isArray(b?.[k]) ? (b![k] as T[]) : []);

function SectionHeading({ title, subtitle, center, action }: { title: string; subtitle?: React.ReactNode; center?: boolean; action?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between", center && "items-center text-center sm:flex-col sm:items-center")}>
      <div className={cn("max-w-2xl", center && "mx-auto")}>
        <h2 className="font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] sm:text-[50px]">{title}</h2>
        {subtitle && <p className="mt-4 text-[17px] leading-8 text-muted-foreground sm:text-lg">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───────────────────────── Stats: rests on the bottom of the hero stage ───────────────────────── */

export function Stats({ data }: { data?: Block }) {
  const items = list<{ value: string; label: string }>(data, "items");
  if (!items.length) return null;
  return (
    <section className="relative z-10 mx-auto -mt-24 max-w-5xl px-4 sm:-mt-28 sm:px-6">
      <dl className="site-float grid grid-cols-2 rounded-[28px] border bg-card md:grid-cols-4">
        {items.map((s, i) => (
          <div key={s.label} className={cn("flex flex-col items-center gap-2 px-6 py-7 text-center sm:py-8", i % 2 === 1 && "border-l", i >= 2 && "border-t md:border-t-0", i > 0 && "md:border-l")}>
            <dt className="text-[15px] text-muted-foreground">{s.label}</dt>
            <dd className="font-display order-first text-[36px] leading-none font-extrabold tracking-[-0.04em] tabular-nums sm:text-[44px]">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ───────────────────────── Features: a grid of product pictures ───────────────────────── */

// Six tiles read as wide + narrow, narrow + wide, then two halves (2-column tablets: wide, pair, wide, pair).
const SPANS_6 = ["md:col-span-2 lg:col-span-4", "lg:col-span-2", "lg:col-span-2", "md:col-span-2 lg:col-span-4", "lg:col-span-3", "lg:col-span-3"];

export function Features({ data }: { data?: Block }) {
  const items = list<{ icon: string; title: string; body: string }>(data, "items");
  if (!items.length) return null;
  const bento = items.length === 6;
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-28 pb-24 sm:px-6 sm:pt-36 sm:pb-32">
      <SectionHeading center title={str(data, "title", "Everything you need to learn by doing")} subtitle="Each part of a course lives in one place, from the first video to the certificate." />
      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-6">
        {items.map((f, i) => {
          const span = bento ? SPANS_6[i]! : "lg:col-span-2";
          const wide = span.includes("lg:col-span-4");
          return (
            <article key={f.title} className={cn("flex flex-col overflow-hidden rounded-[28px] border bg-card", span)}>
              <div aria-hidden className="h-56 border-b bg-[var(--site-tile)] p-5">
                <FeatureVignette icon={f.icon} wide={wide} />
              </div>
              <div className="p-7">
                <h3 className="text-[19px] font-bold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-2 max-w-prose text-[15px] leading-7 text-muted-foreground">{f.body}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── Courses ───────────────────────── */

const COVERS: [string, string][] = [
  ["#ece6ff", "#dcebff"],
  ["#ffe7d6", "#fbdcef"],
  ["#dcf5ea", "#dcecff"],
  ["#fff2c9", "#ffe0cf"],
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Cover for a course without a thumbnail: two lesson cards on a pastel ground. */
function CourseCover({ id }: { id: string }) {
  const [a, b] = COVERS[hash(id) % COVERS.length]!;
  return (
    <div className="relative size-full" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <div className="absolute top-1/2 left-1/2 w-[54%] -translate-x-[44%] -translate-y-[60%] rotate-[-6deg] rounded-xl bg-white/60 p-2.5">
        <div className="aspect-[16/7] rounded-lg bg-white/70" />
        <div className="mt-2 h-1.5 w-2/3 rounded-full bg-white/80" />
      </div>
      <div className="absolute top-1/2 left-1/2 w-[58%] -translate-x-1/2 -translate-y-[42%] rounded-xl bg-white p-2.5 shadow-[0_12px_30px_-12px_rgb(35_24_84/0.35)]">
        <div className="flex aspect-[16/7] items-center justify-center rounded-lg bg-[#1c1830]">
          <span className="flex size-7 items-center justify-center rounded-full bg-white">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-3 fill-[#6d45f5]" aria-hidden><path d="M7 4.8v14.4c0 .9.97 1.45 1.74.98l11.5-7.2a1.15 1.15 0 0 0 0-1.96L8.74 3.82C7.97 3.35 7 3.9 7 4.8Z" /></svg>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-3/4 rounded-full bg-[#e9e6f2]" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-[#f0eef6]" />
      </div>
    </div>
  );
}

export function CourseCard({ c }: { c: Schemas["PublicCourse"]; index?: number }) {
  return (
    <Link href={`/courses/${c.slug}`}
      className="group flex h-full flex-col rounded-[28px] border bg-card p-3 transition-colors hover:border-[var(--site-violet-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-violet)]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[20px]">
        {c.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnail_url} alt="" className="size-full object-cover" />
        ) : (
          <CourseCover id={c.id} />
        )}
        {c.price_label && <span className="absolute top-3 right-3 rounded-full bg-white px-3 py-1 text-[13px] font-bold text-[#19171f] shadow-sm">{c.price_label}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3 pt-5 pb-3">
        <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
          {c.level && <span className="rounded-full bg-[var(--site-violet-soft)] px-2.5 py-1 text-[var(--site-violet)] capitalize">{c.level}</span>}
          {c.category && <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{c.category}</span>}
        </div>
        <h3 className="mt-3 line-clamp-2 text-[19px] leading-snug font-bold tracking-[-0.01em]">{c.title}</h3>
        {c.subtitle && <p className="mt-1.5 line-clamp-2 text-[15px] leading-6 text-muted-foreground">{c.subtitle}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-5 text-[13px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><PlayCircle className="size-4" />{c.video_count} {c.video_count === 1 ? "lesson" : "lessons"}</span>
          {c.total_seconds > 0 && <span className="inline-flex items-center gap-1.5"><Clock className="size-4" />{formatHours(c.total_seconds)}</span>}
          {c.student_count > 0 && <span className="inline-flex items-center gap-1.5"><Users className="size-4" />{c.student_count} {c.student_count === 1 ? "learner" : "learners"}</span>}
        </div>
      </div>
    </Link>
  );
}

export function CoursesShowcase({ courses }: { courses: Schemas["PublicCourse"][] }) {
  if (!courses.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 sm:pb-32">
      <SectionHeading title="Start with a course" subtitle="Short video lessons with a task after each one. Finish every task and your certificate is issued."
        action={<Link href="/courses" className="site-btn site-btn-md site-btn-light self-start sm:self-auto">All courses<ChevronRight /></Link>} />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.slice(0, 6).map((c) => <CourseCard key={c.id} c={c} />)}</div>
    </section>
  );
}

/* ───────────────────────── How it works: a real sequence, so numbered ───────────────────────── */

export function HowItWorks({ data }: { data?: Block }) {
  const steps = list<{ title: string; body: string }>(data, "steps");
  if (!steps.length) return null;
  return (
    <section className="px-4 sm:px-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-[var(--site-violet-soft)] px-6 py-16 sm:px-12 sm:py-20">
        <div aria-hidden className="site-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_0%,#000,transparent)]" />
        <div className="relative">
          <SectionHeading center title={str(data, "title", "How it works")} subtitle={`${steps.length} steps from your first lesson to a certificate you can share.`} />
          <ol className="mt-14 grid gap-10 md:gap-6" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 200px), 1fr))` }}>
            {steps.map((s, i) => {
              const last = i === steps.length - 1;
              return (
                <li key={s.title} className="relative">
                  {!last && <span aria-hidden className="absolute top-6 right-[-12px] left-16 hidden border-t-2 border-dashed border-[var(--site-violet-line)] md:block" />}
                  <span className={cn("relative flex size-12 items-center justify-center rounded-full text-[17px] font-bold",
                    last ? "bg-[var(--site-violet)] text-white shadow-[0_10px_24px_-10px_var(--site-violet)]" : "bg-card text-[var(--site-violet)] ring-1 ring-[var(--site-violet-line)]")}>
                    {last ? <Award className="size-5" aria-label={`Step ${i + 1}`} /> : i + 1}
                  </span>
                  <h3 className="mt-5 text-[19px] font-bold tracking-[-0.01em]">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Testimonials ───────────────────────── */

export function Testimonials({ data }: { data?: Block }) {
  const items = list<{ name: string; role: string; quote: string; avatar_url?: string }>(data, "items");
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <SectionHeading center title="What learners say" />
      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((t) => (
          <figure key={t.name + t.quote} className="flex flex-col rounded-[28px] border bg-card p-7">
            <svg viewBox="0 0 32 24" className="h-6 w-8 fill-[var(--site-violet)]" aria-hidden>
              <path d="M0 24V14.4C0 6.13 3.47 1.33 10.4 0l1.6 3.2C8.27 4.27 6.4 6.67 6.4 10.4H12V24H0Zm20 0V14.4C20 6.13 23.47 1.33 30.4 0L32 3.2c-3.73 1.07-5.6 3.47-5.6 7.2H32V24H20Z" />
            </svg>
            <blockquote className="mt-5 flex-1 text-[17px] leading-8">{t.quote}</blockquote>
            <figcaption className="mt-7 flex items-center gap-3">
              {t.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.avatar_url} alt="" className="size-11 rounded-full object-cover" />
              ) : (
                <span className="flex size-11 items-center justify-center rounded-full bg-[var(--site-violet-soft)] text-[14px] font-bold text-[var(--site-violet)]">
                  {t.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="text-[15px] leading-tight"><b className="block font-semibold">{t.name}</b><span className="text-muted-foreground">{t.role}</span></span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

export function FAQ({ data }: { data?: Block }) {
  const items = list<{ q: string; a: string }>(data, "items");
  const [open, setOpen] = React.useState<number | null>(0);
  if (!items.length) return null;
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-24 sm:px-6 sm:pb-32">
      <SectionHeading center title="Questions before you join"
        subtitle={<>Still unsure? <Link href="/contact" className="font-semibold text-[var(--site-violet)] underline-offset-4 hover:underline">Send us a message</Link> and the team will reply.</>} />
      <div className="mt-12 grid gap-3">
        {items.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className={cn("rounded-[24px] border bg-card", isOpen && "site-float")}>
              <h3>
                <button type="button" id={`faq-q-${i}`} aria-controls={`faq-a-${i}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 rounded-[24px] p-6 text-left text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-violet)]">
                  {f.q}
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-200",
                    isOpen ? "rotate-45 bg-[var(--site-violet)] text-white" : "bg-[var(--site-violet-soft)] text-[var(--site-violet)]")}>
                    <Plus className="size-4" />
                  </span>
                </button>
              </h3>
              <motion.div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <p className="px-6 pb-6 text-[16px] leading-7 text-muted-foreground">{f.a}</p>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── Closing call to action ───────────────────────── */

export function CTA({ data }: { data?: Block }) {
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-32">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] px-7 py-16 text-white sm:px-16 sm:py-20"
        style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--site-violet) 78%, #ff8cc6) 0%, var(--site-violet) 48%, color-mix(in oklab, var(--site-violet) 72%, #170c45) 100%)" }}>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.09)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(70%_90%_at_85%_50%,#000,transparent)]" />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <h2 className="font-display text-[36px] leading-[1.04] font-extrabold tracking-[-0.04em] sm:text-[54px]">{str(data, "title", "Start learning today")}</h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-white/80">{str(data, "subtitle", "Join the next batch and build real projects with mentor support.")}</p>
            <Link href={str(data, "button_link", "/register")} className="site-btn site-btn-lg site-btn-white mt-9">{str(data, "button_text", "Get started")}<ChevronRight /></Link>
          </div>
          <div aria-hidden className="relative hidden h-64 lg:block">
            <div className="absolute top-2 right-6 w-[300px] rotate-[5deg] rounded-[22px] bg-white p-4 text-[#19171f] shadow-[0_24px_50px_-20px_rgb(20_8_70/0.6)]">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-[#e3f7ec] text-[#13955a]"><CheckCircle2 className="size-5" /></span>
                <span className="leading-tight"><b className="block text-[15px]">Task approved</b><span className="text-[13px] text-[#6b6880]">Your mentor marked it 9/10</span></span>
              </div>
            </div>
            <div className="absolute right-24 bottom-4 w-[300px] rotate-[-4deg] rounded-[22px] bg-white p-4 text-[#19171f] shadow-[0_24px_50px_-20px_rgb(20_8_70/0.6)]">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-[#ece6ff] text-[#6d45f5]"><Award className="size-5" /></span>
                <span className="leading-tight"><b className="block text-[15px]">Certificate issued</b><span className="text-[13px] text-[#6b6880]">Ready to share and verify</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
