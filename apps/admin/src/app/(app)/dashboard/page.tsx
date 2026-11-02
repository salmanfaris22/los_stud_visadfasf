"use client";
import Link from "next/link";
import { Award, BookOpen, CalendarDays, ClipboardCheck, Inbox, Users, UsersRound } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Skeleton, StatCard, StatusBadge, formatDateTime, timeAgo } from "@lms/ui";
import { $api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ActivityChart, CourseProgressChart } from "@/features/dashboard/charts";

export default function DashboardPage() {
  const { me, can } = useSession();
  const overview = $api.useQuery("get", "/api/v1/analytics/overview", { params: { query: { days: 30 } } }, { enabled: can("analytics") });
  const pending = $api.useQuery("get", "/api/v1/submissions", { params: { query: { status: "pending", per_page: 6 } } }, { enabled: can("submissions") });
  const live = $api.useQuery("get", "/api/v1/live", { params: { query: { from: new Date().toISOString(), per_page: 50 } } }, { enabled: can("live") });
  const c = overview.data?.counts;
  const upcoming = [...(live.data?.items ?? [])].filter((l) => l.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4);

  return (
    <>
      <PageHeader title={`Hi ${me?.name.split(" ")[0] ?? ""} 👋`} description="Here's what's happening across your academy today." />
      {can("analytics") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {overview.isLoading || !c ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : (
            <>
              <StatCard label="Students" value={c.students} hint={`${c.active_students} active this week`} icon={<Users />} />
              <StatCard label="Pending reviews" value={c.pending_reviews} hint={`${overview.data?.approval_rate}% approval rate`} icon={<ClipboardCheck />} tone="warning" />
              <StatCard label="Published courses" value={c.published_courses} hint={`${c.active_batches} active batches`} icon={<BookOpen />} tone="info" />
              <StatCard label="Certificates" value={c.certificates} hint={`${c.new_leads} new leads`} icon={<Award />} tone="success" />
            </>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {can("analytics") && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Task activity · last 30 days</CardTitle></CardHeader>
            <CardContent>{overview.data ? <ActivityChart data={overview.data.daily} /> : <Skeleton className="h-64" />}</CardContent>
          </Card>
        )}
        {can("live") && (
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Upcoming live</CardTitle><Button variant="link" size="sm" asChild><Link href="/live">All</Link></Button></CardHeader>
            <CardContent className="space-y-3">
              {upcoming.length === 0 && <EmptyState icon={<CalendarDays />} title="No live classes scheduled" className="py-8" />}
              {upcoming.map((l) => (
                <Link key={l.id} href={`/live/${l.id}`} className="block rounded-lg border p-3 transition hover:border-primary/50">
                  <div className="font-medium">{l.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(l.starts_at)} · {l.host_name || "No host"}</div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        {can("submissions") && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Waiting for review</CardTitle><Button variant="link" size="sm" asChild><Link href="/submissions">Review queue</Link></Button></CardHeader>
            <CardContent>
              {pending.data?.items.length === 0 && <EmptyState icon={<ClipboardCheck />} title="Nothing to review" description="New task submissions will appear here." className="py-8" />}
              <div className="divide-y">
                {pending.data?.items.map((s) => (
                  <Link key={s.id} href={`/submissions/${s.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.task_title}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.student_name} · {s.course_title}</div>
                    </div>
                    {s.is_late && <Badge variant="destructive">Late</Badge>}
                    <StatusBadge status={s.status} />
                    <span className="hidden text-xs text-muted-foreground sm:inline">{timeAgo(s.created_at)}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {can("analytics") && (
          <Card>
            <CardHeader><CardTitle>Course progress</CardTitle></CardHeader>
            <CardContent>{overview.data ? <CourseProgressChart data={overview.data.courses} /> : <Skeleton className="h-64" />}</CardContent>
          </Card>
        )}
      </div>

      {!can("analytics") && !can("submissions") && (
        <EmptyState icon={<UsersRound />} title="Welcome!" description="Use the menu to open the areas your role gives you access to." className="mt-6" />
      )}
      {can("leads") && c && c.new_leads > 0 && (
        <Card className="mt-6"><CardContent className="flex items-center gap-3 pt-5"><Inbox className="text-primary" /><span className="flex-1 text-sm">{c.new_leads} new enquiries are waiting.</span><Button size="sm" asChild><Link href="/leads">Open leads</Link></Button></CardContent></Card>
      )}
    </>
  );
}
