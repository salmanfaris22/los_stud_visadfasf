"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight, Award, BarChart3, BookOpen, CheckCircle2, ChevronDown, Clock, PlayCircle, Rocket, ShieldCheck, Sparkles, Star, Users, Video,
} from "lucide-react";
import type { Schemas } from "@lms/api-client";
import { Badge, Button, cn, formatHours } from "@lms/ui";
import { CountUp, Reveal } from "./reveal";

type Block = Record<string, unknown>;
const str = (b: Block | undefined, k: string, d = "") => (typeof b?.[k] === "string" && b[k] ? (b[k] as string) : d);
const list = <T,>(b: Block | undefined, k: string) => (Array.isArray(b?.[k]) ? (b![k] as T[]) : []);

const ICONS: Record<string, typeof PlayCircle> = { play: PlayCircle, check: CheckCircle2, video: Video, chart: BarChart3, award: Award, users: Users, book: BookOpen, star: Star, rocket: Rocket, shield: ShieldCheck };

export function Hero({ data }: { data?: Block }) {
  const title = str(data, "title", "Learn skills that get you hired");
  const hl = str(data, "highlight");
  const parts = hl && title.includes(hl) ? title.split(hl) : [title];
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)] bg-[size:48px_48px] opacity-40" />
      <motion.div className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[700px] -translate-x-1/2 rounded-full bg-primary/30 blur-[140px]" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 10, repeat: Infinity }} />
      <motion.div className="pointer-events-none absolute top-40 -right-40 -z-10 size-[420px] rounded-full bg-fuchsia-500/25 blur-[120px]" animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 14, repeat: Infinity }} />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          {str(data, "badge") && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Badge className="mb-5 gap-1.5 px-3 py-1 text-sm"><Sparkles className="size-3.5" /> {str(data, "badge")}</Badge>
            </motion.div>
          )}
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }} className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
            {parts.length > 1 ? (<>{parts[0]}<span className="bg-gradient-to-r from-primary via-fuchsia-500 to-amber-400 bg-clip-text text-transparent">{hl}</span>{parts[1]}</>) : title}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="mt-6 max-w-xl text-lg text-muted-foreground">
            {str(data, "subtitle", "Video lessons, hands-on tasks reviewed by mentors, live classes and certificates.")}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild className="shadow-xl shadow-primary/30"><Link href={str(data, "cta_link", "/courses")}>{str(data, "cta_text", "Explore courses")} <ArrowRight /></Link></Button>
            {str(data, "secondary_text") && <Button size="lg" variant="outline" asChild><Link href={str(data, "secondary_link", "/contact")}>{str(data, "secondary_text")}</Link></Button>}
          </motion.div>
        </div>
        <HeroVisual image={str(data, "image_url")} />
      </div>
    </section>
  );
}

function HeroVisual({ image }: { image?: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.92, rotate: -2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.3, duration: 0.9, ease: [0.21, 0.6, 0.35, 1] }} className="relative mx-auto w-full max-w-lg">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/10">
        <div className="relative aspect-video bg-gradient-to-br from-primary/60 via-fuchsia-600/50 to-amber-500/40">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center"><motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="rounded-full bg-white/90 p-4 text-primary shadow-xl"><PlayCircle className="size-10" /></motion.div></div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><motion.div className="h-full bg-primary" initial={{ width: "8%" }} animate={{ width: "64%" }} transition={{ duration: 3, delay: 1 }} /></div>
        </div>
        <div className="space-y-3 p-5">
          <div className="h-3 w-3/4 rounded-full bg-muted" /><div className="h-3 w-1/2 rounded-full bg-muted" />
          <div className="flex gap-2 pt-1">{["Tasks", "Q&A", "Quiz"].map((t, i) => <span key={t} className={cn("rounded-full px-3 py-1 text-xs", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted")}>{t}</span>)}</div>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }} className="absolute -right-4 -bottom-6 flex items-center gap-3 rounded-2xl border bg-popover p-3 shadow-xl sm:-right-10">
        <span className="rounded-xl bg-success/15 p-2 text-success"><CheckCircle2 className="size-5" /></span>
        <span className="text-sm"><b className="block">Task approved</b><span className="text-xs text-muted-foreground">9/10 · “Great work!”</span></span>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.8 }} className="absolute -top-6 -left-4 flex items-center gap-3 rounded-2xl border bg-popover p-3 shadow-xl sm:-left-10">
        <span className="rounded-xl bg-primary/15 p-2 text-primary"><Video className="size-5" /></span>
        <span className="text-sm"><b className="block">Live class at 7 PM</b><span className="text-xs text-muted-foreground">Google Meet · 32 joined</span></span>
      </motion.div>
    </motion.div>
  );
}

export function Stats({ data }: { data?: Block }) {
  const items = list<{ value: string; label: string }>(data, "items");
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-border md:grid-cols-4">
        {items.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08} className="bg-card p-6 text-center">
            <div className="font-display text-3xl font-extrabold sm:text-4xl"><CountUp value={s.value} /></div>
            <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      {eyebrow && <div className="mb-3 text-sm font-semibold tracking-wider text-primary uppercase">{eyebrow}</div>}
      <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
    </Reveal>
  );
}

export function Features({ data }: { data?: Block }) {
  const items = list<{ icon: string; title: string; body: string }>(data, "items");
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="Why us" title={str(data, "title", "Everything you need to learn by doing")} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f, i) => {
          const Icon = ICONS[f.icon] ?? Sparkles;
          return (
            <Reveal key={f.title} delay={i * 0.07}>
              <motion.div whileHover={{ y: -6 }} className="group h-full rounded-2xl border bg-card p-6 transition-shadow hover:shadow-xl hover:shadow-primary/5">
                <span className="inline-flex rounded-xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 p-3 text-primary transition group-hover:scale-110"><Icon className="size-6" /></span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.body}</p>
              </motion.div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function CourseCard({ c, index = 0 }: { c: Schemas["PublicCourse"]; index?: number }) {
  return (
    <Reveal delay={(index % 3) * 0.08}>
      <Link href={`/courses/${c.slug}`} className="group block h-full overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-primary/50 via-fuchsia-600/40 to-amber-400/40">
          {c.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail_url} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
          )}
          {c.price_label && <span className="absolute top-3 right-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold backdrop-blur">{c.price_label}</span>}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary" className="capitalize">{c.level}</Badge>{c.category}</div>
          <h3 className="mt-2 line-clamp-2 text-lg font-semibold group-hover:text-primary">{c.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.subtitle}</p>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><PlayCircle className="size-3.5" />{c.video_count} lessons</span>
            {c.total_seconds > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{formatHours(c.total_seconds)}</span>}
            {c.student_count > 0 && <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{c.student_count}</span>}
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export function CoursesShowcase({ courses }: { courses: Schemas["PublicCourse"][] }) {
  if (!courses.length) return null;
  return (
    <section className="bg-gradient-to-b from-transparent via-primary/5 to-transparent py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle eyebrow="Courses" title="Start with a course" subtitle="Each lesson comes with hands-on tasks reviewed by a mentor." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.slice(0, 6).map((c, i) => <CourseCard key={c.id} c={c} index={i} />)}</div>
        <Reveal className="mt-10 text-center"><Button variant="outline" size="lg" asChild><Link href="/courses">See all courses <ArrowRight /></Link></Button></Reveal>
      </div>
    </section>
  );
}

export function HowItWorks({ data }: { data?: Block }) {
  const steps = list<{ title: string; body: string }>(data, "steps");
  if (!steps.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="Process" title={str(data, "title", "How it works")} />
      <div className="relative grid gap-8 md:grid-cols-4">
        <div className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 md:block" />
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.12} className="relative text-center">
            <motion.div whileHover={{ scale: 1.08, rotate: 3 }} className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 font-display text-xl font-bold text-white shadow-lg shadow-primary/30">{i + 1}</motion.div>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Testimonials({ data }: { data?: Block }) {
  const items = list<{ name: string; role: string; quote: string; avatar_url?: string }>(data, "items");
  if (!items.length) return null;
  const loop = [...items, ...items, ...items, ...items];
  return (
    <section className="py-24">
      <SectionTitle eyebrow="Stories" title="Loved by learners" />
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-5 hover:[animation-play-state:paused]">
          {loop.map((t, i) => (
            <figure key={i} className="w-80 shrink-0 rounded-2xl border bg-card p-6">
              <div className="flex gap-0.5 text-amber-400">{Array.from({ length: 5 }).map((_, j) => <Star key={j} className="size-4 fill-current" />)}</div>
              <blockquote className="mt-3 text-sm leading-6">“{t.quote}”</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-xs font-bold text-white">{t.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                <span className="text-sm"><b className="block">{t.name}</b><span className="text-muted-foreground">{t.role}</span></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQ({ data }: { data?: Block }) {
  const items = list<{ q: string; a: string }>(data, "items");
  const [open, setOpen] = React.useState<number | null>(0);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="FAQ" title="Questions? Answers." />
      <div className="divide-y rounded-2xl border bg-card">
        {items.map((f, i) => (
          <div key={f.q}>
            <button className="flex w-full items-center justify-between gap-4 p-5 text-left font-medium" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {f.q}<ChevronDown className={cn("size-5 shrink-0 transition", open === i && "rotate-180")} />
            </button>
            <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} className="overflow-hidden">
              <p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">{f.a}</p>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CTA({ data }: { data?: Block }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-fuchsia-600 px-8 py-16 text-center text-white shadow-2xl shadow-primary/30">
          <motion.div className="absolute -top-20 -left-20 size-72 rounded-full bg-white/10 blur-3xl" animate={{ x: [0, 60, 0] }} transition={{ duration: 8, repeat: Infinity }} />
          <h2 className="relative font-display text-3xl font-bold sm:text-4xl">{str(data, "title", "Start learning today")}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">{str(data, "subtitle", "Join the next batch and build real projects with mentor support.")}</p>
          <Button size="lg" variant="secondary" asChild className="relative mt-8"><Link href={str(data, "button_link", "/register")}>{str(data, "button_text", "Get started")} <ArrowRight /></Link></Button>
        </div>
      </Reveal>
    </section>
  );
}
