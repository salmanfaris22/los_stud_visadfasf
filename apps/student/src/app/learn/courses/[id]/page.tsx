"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { Avatar, Button, Card, EmptyState, LineBadge, LineTrack, Markdown, Skeleton, lineColor } from "@lms/ui";
import { $api } from "@/lib/api";
import { Playlist } from "@/features/learn/playlist";

export default function MyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const q = $api.useQuery("get", "/api/v1/me/courses/{id}", { params: { path: { id } } });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Course not available" description="You may not be enrolled in this course." />;
  const { course: c, playlist } = q.data;
  const color = lineColor(id);
  const next = playlist.find((v) => !v.done) ?? playlist[0];
  const doneCount = playlist.filter((v) => v.done).length;
  // Line map uses the real playlist; long courses are drawn without labels.
  const mapStops = playlist.length <= 8 ? playlist.map((v) => ({ label: v.title, done: v.done })) : playlist.map((v) => ({ done: v.done }));
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/learn/courses" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My courses</Link>
      <div className="relative overflow-hidden rounded-[28px] border bg-card shadow-sm dark:shadow-none">
        <span className="absolute inset-x-0 top-0 h-2" style={{ background: color }} />
        <div className="map-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_left,#000,transparent_70%)]" />
        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <LineBadge id={id} name={c.title} size="lg" />
              <span className="text-sm font-semibold text-muted-foreground">{c.batch_name || c.category}</span>
            </div>
            <h1 className="mt-5 font-display text-3xl leading-[1.05] font-extrabold sm:text-[44px]">{c.title}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{c.subtitle}</p>
          </div>
          <div className="flex items-end gap-6">
            <div>
              <div className="font-display text-5xl leading-none font-extrabold tabular-nums">{c.progress_pct}<span className="text-2xl text-muted-foreground">%</span></div>
              <p className="mt-2 text-xs text-muted-foreground">{c.approved_tasks} of {c.total_tasks} tasks approved</p>
            </div>
            {next && <Button size="lg" asChild><Link href={`/learn/watch/${next.id}`}><Play className="fill-current" /> {c.progress_pct ? "Continue" : "Start course"}</Link></Button>}
          </div>
          {playlist.length > 0 && (
            <div className="lg:col-span-2">
              <div className="mb-1 flex justify-between text-xs font-semibold text-muted-foreground"><span>Line map</span><span>{doneCount}/{playlist.length} stops done</span></div>
              <LineTrack color={color} stops={mapStops} labels={playlist.length <= 8} size="lg" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-3 sm:p-4">
            <h2 className="mb-2 px-3 pt-2 font-display text-lg font-extrabold">Route</h2>
            <Playlist items={playlist} color={color} />
          </Card>
          {q.data.description && <Card className="p-6"><h2 className="mb-3 font-display text-lg font-extrabold">About</h2><Markdown>{q.data.description}</Markdown></Card>}
        </div>
        <div className="space-y-6">
          {q.data.what_you_learn.length > 0 && (
            <Card className="p-6"><h3 className="mb-4 font-bold">What you'll learn</h3><ul className="space-y-2.5 text-sm">{q.data.what_you_learn.map((w) => <li key={w} className="flex gap-2.5"><CheckCircle2 className="size-4 shrink-0" style={{ color }} />{w}</li>)}</ul></Card>
          )}
          {q.data.mentors.length > 0 && (
            <Card className="p-6"><h3 className="mb-4 font-bold">Mentors</h3><div className="space-y-3">{q.data.mentors.map((m) => <div key={m.id} className="flex items-center gap-3"><Avatar src={m.avatar_url} name={m.name} /><span className="min-w-0 text-sm"><b className="block">{m.name}</b><span className="block truncate text-muted-foreground">{m.email}</span></span></div>)}</div></Card>
          )}
        </div>
      </div>
    </div>
  );
}
