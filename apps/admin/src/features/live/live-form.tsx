"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, MultiSelect, Select, Textarea, fromLocalInput, toLocalInput } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useBatchOptions, useCourseOptions, useStaffOptions } from "@/features/common/options";

/** Schedule or edit a Google Meet session and choose who sees it (batches, courses, students). */
export function LiveFormDialog({ open, onOpenChange, session, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; session?: Schemas["LiveSession"]; onSaved?: (d: Schemas["LiveDetail"]) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const batches = useBatchOptions();
  const staff = useStaffOptions();
  const students = $api.useQuery("get", "/api/v1/students", { params: { query: { per_page: 200 } } }, { enabled: open });
  const [f, setF] = React.useState({ title: "", description: "", meet_url: "", start: "", end: "", host_id: "", status: "scheduled" });
  const [targets, setTargets] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!open) return;
    const start = session ? toLocalInput(session.starts_at) : "";
    setF({ title: session?.title ?? "", description: session?.description ?? "", meet_url: session?.meet_url ?? "", start, end: session ? toLocalInput(session.ends_at) : "", host_id: session?.host_id ?? "", status: session?.status ?? "scheduled" });
    setTargets(session?.targets.map((t) => `${t.type}:${t.id}`) ?? []);
  }, [open, session]);

  const options = [
    ...(batches.data ?? []).map((b) => ({ value: `batch:${b.id}`, label: b.name, hint: b.course_title, group: "Batches" })),
    ...(courses.data ?? []).map((c) => ({ value: `course:${c.id}`, label: c.title, hint: "everyone enrolled", group: "Courses" })),
    ...(students.data?.items ?? []).map((s) => ({ value: `student:${s.id}`, label: s.name, hint: s.email, group: "Students" })),
  ];
  const done = (d: Schemas["LiveDetail"]) => { onOpenChange(false); onSaved?.(d); };
  const create = $api.useMutation("post", "/api/v1/live", feedback(qc, "Session scheduled — students notified", ["/api/v1/live"], done));
  const update = $api.useMutation("put", "/api/v1/live/{id}", feedback(qc, "Session saved", ["/api/v1/live"], done));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      title: f.title, description: f.description, meet_url: f.meet_url, starts_at: fromLocalInput(f.start), ends_at: fromLocalInput(f.end),
      host_id: f.host_id || undefined, status: f.status as "scheduled",
      targets: targets.map((t) => { const [type, id] = t.split(":"); return { type: type as "batch", id: id! }; }),
    };
    if (session) update.mutate({ params: { path: { id: session.id } }, body });
    else create.mutate({ body });
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
            <Input required type="url" pattern="https://.*" value={f.meet_url} onChange={(e) => setF({ ...f, meet_url: e.target.value })} placeholder="https://meet.google.com/abc-defg-hij" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" required><Input type="datetime-local" required value={f.start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Ends" required><Input type="datetime-local" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            <Field label="Host"><Select value={f.host_id} onChange={(e) => setF({ ...f, host_id: e.target.value })}><option value="">Me</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
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
