"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Upload, Users } from "lucide-react";
import { Avatar, Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, formatDate, timeAgo } from "@lms/ui";
import { $api } from "@/lib/api";
import { download } from "@/lib/feedback";
import { Can } from "@/lib/session";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";
import { ImportStudentsDialog } from "@/features/students/import-dialog";
import { StudentFormDialog } from "@/features/students/student-form";

export default function StudentsPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const courses = useCourseOptions();
  const batches = useBatchOptions(courseId || undefined);
  const list = $api.useQuery("get", "/api/v1/students", {
    params: { query: { q: q || undefined, course_id: courseId || undefined, batch_id: batchId || undefined, status: (status || undefined) as "active" | undefined, page, per_page: 20 } },
  });

  return (
    <>
      <PageHeader
        title="Students"
        description="Create students, assign courses and track their progress."
        actions={
          <>
            <Button variant="outline" onClick={() => download("/api/v1/students/export", "students.csv")}><Download /> Export</Button>
            <Can module="students" action="create">
              <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import CSV</Button>
              <Button onClick={() => setCreating(true)}><Plus /> Add student</Button>
            </Can>
          </>
        }
      />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or code…" />
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId(""); setPage(1); }}>
            <option value="">All courses</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
          <Select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }}>
            <option value="">All batches</option>
            {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any status</option><option value="active">Active</option><option value="disabled">Disabled</option>
          </Select>
        </div>
        {list.isLoading ? <Skeleton className="h-72" /> : list.data?.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No students found" description="Try another filter or add your first student." />
        ) : (
          <Table>
            <THead><TR><TH>Student</TH><TH>Code</TH><TH>Courses</TH><TH>Status</TH><TH>Last seen</TH><TH>Joined</TH></TR></THead>
            <TBody>
              {list.data?.items.map((s) => (
                <TR key={s.id} className="cursor-pointer" onClick={() => router.push(`/students/${s.id}`)}>
                  <TD>
                    <Link href={`/students/${s.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <Avatar src={s.avatar_url} name={s.name} className="size-8" />
                      <span className="min-w-0"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs">{s.student_code}</TD>
                  <TD>{s.course_count}</TD>
                  <TD><StatusBadge status={s.status} /></TD>
                  <TD className="text-muted-foreground">{s.last_login_at ? timeAgo(s.last_login_at) : "Never"}</TD>
                  <TD className="text-muted-foreground">{formatDate(s.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <StudentFormDialog open={creating} onOpenChange={setCreating} onSaved={(d) => router.push(`/students/${d.student.id}`)} />
      <ImportStudentsDialog open={importing} onOpenChange={setImporting} />
    </>
  );
}
