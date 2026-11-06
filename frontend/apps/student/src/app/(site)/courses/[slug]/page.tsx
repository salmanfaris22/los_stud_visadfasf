import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Globe2, MapPin, PlayCircle, Signal } from "lucide-react";
import { Avatar, Badge, Button, LineBadge, LineTrack, Markdown, formatHours, lineColor } from "@lms/ui";
import { LeadForm } from "@/components/site/lead-form";
import { getCourse } from "@/lib/server-api";
import { Lessons } from "./preview";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCourse((await params).slug);
  if (!c) return { title: "Course not found" };
  return { title: c.course.title, description: c.course.subtitle, openGraph: { images: c.course.thumbnail_url ? [c.course.thumbnail_url] : [] } };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await getCourse((await params).slug);
  if (!d) notFound();
  const c = d.course;
  const color = lineColor(c.id);
  const jsonLd = { "@context": "https://schema.org", "@type": "Course", name: c.title, description: c.subtitle, provider: { "@type": "Organization", name: "LMS" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden border-b pt-32 pb-14" style={{ background: `color-mix(in oklab, ${color} 9%, var(--background))` }}>
        <div className="map-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <LineBadge id={c.id} name={c.title} size="lg" />
              <div className="flex flex-wrap gap-2"><Badge variant="outline" className="bg-card capitalize">{c.level}</Badge>{c.category && <Badge variant="outline" className="bg-card">{c.category}</Badge>}</div>
            </div>
            <h1 className="mt-6 font-display text-4xl leading-[1.04] font-extrabold sm:text-[56px]">{c.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{c.subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-2 text-sm font-medium">
              {[
                { icon: PlayCircle, t: `${c.video_count} lessons` },
                { icon: ClipboardList, t: `${d.task_count} tasks` },
                ...(c.total_seconds > 0 ? [{ icon: Clock, t: `${formatHours(c.total_seconds)} of video` }] : []),
                { icon: Globe2, t: c.language },
                { icon: Signal, t: c.level },
              ].map(({ icon: I, t }) => <span key={t} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 capitalize"><I className="size-4 text-muted-foreground" />{t}</span>)}
            </div>
            {d.lessons.length > 0 && (
              <div className="mt-10 max-w-2xl rounded-[20px] border bg-card/80 p-5 backdrop-blur">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Line map</span><span>{d.lessons.length} stops · certificate</span></div>
                <LineTrack color={color} stops={d.lessons.length <= 8 ? d.lessons.map((l) => ({ label: l.title })) : Math.min(d.lessons.length, 24)} labels={d.lessons.length <= 8} progress={0} animate={false} />
              </div>
            )}
          </div>
          <div className="h-fit overflow-hidden rounded-[28px] border bg-card p-2 shadow-xl dark:shadow-none lg:sticky lg:top-24">
            <div className="relative aspect-video overflow-hidden rounded-[20px]" style={{ background: `color-mix(in oklab, ${color} 22%, var(--card))` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" className="size-full object-cover" /> : <div className="map-grid flex size-full items-center justify-center"><LineBadge id={c.id} name={c.title} size="xl" className="size-20 text-2xl" /></div>}
              <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: color }} />
            </div>
            <div className="space-y-3 p-4">
              {c.price_label && <div className="font-display text-3xl font-extrabold">{c.price_label}</div>}
              <Button size="lg" className="w-full" asChild><a href="#enquire">Enquire / Join a batch</a></Button>
              <Button size="lg" variant="outline" className="w-full" asChild><Link href="/login">Already enrolled? Sign in</Link></Button>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-12">
          {d.what_you_learn.length > 0 && (
            <section className="rounded-[20px] border bg-card p-7 shadow-sm dark:shadow-none">
              <h2 className="font-display text-2xl font-extrabold">What you'll learn</h2>
              <ul className="mt-5 grid gap-3.5 sm:grid-cols-2">{d.what_you_learn.map((w) => <li key={w} className="flex gap-2.5 text-[15px]"><CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color }} />{w}</li>)}</ul>
            </section>
          )}
          <section>
            <h2 className="mb-4 font-display text-2xl font-extrabold">Curriculum</h2>
            <Lessons lessons={d.lessons} color={color} />
          </section>
          {d.description && <section><h2 className="mb-4 font-display text-2xl font-extrabold">About this course</h2><Markdown>{d.description}</Markdown></section>}
          {d.mentors.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-2xl font-extrabold">Your mentors</h2>
              <div className="grid gap-4 sm:grid-cols-2">{d.mentors.map((m) => <div key={m.id} className="flex gap-4 rounded-[20px] border bg-card p-5"><Avatar src={m.avatar_url} name={m.name} className="size-12" /><div><div className="font-semibold">{m.name}</div><p className="mt-1 text-sm text-muted-foreground">{m.bio || "Mentor"}</p></div></div>)}</div>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          {d.batches.length > 0 && (
            <div className="rounded-[20px] border bg-card p-6">
              <h3 className="font-display text-lg font-bold">Upcoming batches</h3>
              <div className="mt-3 space-y-3">
                {d.batches.map((b) => (
                  <div key={b.id} className="rounded-2xl border-l-4 bg-muted/50 p-4 text-sm" style={{ borderLeftColor: color }}>
                    <div className="flex items-center justify-between gap-2"><b>{b.name}</b><Badge variant={b.is_offline ? "warning" : "info"}>{b.type_name}</Badge></div>
                    {b.start_date && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-3.5" />Starts {new Date(b.start_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {b.schedule_note && <div className="mt-1 text-muted-foreground">{b.schedule_note}</div>}
                    {b.location && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" />{b.location}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div id="enquire" className="scroll-mt-28 rounded-[20px] border bg-card p-6">
            <h3 className="mb-4 font-display text-lg font-bold">Talk to our team</h3>
            <LeadForm courseId={c.id} source="course-page" compact />
          </div>
        </aside>
      </div>
    </>
  );
}
