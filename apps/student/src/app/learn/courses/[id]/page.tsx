"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Markdown, Progress, Skeleton } from "@lms/ui";
import { $api } from "@/lib/api";
import { Playlist } from "@/features/learn/playlist";

export default function MyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const q = $api.useQuery("get", "/api/v1/me/courses/{id}", { params: { path: { id } } });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Course not available" description="You may not be enrolled in this course." />;
  const { course: c, playlist } = q.data;
  const next = playlist.find((v) => !v.done) ?? playlist[0];
  return (
    <div className="mx-auto max-w-6xl">
      <div className="relative overflow-hidden rounded-3xl border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-fuchsia-600/25 to-amber-400/20" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />}
        <div className="relative p-6 sm:p-10">
          <p className="text-sm text-muted-foreground">{c.batch_name || c.category}</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{c.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{c.subtitle}</p>
          <div className="mt-6 flex max-w-md items-center gap-3"><Progress value={c.progress_pct} className="h-2.5" /><span className="text-sm font-semibold">{c.progress_pct}%</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{c.approved_tasks} of {c.total_tasks} tasks approved</p>
          {next && <Button size="lg" className="mt-6" asChild><Link href={`/learn/watch/${next.id}`}><PlayCircle /> {c.progress_pct ? "Continue" : "Start course"}</Link></Button>}
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-4"><h2 className="mb-3 px-2 text-lg font-bold">Lessons</h2><Playlist items={playlist} /></Card>
          {q.data.description && <Card className="p-6"><h2 className="mb-3 text-lg font-bold">About</h2><Markdown>{q.data.description}</Markdown></Card>}
        </div>
        <div className="space-y-6">
          {q.data.what_you_learn.length > 0 && (
            <Card className="p-5"><h3 className="mb-3 font-semibold">What you'll learn</h3><ul className="space-y-2 text-sm">{q.data.what_you_learn.map((w) => <li key={w} className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-success" />{w}</li>)}</ul></Card>
          )}
          {q.data.mentors.length > 0 && (
            <Card className="p-5"><h3 className="mb-3 font-semibold">Mentors</h3><div className="space-y-3">{q.data.mentors.map((m) => <div key={m.id} className="flex items-center gap-3"><Avatar src={m.avatar_url} name={m.name} /><span className="text-sm"><b className="block">{m.name}</b><span className="text-muted-foreground">{m.email}</span></span></div>)}</div></Card>
          )}
        </div>
      </div>
    </div>
  );
}
