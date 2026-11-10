"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type Student, type StudentDetail, StudentService, useRpcMutation } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";

type Row = { courseId: string; batchId: string };

function EnrollRow({ row, onChange, onRemove }: { row: Row; onChange: (r: Row) => void; onRemove: () => void }) {
  const courses = useCourseOptions();
  const batches = useBatchOptions(row.courseId || undefined);
  return (
    <div className="flex gap-2">
      <Select value={row.courseId} onChange={(e) => onChange({ courseId: e.target.value, batchId: "" })} required>
        <option value="">Choose course…</option>
        {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </Select>
      <Select value={row.batchId} onChange={(e) => onChange({ ...row, batchId: e.target.value })} disabled={!row.courseId}>
        <option value="">No batch</option>
        {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove course"><Trash2 /></Button>
    </div>
  );
}

/** Create or edit a student. On create, courses (and batches) can be assigned right away. */
export function StudentFormDialog({ open, onOpenChange, student, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; student?: Student; onSaved?: (s: StudentDetail) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", password: "", status: "active" });
  const [rows, setRows] = React.useState<Row[]>([]);
  React.useEffect(() => {
    if (open) {
      setForm({ name: student?.name ?? "", email: student?.email ?? "", phone: student?.phone ?? "", password: "", status: student?.status ?? "active" });
      setRows(student ? [] : [{ courseId: "", batchId: "" }]);
    }
  }, [open, student]);
  const done = (r: { student?: StudentDetail }) => { onOpenChange(false); if (r.student) onSaved?.(r.student); };
  const create = useRpcMutation(StudentService.method.createStudent, feedback(qc, "Student created", [StudentService], done));
  const update = useRpcMutation(StudentService.method.updateStudent, feedback(qc, "Student updated", [StudentService], done));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: form.name, email: form.email, phone: form.phone || undefined, password: form.password || undefined, status: form.status as "active" | "disabled" };
    if (student) update.mutate({ id: student.id, input: body });
    else create.mutate({ input: { ...body, enrollments: rows.filter((r) => r.courseId).map((r) => ({ courseId: r.courseId, batchId: r.batchId || undefined })) } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{student ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><Input required minLength={2} value={form.name} onChange={set("name")} /></Field>
            <Field label="Email" required><Input type="email" required value={form.email} onChange={set("email")} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+91…" /></Field>
            <Field label="Password" hint={student ? "Leave empty to keep the current password" : "Leave empty to email an invite link"}>
              <Input type="password" minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
            {student && (
              <Field label="Status"><Select value={form.status} onChange={set("status")}><option value="active">Active</option><option value="disabled">Disabled (cannot sign in)</option></Select></Field>
            )}
          </div>
          {!student && (
            <Field label="Assign courses" hint="Students only see courses you assign to them.">
              <div className="grid gap-2">
                {rows.map((r, i) => (
                  <EnrollRow key={i} row={r} onChange={(nr) => setRows(rows.map((x, j) => (j === i ? nr : x)))} onRemove={() => setRows(rows.filter((_, j) => j !== i))} />
                ))}
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, { courseId: "", batchId: "" }])}><Plus /> Add course</Button>
              </div>
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>{student ? "Save changes" : "Create student"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
