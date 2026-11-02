"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, MultiSelect, Select } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useBatchTypes, useCourseOptions, useStaffOptions } from "@/features/common/options";

type B = Schemas["BatchInput"];

export function BatchFormDialog({ open, onOpenChange, batch, mentors, courseId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; batch?: Schemas["Batch"]; mentors?: Schemas["Person"][]; courseId?: string; onSaved?: (d: Schemas["BatchDetail"]) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const types = useBatchTypes();
  const staff = useStaffOptions();
  const [f, setF] = React.useState<B>({ course_id: "", batch_type_id: "", name: "", start_date: "", end_date: "", capacity: 0, location: "", schedule_note: "", status: "upcoming", mentor_ids: [] });
  React.useEffect(() => {
    if (!open) return;
    setF({
      course_id: batch?.course_id ?? courseId ?? "", batch_type_id: batch?.batch_type_id ?? types.data?.[0]?.id ?? "", name: batch?.name ?? "", start_date: batch?.start_date ?? "",
      end_date: batch?.end_date ?? "", capacity: batch?.capacity ?? 0, location: batch?.location ?? "", schedule_note: batch?.schedule_note ?? "",
      status: (batch?.status as B["status"]) ?? "upcoming", mentor_ids: mentors?.map((m) => m.id) ?? [],
    });
  }, [open, batch, mentors, courseId, types.data]);
  const done = (d: Schemas["BatchDetail"]) => { onOpenChange(false); onSaved?.(d); };
  const create = $api.useMutation("post", "/api/v1/batches", feedback(qc, "Batch created", ["/api/v1/batches"], done));
  const update = $api.useMutation("put", "/api/v1/batches/{id}", feedback(qc, "Batch saved", ["/api/v1/batches"], done));
  const offline = types.data?.find((t) => t.id === f.batch_type_id)?.is_offline;
  const body = { ...f, start_date: f.start_date || undefined, end_date: f.end_date || undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{batch ? "Edit batch" : "New batch"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (batch) update.mutate({ params: { path: { id: batch.id } }, body }); else create.mutate({ body }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" required><Select required value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">Choose…</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            <Field label="Type" required hint="Manage types on the Batches page"><Select required value={f.batch_type_id} onChange={(e) => setF({ ...f, batch_type_id: e.target.value })}>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_offline ? " (offline)" : ""}</option>)}</Select></Field>
            <Field label="Batch name" required className="sm:col-span-2"><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Go — Jan 2027 Evening" /></Field>
            <Field label="Capacity" hint="0 = no limit"><Input type="number" min={0} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>
            <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as B["status"] })}><option value="upcoming">Upcoming</option><option value="running">Running</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
            {offline && <Field label="Location" className="sm:col-span-2"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Classroom address" /></Field>}
            <Field label="Mentors" className="sm:col-span-2"><MultiSelect value={f.mentor_ids ?? []} onChange={(v) => setF({ ...f, mentor_ids: v })} options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.email }))} placeholder="Choose mentors" /></Field>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={create.isPending || update.isPending}>{batch ? "Save" : "Create batch"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Small manager for batch types (Online, Offline, Weekend, Hybrid…). */
export function BatchTypesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const types = useBatchTypes();
  const [name, setName] = React.useState("");
  const [offline, setOffline] = React.useState(false);
  const [color, setColor] = React.useState("#6366f1");
  const paths = ["/api/v1/batch-types", "/api/v1/batches"];
  const create = $api.useMutation("post", "/api/v1/batch-types", feedback(qc, "Type added", paths, () => setName("")));
  const del = $api.useMutation("delete", "/api/v1/batch-types/{id}", feedback(qc, "Type deleted", paths));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Batch types</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {types.data?.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: t.color }} />
              <span className="flex-1 font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.is_offline ? "Offline · attendance" : "Online"} · {t.batch_count} batches</span>
              <Button variant="ghost" size="sm" disabled={t.batch_count > 0} onClick={() => del.mutate({ params: { path: { id: t.id } } })}>Delete</Button>
            </div>
          ))}
        </div>
        <form className="grid grid-cols-[1fr_auto_auto] items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ body: { name, is_offline: offline, color } }); }}>
          <Field label="New type"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend" /></Field>
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline</label>
          <div className="flex gap-2"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-12 p-1" /><Button type="submit" loading={create.isPending}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
