"use client";
import * as React from "react";
import { Award, Ban, Download, ExternalLink, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, formatDate, useConfirm } from "@lms/ui";
import { $api } from "@/lib/api";
import { download, feedback } from "@/lib/feedback";
import { Can } from "@/lib/session";
import { useCourseOptions } from "@/features/common/options";

function IssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const [courseId, setCourseId] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const students = $api.useQuery("get", "/api/v1/students", { params: { query: { course_id: courseId, per_page: 200 } } }, { enabled: !!courseId });
  const issue = $api.useMutation("post", "/api/v1/certificates", feedback(qc, "Certificate issued", ["/api/v1/certificates"], () => onOpenChange(false)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue a certificate</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Certificates are issued automatically when every task is approved. Use this for exceptions.</p>
        <Field label="Course"><Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setStudentId(""); }}><option value="">Choose…</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
        <Field label="Student"><Select value={studentId} disabled={!courseId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose…</option>{students.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.email}</option>)}</Select></Field>
        <DialogFooter><Button disabled={!studentId} loading={issue.isPending} onClick={() => issue.mutate({ body: { course_id: courseId, student_id: studentId } })}>Issue</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CertificatesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const courses = useCourseOptions();
  const [q, setQ] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [issuing, setIssuing] = React.useState(false);
  const list = $api.useQuery("get", "/api/v1/certificates", { params: { query: { q: q || undefined, course_id: courseId || undefined, page } } });
  const revoke = $api.useMutation("delete", "/api/v1/certificates/{id}", feedback(qc, "Certificate revoked", ["/api/v1/certificates"]));
  return (
    <>
      <PageHeader title="Certificates" description="Every certificate has a QR code and a public verification page." actions={<Can module="certificates" action="create"><Button onClick={() => setIssuing(true)}><Plus /> Issue</Button></Can>} />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Student or code…" />
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }}><option value="">All courses</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
        </div>
        {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<Award />} title="No certificates yet" description="They appear when students finish all tasks of a course." /> : (
          <Table>
            <THead><TR><TH>Code</TH><TH>Student</TH><TH>Course</TH><TH>Issued</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {list.data?.items.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-xs">{c.code}</TD>
                  <TD><div className="font-medium">{c.student_name}</div><div className="text-xs text-muted-foreground">{c.student_email}</div></TD>
                  <TD>{c.course_title}</TD>
                  <TD className="text-muted-foreground">{formatDate(c.issued_at)}</TD>
                  <TD><StatusBadge status={c.revoked_at ? "cancelled" : "active"} /></TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => download(`/api/v1/certificates/${c.id}/pdf`, `certificate-${c.code}.pdf`)} aria-label="Download PDF"><Download /></Button>
                    <Button variant="ghost" size="icon-sm" asChild><a href={c.verify_url} target="_blank" rel="noreferrer" aria-label="Verify page"><ExternalLink /></a></Button>
                    {!c.revoked_at && <Can module="certificates" action="delete"><Button variant="ghost" size="icon-sm" aria-label="Revoke" onClick={async () => { if (await confirm({ title: `Revoke ${c.code}?`, description: "The verification page will show it as revoked.", destructive: true, confirmText: "Revoke" })) revoke.mutate({ params: { path: { id: c.id } } }); }}><Ban /></Button></Can>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <IssueDialog open={issuing} onOpenChange={setIssuing} />
    </>
  );
}
