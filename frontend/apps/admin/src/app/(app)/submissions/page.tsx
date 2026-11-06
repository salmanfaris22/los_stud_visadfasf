"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, Tabs, TabsList, TabsTrigger, timeAgo } from "@lms/ui";
import { $api } from "@/lib/api";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";

const TABS = [
  { value: "pending", label: "Waiting" },
  { value: "resubmit", label: "Resubmit asked" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

function Queue() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = React.useState("pending");
  const [q, setQ] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const courses = useCourseOptions();
  const batches = useBatchOptions(courseId || undefined);
  const list = $api.useQuery("get", "/api/v1/submissions", {
    params: { query: { status: (status || undefined) as "pending" | undefined, q: q || undefined, course_id: courseId || undefined, batch_id: batchId || undefined, task_id: params.get("task_id") ?? undefined, page, per_page: 20 } },
  });
  return (
    <>
      <PageHeader title="Task reviews" description="Approve, reject or ask students to resubmit. Oldest waiting work first." />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <TabsList className="mb-4 flex-wrap">{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Student or task…" />
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId(""); setPage(1); }}><option value="">All courses</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
          <Select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }}><option value="">All batches</option>{batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </div>
        {list.isLoading ? <Skeleton className="h-72" /> : list.data?.items.length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title="Nothing here" description={status === "pending" ? "All caught up — no submissions waiting." : "No submissions match these filters."} />
        ) : (
          <Table>
            <THead><TR><TH>Student</TH><TH>Task</TH><TH>Course</TH><TH>Attempt</TH><TH>Status</TH><TH>Marks</TH><TH>Submitted</TH></TR></THead>
            <TBody>
              {list.data?.items.map((s) => (
                <TR key={s.id} className="cursor-pointer" onClick={() => router.push(`/submissions/${s.id}`)}>
                  <TD><div className="font-medium">{s.student_name}</div><div className="text-xs text-muted-foreground">{s.student_code}</div></TD>
                  <TD><div className="font-medium">{s.task_title}</div><div className="text-xs text-muted-foreground">{s.video_title}</div></TD>
                  <TD className="text-muted-foreground">{s.course_title}</TD>
                  <TD>#{s.attempt}</TD>
                  <TD><span className="flex items-center gap-1"><StatusBadge status={s.status} />{s.is_late && <Badge variant="destructive">Late</Badge>}</span></TD>
                  <TD>{s.marks ?? "—"}/{s.max_marks}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{timeAgo(s.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}

export default function SubmissionsPage() {
  return <React.Suspense><Queue /></React.Suspense>;
}
