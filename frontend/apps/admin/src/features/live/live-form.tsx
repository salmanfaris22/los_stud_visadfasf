"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type LiveDetail, type LiveSession, LiveService, StudentService, useRpcMutation, useRpcQuery, toTimestamp } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, MultiSelect, Select, Textarea, fromLocalInput, toLocalInput } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { useBatchOptions, useCourseOptions, useStaffOptions } from "@/features/common/options";

/** Schedule or edit a Google Meet session and choose who sees it (batches, courses, students). */
export function LiveFormDialog({ open, onOpenChange, session, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; session?: LiveSession; onSaved?: (d: LiveDetail) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const batches = useBatchOptions();
  const staff = useStaffOptions();
  const students = useRpcQuery(StudentService.method.listStudents, { perPage: 200 }, { enabled: open });
  const [f, setF] = React.useState({ title: "", description: "", meetUrl: "", start: "", end: "", hostId: "", status: "scheduled" });
  const [targets, setTargets] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!open) return;
    const start = session ? toLocalInput(session.startsAt) : "";
    setF({ title: session?.title ?? "", description: session?.description ?? "", meetUrl: session?.meetUrl ?? "", start, end: session ? toLocalInput(session.endsAt) : "", hostId: session?.hostId ?? "", status: session?.status ?? "scheduled" });
    setTargets(session?.targets.map((t) => `${t.type}:${t.id}`) ?? []);
  }, [open, session]);

  const options = [
    ...(batches.data ?? []).map((b) => ({ value: `batch:${b.id}`, label: b.name, hint: b.courseTitle, group: "Batches" })),
    ...(courses.data ?? []).map((c) => ({ value: `course:${c.id}`, label: c.title, hint: "everyone enrolled", group: "Courses" })),
    ...(students.data?.items ?? []).map((s) => ({ value: `student:${s.id}`, label: s.name, hint: s.email, group: "Students" })),
  ];
  const done = (r: { session?: LiveDetail }) => { onOpenChange(false); if (r.session) onSaved?.(r.session); };
  const create = useRpcMutation(LiveService.method.createLive, feedback(qc, "Session scheduled — students notified", [LiveService], done));
  const update = useRpcMutation(LiveService.method.updateLive, feedback(qc, "Session saved", [LiveService], done));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      title: f.title, description: f.description, meetUrl: f.meetUrl, startsAt: toTimestamp(fromLocalInput(f.start)), endsAt: toTimestamp(fromLocalInput(f.end)),
      hostId: f.hostId || undefined, status: f.status as "scheduled",
      targets: targets.map((t) => { const [type, id] = t.split(":"); return { type: type as "batch", id: id! }; }),
    };
    if (session) update.mutate({ id: session.id, input: body });
    else create.mutate({ input: body });
  };
  const setStart = (v: string) => {
    const next = { ...f, start: v };
    if (v && !f.end) next.end = toLocalInput(new Date(new Date(v).getTime() + 60 * 60000));
    setF(next);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{session ? "Edit live session" : "Schedule a live session"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Title" required><Input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Live: Building your first API" /></Field>
          <Field label="Google Meet link" required hint="Create the meeting in Google Calendar/Meet and paste the link here">
            <Input required type="url" pattern="https://.*" value={f.meetUrl} onChange={(e) => setF({ ...f, meetUrl: e.target.value })} placeholder="https://meet.google.com/abc-defg-hij" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" required><Input type="datetime-local" required value={f.start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Ends" required><Input type="datetime-local" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            <Field label="Host"><Select value={f.hostId} onChange={(e) => setF({ ...f, hostId: e.target.value })}><option value="">Me</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            {session && <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option></Select></Field>}
          </div>
          <Field label="Who can join?" required hint="Pick batches, whole courses and/or individual students" error={targets.length === 0 ? "Choose at least one" : null}>
            <MultiSelect value={targets} onChange={setTargets} options={options} placeholder="Choose batches, courses or students" />
          </Field>
          <Field label="Agenda"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!targets.length} loading={create.isPending || update.isPending}>{session ? "Save" : "Schedule & notify"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
