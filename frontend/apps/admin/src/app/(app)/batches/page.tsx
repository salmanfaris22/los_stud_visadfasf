"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, UsersRound } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table } from "@lms/ui";
import { $api } from "@/lib/api";
import { Can } from "@/lib/session";
import { useCourseOptions } from "@/features/common/options";
import { BatchFormDialog, BatchTypesDialog } from "@/features/batches/batch-form";

export default function BatchesPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [types, setTypes] = React.useState(false);
  const courses = useCourseOptions();
  const list = $api.useQuery("get", "/api/v1/batches", { params: { query: { q: q || undefined, course_id: courseId || undefined, status: (status || undefined) as "running" | undefined, page, per_page: 20 } } });
  return (
    <>
      <PageHeader title="Batches" description="Online and offline groups of students with their own mentors and schedule."
        actions={<Can module="batches" action="create"><Button variant="outline" onClick={() => setTypes(true)}><Settings2 /> Batch types</Button><Button onClick={() => setCreating(true)}><Plus /> New batch</Button></Can>} />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search batches…" />
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }}><option value="">All courses</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option value="upcoming">Upcoming</option><option value="running">Running</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>
        </div>
        {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<UsersRound />} title="No batches" description="Create a batch to group students and plan classes." /> : (
          <Table>
            <THead><TR><TH>Batch</TH><TH>Course</TH><TH>Type</TH><TH>Dates</TH><TH>Students</TH><TH>Status</TH></TR></THead>
            <TBody>
              {list.data?.items.map((b) => (
                <TR key={b.id} className="cursor-pointer" onClick={() => router.push(`/batches/${b.id}`)}>
                  <TD className="font-medium">{b.name}</TD>
                  <TD className="text-muted-foreground">{b.course_title}</TD>
                  <TD><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: b.type_color }} />{b.type_name}</span></TD>
                  <TD className="text-muted-foreground">{b.start_date || "—"} → {b.end_date || "—"}</TD>
                  <TD>{b.student_count}{b.capacity ? ` / ${b.capacity}` : ""}</TD>
                  <TD><StatusBadge status={b.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <BatchFormDialog open={creating} onOpenChange={setCreating} onSaved={(d) => router.push(`/batches/${d.batch.id}`)} />
      <BatchTypesDialog open={types} onOpenChange={setTypes} />
    </>
  );
}
