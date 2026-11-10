"use client";
import * as React from "react";
import { CalendarPlus, Check, QrCode, Trash2, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, type ClassQr, BatchService, useRpcMutation, useRpcQuery, toTimestamp } from "@lms/api-client";
import { Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Input, StatusBadge, cn, formatDateTime, fromLocalInput, toast, useConfirm, asDate } from "@lms/ui";
import { invalidate, rpc } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";

const STATUSES = ["present", "late", "absent", "excused"] as const;

function Roster({ classId, open, onOpenChange }: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const q = useRpcQuery(BatchService.method.getRoster, { classId }, { enabled: open, select: (r) => r.items });
  const [marks, setMarks] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.map((r) => [r.studentId, r.status]))); }, [q.data]);
  const save = useRpcMutation(BatchService.method.markAttendance, feedback(qc, "Attendance saved", [BatchService, BatchService], () => onOpenChange(false)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Attendance</DialogTitle></DialogHeader>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries((q.data ?? []).map((r) => [r.studentId, "present"])))}><Check /> Mark all present</Button></div>
        <div className="max-h-[55vh] divide-y overflow-y-auto rounded-lg border">
          {q.data?.map((r) => (
            <div key={r.studentId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.studentCode}{r.source === "qr" && " · checked in with QR"}</div></div>
              <div className="flex gap-1">
                {STATUSES.map((s) => (
                  <button key={s} type="button" onClick={() => setMarks({ ...marks, [r.studentId]: s })}
                    className={cn("rounded-md border px-2 py-1 text-xs capitalize transition", marks[r.studentId] === s ? "border-foreground bg-foreground text-background" : "hover:bg-accent")}>{s}</button>
                ))}
              </div>
            </div>
          ))}
          {q.data?.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No students in this batch yet.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate({ classId, input: { records: Object.entries(marks).filter(([, s]) => s).map(([studentId, status]) => ({ studentId, status: status as "present" })) } })}>Save attendance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QRDialog({ classId, open, onOpenChange }: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [qr, setQr] = React.useState<ClassQr | null>(null);
  const [left, setLeft] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    rpc(BatchService).startClassQr({ classId }).then((r) => setQr(r.qr ?? null)).catch((e) => toast.error(errorMessage(e)));
  }, [open, classId]);
  React.useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((asDate(qr.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [qr]);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQr(null); }}>
      <DialogContent className="text-center">
        <DialogHeader><DialogTitle>Scan to check in</DialogTitle></DialogHeader>
        {qr ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-white p-4"><QRCodeSVG value={qr.checkinUrl} size={260} /></div>
            <p className="text-sm text-muted-foreground">Students scan with their phone camera and sign in. Arrivals after 15 minutes are marked late.</p>
            <p className={cn("font-mono text-2xl font-bold", left < 60 && "text-destructive")}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>
          </div>
        ) : <p className="py-10 text-sm text-muted-foreground">Generating code…</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Offline class sessions of a batch with attendance and QR check-in. */
export function Classes({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const q = useRpcQuery(BatchService.method.listClasses, { batchId }, { select: (r) => r.items });
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", start: "", end: "" });
  const [roster, setRoster] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const path = BatchService;
  const create = useRpcMutation(BatchService.method.createClass, feedback(qc, "Class scheduled", [path], () => setAdding(false)));
  const del = useRpcMutation(BatchService.method.deleteClass, feedback(qc, "Class deleted", [path]));
  return (
    <div className="space-y-3">
      {can("attendance", "create") && <Button onClick={() => { setForm({ title: "", start: "", end: "" }); setAdding(true); }}><CalendarPlus /> Schedule class</Button>}
      {q.data?.length === 0 && <EmptyState icon={<CalendarPlus />} title="No classes yet" description="Schedule classroom sessions, then mark attendance or let students scan a QR code." />}
      {q.data?.map((c) => (
        <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{c.title}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(c.startsAt)} – {asDate(c.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Users className="size-4" />{c.presentCount} present</span>
          {c.qrActive && <StatusBadge status="running" />}
          {can("attendance", "edit") && <Button size="sm" variant="outline" onClick={() => setQr(c.id)}><QrCode /> QR check-in</Button>}
          {can("attendance", "edit") && <Button size="sm" onClick={() => setRoster(c.id)}>Mark attendance</Button>}
          {can("attendance", "delete") && <Button size="icon-sm" variant="ghost" aria-label="Delete class" onClick={async () => { if (await confirm({ title: `Delete “${c.title}”?`, description: "Its attendance marks are deleted.", destructive: true, confirmText: "Delete" })) del.mutate({ id: c.id }); }}><Trash2 /></Button>}
        </Card>
      ))}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule a class</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate({ batchId, input: { title: form.title, startsAt: toTimestamp(fromLocalInput(form.start)), endsAt: toTimestamp(fromLocalInput(form.end)) } }); }}>
            <Field label="Title" required><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Week 3 · Databases" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" required><Input type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
              <Field label="Ends" required><Input type="datetime-local" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button type="submit" loading={create.isPending}>Schedule</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {roster && <Roster classId={roster} open onOpenChange={(o) => { if (!o) { setRoster(null); void invalidate(qc, path); } }} />}
      {qr && <QRDialog classId={qr} open onOpenChange={(o) => { if (!o) { setQr(null); void invalidate(qc, path); } }} />}
    </div>
  );
}
