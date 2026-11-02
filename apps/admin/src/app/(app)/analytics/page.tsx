"use client";
import * as React from "react";
import { CalendarCheck, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Select, Skeleton, StatCard, TBody, TD, TH, THead, TR, Table, Progress } from "@lms/ui";
import { $api } from "@/lib/api";
import { ActivityChart, CourseProgressChart } from "@/features/dashboard/charts";

export default function AnalyticsPage() {
  const [days, setDays] = React.useState(30);
  const q = $api.useQuery("get", "/api/v1/analytics/overview", { params: { query: { days } } });
  const d = q.data;
  return (
    <>
      <PageHeader title="Analytics" description="Engagement, reviews, completion and attendance."
        actions={<Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></Select>} />
      {!d ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Active students (7d)" value={`${d.counts.active_students}/${d.counts.students}`} icon={<Users />} />
            <StatCard label="Approval rate" value={`${d.approval_rate}%`} hint={`${d.counts.approved_submissions} approved`} icon={<ClipboardCheck />} tone="success" />
            <StatCard label="Live attendance (30d)" value={d.attendance.live_present_30d} hint={`${d.attendance.live_sessions_30d} sessions held`} icon={<CalendarCheck />} tone="info" />
            <StatCard label="Offline attendance" value={`${d.attendance.offline_rate_pct}%`} hint={`${d.attendance.offline_marked_30d} marks in 30 days`} icon={<GraduationCap />} tone="warning" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Submissions vs approvals</CardTitle></CardHeader><CardContent><ActivityChart data={d.daily} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Average progress by course</CardTitle></CardHeader><CardContent><CourseProgressChart data={d.courses} /></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Course completion</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Course</TH><TH>Students</TH><TH>Completed</TH><TH className="w-1/3">Average progress</TH></TR></THead>
                <TBody>
                  {d.courses.map((c) => (
                    <TR key={c.id}><TD className="font-medium">{c.title}</TD><TD>{c.students}</TD><TD>{c.completed}</TD><TD><div className="flex items-center gap-3"><Progress value={c.avg_progress} /><span className="w-10 text-right text-xs">{c.avg_progress}%</span></div></TD></TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
