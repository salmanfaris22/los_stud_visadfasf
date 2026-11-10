"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Batch, type BatchDetail, type BatchInput, type Person, BatchService, useRpcMutation, type Draft } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, MultiSelect, Select } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { useBatchTypes, useCourseOptions, useStaffOptions } from "@/features/common/options";

type B = Draft<BatchInput>;

export function BatchFormDialog({ open, onOpenChange, batch, mentors, courseId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; batch?: Batch; mentors?: Person[]; courseId?: string; onSaved?: (d: BatchDetail) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const types = useBatchTypes();
  const staff = useStaffOptions();
  const [f, setF] = React.useState<B>({ courseId: "", batchTypeId: "", name: "", startDate: "", endDate: "", capacity: 0, location: "", scheduleNote: "", status: "upcoming", mentorIds: [] });
  React.useEffect(() => {
    if (!open) return;
    setF({
      courseId: batch?.courseId ?? courseId ?? "", batchTypeId: batch?.batchTypeId ?? types.data?.[0]?.id ?? "", name: batch?.name ?? "", startDate: batch?.startDate ?? "",
      endDate: batch?.endDate ?? "", capacity: batch?.capacity ?? 0, location: batch?.location ?? "", scheduleNote: batch?.scheduleNote ?? "",
      status: (batch?.status as B["status"]) ?? "upcoming", mentorIds: mentors?.map((m) => m.id) ?? [],
    });
  }, [open, batch, mentors, courseId, types.data]);
  const done = (r: { batch?: BatchDetail }) => { onOpenChange(false); if (r.batch) onSaved?.(r.batch); };
  const create = useRpcMutation(BatchService.method.createBatch, feedback(qc, "Batch created", [BatchService], done));
  const update = useRpcMutation(BatchService.method.updateBatch, feedback(qc, "Batch saved", [BatchService], done));
  const offline = types.data?.find((t) => t.id === f.batchTypeId)?.isOffline;
  const body = { ...f, startDate: f.startDate || undefined, endDate: f.endDate || undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{batch ? "Edit batch" : "New batch"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (batch) update.mutate({ id: batch.id, input: body }); else create.mutate({ input: body }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" required><Select required value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">Choose…</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            <Field label="Type" required hint="Manage types on the Batches page"><Select required value={f.batchTypeId} onChange={(e) => setF({ ...f, batchTypeId: e.target.value })}>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isOffline ? " (offline)" : ""}</option>)}</Select></Field>
            <Field label="Batch name" required className="sm:col-span-2"><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Go — Jan 2027 Evening" /></Field>
            <Field label="Capacity" hint="0 = no limit"><Input type="number" min={0} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>
            <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as B["status"] })}><option value="upcoming">Upcoming</option><option value="running">Running</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
            {offline && <Field label="Location" className="sm:col-span-2"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Classroom address" /></Field>}
            <Field label="Mentors" className="sm:col-span-2"><MultiSelect value={f.mentorIds ?? []} onChange={(v) => setF({ ...f, mentorIds: v })} options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.email }))} placeholder="Choose mentors" /></Field>
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
  const [color, setColor] = React.useState("#1f6feb");
  const paths = [BatchService, BatchService];
  const create = useRpcMutation(BatchService.method.createBatchType, feedback(qc, "Type added", paths, () => setName("")));
  const del = useRpcMutation(BatchService.method.deleteBatchType, feedback(qc, "Type deleted", paths));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Batch types</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {types.data?.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: t.color }} />
              <span className="flex-1 font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.isOffline ? "Offline · attendance" : "Online"} · {t.batchCount} batches</span>
              <Button variant="ghost" size="sm" disabled={t.batchCount > 0} onClick={() => del.mutate({ id: t.id })}>Delete</Button>
            </div>
          ))}
        </div>
        <form className="grid grid-cols-[1fr_auto_auto] items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ input: { name, isOffline: offline, color } }); }}>
          <Field label="New type"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend" /></Field>
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline</label>
          <div className="flex gap-2"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-12 p-1" /><Button type="submit" loading={create.isPending}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
