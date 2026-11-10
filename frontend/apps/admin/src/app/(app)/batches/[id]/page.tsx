"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, MultiSelect, PageHeader,
  Progress, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, Tabs, TabsContent, TabsList, TabsTrigger, useConfirm,
} from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { BatchFormDialog } from "@/features/batches/batch-form";
import { Classes } from "@/features/batches/classes";
import { BatchService, StudentService, useRpcMutation, useRpcQuery } from "@lms/api-client";

function AddStudents({ batchId, open, onOpenChange }: { batchId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [ids, setIds] = React.useState<string[]>([]);
  const students = useRpcQuery(StudentService.method.listStudents, { perPage: 200 }, { enabled: open });
  const add = useRpcMutation(BatchService.method.addBatchStudents, feedback(qc, "Students added", [BatchService, StudentService], () => { setIds([]); onOpenChange(false); }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add students to this batch</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">They are enrolled in the batch's course (or moved into this batch if already enrolled).</p>
        <MultiSelect value={ids} onChange={setIds} options={(students.data?.items ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.email }))} placeholder="Choose students" />
        <DialogFooter><Button disabled={!ids.length} loading={add.isPending} onClick={() => add.mutate({ id: batchId, studentIds: ids })}>Add {ids.length || ""} students</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const q = useRpcQuery(BatchService.method.getBatch, { id }, { select: (r) => r.batch });
  const del = useRpcMutation(BatchService.method.deleteBatch, feedback(qc, "Batch deleted", [BatchService], () => router.replace("/batches")));
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data?.batch) return <EmptyState title="Batch not found" />;
  const b = q.data.batch;
  const { mentors, students } = q.data;
  return (
    <>
      <PageHeader
        back={<Link href="/batches" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Batches</Link>}
        title={b.name}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: b.typeColor }} />{b.typeName}</span><Link href={`/courses/${b.courseId}`} className="hover:underline">{b.courseTitle}</Link><StatusBadge status={b.status} /></span>}
        actions={<>
          <Can module="batches" action="edit"><Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button></Can>
          <Can module="batches" action="delete"><Button variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete ${b.name}?`, description: "Students stay enrolled in the course but leave this batch.", destructive: true, confirmText: "Delete" })) del.mutate({ id }); }}><Trash2 /> Delete</Button></Can>
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4 text-sm"><div className="text-muted-foreground">Dates</div><div className="mt-1 flex items-center gap-2 font-medium"><CalendarDays className="size-4" />{b.startDate || "—"} → {b.endDate || "—"}</div><div className="mt-1 text-xs text-muted-foreground">{b.scheduleNote}</div></Card>
        <Card className="p-4 text-sm"><div className="text-muted-foreground">Students</div><div className="mt-1 flex items-center gap-2 font-medium"><Users className="size-4" />{students.length}{b.capacity ? ` of ${b.capacity}` : ""}</div>{b.location && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{b.location}</div>}</Card>
        <Card className="p-4 text-sm"><div className="text-muted-foreground">Mentors</div><div className="mt-2 flex flex-wrap gap-2">{mentors.length ? mentors.map((m) => <span key={m.id} className="inline-flex items-center gap-1.5"><Avatar name={m.name} src={m.avatarUrl} className="size-6" />{m.name}</span>) : "None"}</div></Card>
      </div>
      <Tabs defaultValue="students">
        <TabsList><TabsTrigger value="students">Students</TabsTrigger>{(b.isOffline && can("attendance")) && <TabsTrigger value="classes">Classes & attendance</TabsTrigger>}</TabsList>
        <TabsContent value="students">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Students & progress</CardTitle><Can module="students" action="edit"><Button size="sm" onClick={() => setAdding(true)}><UserPlus /> Add students</Button></Can></CardHeader>
            <CardContent>
              {students.length === 0 ? <EmptyState icon={<Users />} title="No students yet" /> : (
                <Table>
                  <THead><TR><TH>Student</TH><TH>Code</TH><TH>Status</TH><TH className="w-1/3">Progress</TH></TR></THead>
                  <TBody>
                    {students.map((s) => (
                      <TR key={s.id} className="cursor-pointer" onClick={() => router.push(`/students/${s.id}`)}>
                        <TD><span className="flex items-center gap-2"><Avatar src={s.avatarUrl} name={s.name} className="size-7" /><span><span className="block font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{s.email}</span></span></span></TD>
                        <TD className="font-mono text-xs">{s.studentCode}</TD>
                        <TD><StatusBadge status={s.enrollmentStatus} /></TD>
                        <TD><div className="flex items-center gap-3"><Progress value={s.progressPct} /><span className="w-20 text-right text-xs text-muted-foreground">{s.approvedTasks}/{s.totalTasks}</span></div></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="classes"><Classes batchId={id} /></TabsContent>
      </Tabs>
      <BatchFormDialog open={editing} onOpenChange={setEditing} batch={b} mentors={mentors} />
      <AddStudents batchId={id} open={adding} onOpenChange={setAdding} />
    </>
  );
}
