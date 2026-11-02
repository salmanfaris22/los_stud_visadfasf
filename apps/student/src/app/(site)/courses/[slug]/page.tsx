import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Globe2, MapPin, PlayCircle, Signal } from "lucide-react";
import { Avatar, Badge, Button, Markdown, formatHours } from "@lms/ui";
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
  const jsonLd = { "@context": "https://schema.org", "@type": "Course", name: c.title, description: c.subtitle, provider: { "@type": "Organization", name: "LMS" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/15 via-background to-fuchsia-500/10 pt-32 pb-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary" className="capitalize">{c.level}</Badge>{c.category && <Badge variant="outline">{c.category}</Badge>}</div>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{c.title}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{c.subtitle}</p>
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><PlayCircle className="size-4" />{c.video_count} lessons</span>
              <span className="inline-flex items-center gap-1.5"><ClipboardList className="size-4" />{d.task_count} tasks</span>
              {c.total_seconds > 0 && <span className="inline-flex items-center gap-1.5"><Clock className="size-4" />{formatHours(c.total_seconds)} of video</span>}
              <span className="inline-flex items-center gap-1.5"><Globe2 className="size-4" />{c.language}</span>
              <span className="inline-flex items-center gap-1.5"><Signal className="size-4" />{c.level}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="aspect-video bg-gradient-to-br from-primary/50 via-fuchsia-600/40 to-amber-400/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="size-full object-cover" />}
            </div>
            <div className="space-y-3 p-5">
              {c.price_label && <div className="font-display text-3xl font-bold">{c.price_label}</div>}
              <Button size="lg" className="w-full" asChild><a href="#enquire">Enquire / Join a batch</a></Button>
              <Button size="lg" variant="outline" className="w-full" asChild><Link href="/login">Already enrolled? Sign in</Link></Button>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-12">
          {d.what_you_learn.length > 0 && (
            <section className="rounded-2xl border p-6">
              <h2 className="font-display text-2xl font-bold">What you'll learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">{d.what_you_learn.map((w) => <li key={w} className="flex gap-2 text-sm"><CheckCircle2 className="size-5 shrink-0 text-success" />{w}</li>)}</ul>
            </section>
          )}
          <section>
            <h2 className="mb-4 font-display text-2xl font-bold">Curriculum</h2>
            <Lessons lessons={d.lessons} />
          </section>
          {d.description && <section><h2 className="mb-4 font-display text-2xl font-bold">About this course</h2><Markdown>{d.description}</Markdown></section>}
          {d.mentors.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-2xl font-bold">Your mentors</h2>
              <div className="grid gap-4 sm:grid-cols-2">{d.mentors.map((m) => <div key={m.id} className="flex gap-4 rounded-2xl border p-4"><Avatar src={m.avatar_url} name={m.name} className="size-12" /><div><div className="font-semibold">{m.name}</div><p className="mt-1 text-sm text-muted-foreground">{m.bio || "Mentor"}</p></div></div>)}</div>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          {d.batches.length > 0 && (
            <div className="rounded-2xl border p-5">
              <h3 className="font-semibold">Upcoming batches</h3>
              <div className="mt-3 space-y-3">
                {d.batches.map((b) => (
                  <div key={b.id} className="rounded-xl bg-muted/50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2"><b>{b.name}</b><Badge variant={b.is_offline ? "warning" : "info"}>{b.type_name}</Badge></div>
                    {b.start_date && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-3.5" />Starts {new Date(b.start_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {b.schedule_note && <div className="mt-1 text-muted-foreground">{b.schedule_note}</div>}
                    {b.location && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" />{b.location}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div id="enquire" className="scroll-mt-28 rounded-2xl border p-5">
            <h3 className="mb-4 font-semibold">Talk to our team</h3>
            <LeadForm courseId={c.id} source="course-page" compact />
          </div>
        </aside>
      </div>
    </>
  );
}
