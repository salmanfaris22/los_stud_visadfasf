"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Award, ArrowLeft, BookOpen, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, PageHeader, Progress, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, formatDate, timeAgo, useConfirm,
} from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";
import { StudentFormDialog } from "@/features/students/student-form";

function EnrollmentBatch({ enrollmentId, courseId, batchId, status }: { enrollmentId: string; courseId: string; batchId?: string | null; status: string }) {
  const qc = useQueryClient();
  const batches = useBatchOptions(courseId);
  const update = $api.useMutation("put", "/api/v1/enrollments/{id}", feedback(qc, "Enrollment updated", ["/api/v1/students"]));
  return (
    <div className="flex gap-2">
      <Select className="h-8 w-40 text-xs" value={batchId ?? ""} onChange={(e) => update.mutate({ params: { path: { id: enrollmentId } }, body: { batch_id: e.target.value || undefined, status: status as "active" } })}>
        <option value="">No batch</option>
        {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <Select className="h-8 w-32 text-xs" value={status} onChange={(e) => update.mutate({ params: { path: { id: enrollmentId } }, body: { batch_id: batchId ?? undefined, status: e.target.value as "active" } })}>
        <option value="active">Active</option><option value="completed">Completed</option><option value="suspended">Suspended</option>
      </Select>
    </div>
  );
}

function AssignCourseDialog({ studentId, open, onOpenChange }: { studentId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const courses = useCourseOptions();
  const batches = useBatchOptions(courseId || undefined);
  const enroll = $api.useMutation("post", "/api/v1/students/{id}/enrollments", feedback(qc, "Course assigned", ["/api/v1/students"], () => onOpenChange(false)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign a course</DialogTitle></DialogHeader>
        <Field label="Course"><Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId(""); }}><option value="">Choose…</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
        <Field label="Batch"><Select value={batchId} disabled={!courseId} onChange={(e) => setBatchId(e.target.value)}><option value="">No batch</option>{batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!courseId} loading={enroll.isPending} onClick={() => enroll.mutate({ params: { path: { id: studentId } }, body: { course_id: courseId, batch_id: batchId || undefined } })}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [editing, setEditing] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const q = $api.useQuery("get", "/api/v1/students/{id}", { params: { path: { id } } });
  const subs = $api.useQuery("get", "/api/v1/submissions", { params: { query: { student_id: id, per_page: 10 } } }, { enabled: can("submissions") });
  const remove = $api.useMutation("delete", "/api/v1/students/{id}", feedback(qc, "Student deleted", ["/api/v1/students"], () => router.replace("/students")));
  const unenroll = $api.useMutation("delete", "/api/v1/enrollments/{id}", feedback(qc, "Course removed", ["/api/v1/students"]));
  const issue = $api.useMutation("post", "/api/v1/certificates", feedback(qc, "Certificate issued", ["/api/v1/certificates", "/api/v1/students"]));

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Student not found" />;
  const { student: s, enrollments } = q.data;

  return (
    <>
      <PageHeader
        back={<Link href="/students" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Students</Link>}
        title={<span className="flex items-center gap-3"><Avatar src={s.avatar_url} name={s.name} className="size-11" />{s.name}</span>}
        description={<span className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-mono">{s.student_code}</span><span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{s.email}</span>{s.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{s.phone}</span>}<StatusBadge status={s.status} /></span>}
        actions={
          <>
            <Can module="students" action="edit"><Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button></Can>
            <Can module="students" action="delete">
              <Button variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${s.name}?`, description: "Their submissions, attendance and certificates are deleted too. This cannot be undone.", destructive: true, confirmText: "Delete" })) remove.mutate({ params: { path: { id } } }); }}><Trash2 /> Delete</Button>
            </Can>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Courses</CardTitle>
            <Can module="students" action="edit"><Button size="sm" onClick={() => setAssigning(true)}><Plus /> Assign course</Button></Can>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrollments.length === 0 && <EmptyState icon={<BookOpen />} title="No courses yet" description="Assign a course so the student can start learning." />}
            {enrollments.map((e) => (
              <div key={e.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{e.course_title}</div>
                    <div className="text-xs text-muted-foreground">Enrolled {formatDate(e.enrolled_at)}{e.batch_name && ` · ${e.batch_name}`}</div>
                  </div>
                  <Can module="students" action="edit">
                    <div className="flex items-center gap-2">
                      <EnrollmentBatch enrollmentId={e.id} courseId={e.course_id} batchId={e.batch_id} status={e.status} />
                      <Button variant="ghost" size="icon-sm" aria-label="Remove course" onClick={async () => { if (await confirm({ title: `Remove ${e.course_title}?`, description: "The student loses access. Their past submissions are kept.", destructive: true, confirmText: "Remove" })) unenroll.mutate({ params: { path: { id: e.id } } }); }}><Trash2 /></Button>
                    </div>
                  </Can>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={e.progress_pct} />
                  <span className="w-28 text-right text-xs text-muted-foreground">{e.approved_tasks}/{e.total_tasks} tasks · {e.progress_pct}%</span>
                </div>
                {e.progress_pct === 100 && can("certificates", "create") && (
                  <Button size="sm" variant="outline" className="mt-3" loading={issue.isPending} onClick={() => issue.mutate({ body: { student_id: s.id, course_id: e.course_id } })}><Award /> Issue certificate</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{formatDate(s.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Last sign in</span><span>{s.last_login_at ? timeAgo(s.last_login_at) : "Never"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Courses</span><span>{enrollments.length}</span></div>
            {q.data.bio && <p className="border-t pt-3 text-muted-foreground">{q.data.bio}</p>}
          </CardContent>
        </Card>
        {can("submissions") && (
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Recent submissions</CardTitle></CardHeader>
            <CardContent>
              {subs.data?.items.length === 0 ? <p className="text-sm text-muted-foreground">No submissions yet.</p> : (
                <Table>
                  <THead><TR><TH>Task</TH><TH>Course</TH><TH>Attempt</TH><TH>Status</TH><TH>Marks</TH><TH>Submitted</TH></TR></THead>
                  <TBody>
                    {subs.data?.items.map((x) => (
                      <TR key={x.id} className="cursor-pointer" onClick={() => router.push(`/submissions/${x.id}`)}>
                        <TD className="font-medium">{x.task_title}</TD><TD>{x.course_title}</TD><TD>#{x.attempt}</TD><TD><StatusBadge status={x.status} /></TD>
                        <TD>{x.marks ?? "—"}/{x.max_marks}</TD><TD className="text-muted-foreground">{timeAgo(x.created_at)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <StudentFormDialog open={editing} onOpenChange={setEditing} student={s} />
      <AssignCourseDialog studentId={s.id} open={assigning} onOpenChange={setAssigning} />
    </>
  );
}
