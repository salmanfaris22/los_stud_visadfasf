"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Megaphone, Video } from "lucide-react";
import { Button, Card, EmptyState, Markdown, Skeleton, timeAgo } from "@lms/ui";
import { $api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CourseTile, LiveCard, TaskRow } from "@/features/learn/cards";

export default function LearnHome() {
  const { me } = useSession();
  const q = $api.useQuery("get", "/api/v1/me/dashboard");
  const d = q.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{greet}, {me?.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-muted-foreground">Pick up where you left off.</p>
      </div>
      {q.isLoading || !d ? <Skeleton className="h-96" /> : (
        <>
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Upcoming live classes</h2><Button variant="link" asChild><Link href="/learn/live">All <ArrowRight /></Link></Button></div>
            {d.upcoming_live.length === 0 ? <EmptyState icon={<Video />} title="No live classes scheduled" /> : <div className="space-y-3">{d.upcoming_live.map((s) => <LiveCard key={s.id} s={s} />)}</div>}
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Continue learning</h2><Button variant="link" asChild><Link href="/learn/courses">All courses <ArrowRight /></Link></Button></div>
            {d.courses.length === 0 ? <EmptyState title="No courses yet" description="Your institute will assign courses to you. They appear here." /> : (
              <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{d.courses.map((c) => <CourseTile key={c.enrollment_id} c={c} />)}</div>
            )}
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Next tasks</h2><Button variant="link" asChild><Link href="/learn/tasks">All tasks <ArrowRight /></Link></Button></div>
            {d.next_tasks.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="All done!" description="No tasks waiting for you right now." /> : <div className="space-y-2">{d.next_tasks.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
          </section>
          {d.announcements.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">Announcements</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {d.announcements.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex items-center gap-2 font-semibold"><Megaphone className="size-4 text-primary" />{a.title}</div>
                    <Markdown className="mt-2 line-clamp-4 text-sm text-muted-foreground">{a.body}</Markdown>
                    <p className="mt-2 text-xs text-muted-foreground">{a.author_name} · {timeAgo(a.created_at)}</p>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
