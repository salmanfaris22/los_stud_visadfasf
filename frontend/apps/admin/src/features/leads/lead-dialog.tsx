"use client";
import * as React from "react";
import { CalendarClock, Check, Mail, MessageSquare, Phone, PhoneCall, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LeadService, PipelineService, toTimestamp, useRpcMutation, useRpcQuery, type Draft, type LeadUpdate, type Stage } from "@lms/api-client";
import {
  Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Field, Input, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
  Textarea, cn, formatDateTime, fromLocalInput, timeAgo, useConfirm,
} from "@lms/ui";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { useCourseOptions } from "@/features/common/options";

/** A small coloured dot + stage name. */
export function StageBadge({ name, color }: { name: string; color: string }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: color || "var(--muted-foreground)" }} />
      {name}
    </span>
  );
}

const ACTIVITY: Record<string, string> = {
  created: "Lead created", note: "Note", call: "Call", stage: "Stage changed", assigned: "Assigned", follow_up: "Follow-up", follow_up_done: "Follow-up done",
  updated: "Details updated", whatsapp: "WhatsApp", imported: "Imported", duplicate: "Came in again",
};

/** One lead: details, stage, owner, notes, calls, follow-ups and the activity timeline. */
export function LeadDialog({ leadId, onClose, stages }: { leadId: string | null; onClose: () => void; stages: Stage[] }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const editable = can("leads", "edit");
  const q = useRpcQuery(LeadService.method.getLead, { id: leadId ?? "" }, { enabled: !!leadId, select: (r) => r.lead });
  const counsellors = useRpcQuery(PipelineService.method.listCounsellors, {}, { enabled: !!leadId, select: (r) => r.items });
  const reasons = useRpcQuery(PipelineService.method.listLostReasons, {}, { enabled: !!leadId, select: (r) => r.items });
  const courses = useCourseOptions();
  const refresh = [LeadService, PipelineService];

  const [details, setDetails] = React.useState<Draft<LeadUpdate> | null>(null);
  const [stage, setStage] = React.useState({ stageId: "", lostReason: "", note: "" });
  const [note, setNote] = React.useState("");
  const [call, setCall] = React.useState({ direction: "outgoing", minutes: 0, note: "" });
  const [follow, setFollow] = React.useState({ due: "", note: "" });

  const lead = q.data?.lead;
  React.useEffect(() => {
    if (!lead) return;
    setDetails({ name: lead.name, email: lead.email, phone: lead.phone, city: lead.city, source: lead.source, courseId: lead.courseId ?? "", message: lead.message });
    setStage({ stageId: lead.stageId ?? "", lostReason: lead.lostReason, note: "" });
  }, [lead]);

  const save = useRpcMutation(LeadService.method.updateLead, feedback(qc, "Lead saved", refresh));
  const move = useRpcMutation(LeadService.method.setLeadStage, feedback(qc, "Stage changed", refresh, () => setStage((s) => ({ ...s, note: "" }))));
  const assign = useRpcMutation(LeadService.method.assignLead, feedback(qc, "Owner changed", refresh));
  const addNote = useRpcMutation(LeadService.method.addLeadNote, feedback(qc, "Note added", refresh, () => setNote("")));
  const logCall = useRpcMutation(LeadService.method.logLeadCall, feedback(qc, "Call logged", refresh, () => setCall({ direction: "outgoing", minutes: 0, note: "" })));
  const addFollow = useRpcMutation(LeadService.method.addFollowUp, feedback(qc, "Follow-up scheduled", refresh, () => setFollow({ due: "", note: "" })));
  const doneFollow = useRpcMutation(LeadService.method.completeFollowUp, feedback(qc, "Follow-up done", refresh));
  const delFollow = useRpcMutation(LeadService.method.deleteFollowUp, feedback(qc, "Follow-up deleted", refresh));

  const target = stages.find((s) => s.id === stage.stageId);
  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        {q.isLoading || !lead || !details ? (
          q.isLoading ? <Skeleton className="h-96" /> : <EmptyState title="Lead not found" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-3">
                {lead.name} <StageBadge name={lead.stageName} color={lead.stageColor} />
                {lead.source && <Badge variant="outline" className="capitalize">{lead.source.replace(/_/g, " ")}</Badge>}
              </DialogTitle>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-primary"><Phone className="size-4" />{lead.phone}</a>}
                {lead.whatsappId && <a href={`https://wa.me/${lead.whatsappId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary"><MessageSquare className="size-4" />WhatsApp</a>}
                {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-primary"><Mail className="size-4" />{lead.email}</a>}
                <span className="text-muted-foreground">Added {timeAgo(lead.createdAt)}{lead.ownerName && ` · Owner: ${lead.ownerName}`}</span>
              </div>
            </DialogHeader>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Tabs defaultValue="activity" className="min-w-0">
                <TabsList>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="follow">Follow-ups ({q.data?.followUps.filter((f) => !f.doneAt).length ?? 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="space-y-4 pt-3">
                  {editable && (
                    <div className="grid gap-2 rounded-xl border p-3">
                      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
                      <div className="flex justify-end"><Button size="sm" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate({ id: lead.id, input: { body: note } })}>Add note</Button></div>
                    </div>
                  )}
                  {editable && (
                    <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[140px_110px_1fr_auto] sm:items-end">
                      <Field label="Call"><Select value={call.direction} onChange={(e) => setCall({ ...call, direction: e.target.value })}><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option><option value="missed">Missed</option></Select></Field>
                      <Field label="Minutes"><Input type="number" min={0} value={call.minutes} onChange={(e) => setCall({ ...call, minutes: Number(e.target.value) })} /></Field>
                      <Field label="Call note"><Input value={call.note} onChange={(e) => setCall({ ...call, note: e.target.value })} placeholder="What was discussed" /></Field>
                      <Button size="sm" variant="outline" loading={logCall.isPending} onClick={() => logCall.mutate({ id: lead.id, input: { phone: lead.phone, direction: call.direction, durationSeconds: Math.round(call.minutes * 60), note: call.note } })}><PhoneCall /> Log</Button>
                    </div>
                  )}
                  <ol className="space-y-3">
                    {q.data?.activities.map((a) => (
                      <li key={a.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{ACTIVITY[a.kind] ?? a.kind}</span>
                          <span className="text-muted-foreground"> · {a.actorName || "System"} · {timeAgo(a.createdAt)}</span>
                          {a.body && <span className="mt-0.5 block whitespace-pre-wrap">{a.body}</span>}
                        </span>
                      </li>
                    ))}
                    {q.data?.activities.length === 0 && <li className="text-sm text-muted-foreground">No activity yet.</li>}
                  </ol>
                </TabsContent>

                <TabsContent value="details" className="pt-3">
                  <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: lead.id, input: details }); }}>
                    <Field label="Name" required><Input required value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></Field>
                    <Field label="Phone"><Input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} /></Field>
                    <Field label="Email"><Input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} /></Field>
                    <Field label="City"><Input value={details.city} onChange={(e) => setDetails({ ...details, city: e.target.value })} /></Field>
                    <Field label="Source"><Input value={details.source} onChange={(e) => setDetails({ ...details, source: e.target.value })} /></Field>
                    <Field label="Course">
                      <Select value={details.courseId ?? ""} onChange={(e) => setDetails({ ...details, courseId: e.target.value })}>
                        <option value="">Not decided</option>
                        {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </Select>
                    </Field>
                    <Field label="Message" className="sm:col-span-2"><Textarea rows={3} value={details.message} onChange={(e) => setDetails({ ...details, message: e.target.value })} /></Field>
                    {editable && <Button type="submit" className="w-fit" loading={save.isPending}>Save details</Button>}
                  </form>
                </TabsContent>

                <TabsContent value="follow" className="space-y-3 pt-3">
                  {editable && (
                    <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                      <Field label="When"><Input type="datetime-local" value={follow.due} onChange={(e) => setFollow({ ...follow, due: e.target.value })} /></Field>
                      <Field label="Note"><Input value={follow.note} onChange={(e) => setFollow({ ...follow, note: e.target.value })} placeholder="Call back about fees" /></Field>
                      <Button size="sm" variant="outline" disabled={!follow.due} loading={addFollow.isPending} onClick={() => addFollow.mutate({ id: lead.id, input: { dueAt: toTimestamp(fromLocalInput(follow.due)), note: follow.note } })}><CalendarClock /> Schedule</Button>
                    </div>
                  )}
                  {q.data?.followUps.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups.</p>}
                  {q.data?.followUps.map((f) => (
                    <div key={f.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", f.doneAt && "opacity-60")}>
                      <CalendarClock className={cn("size-4", f.overdue && !f.doneAt ? "text-destructive" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1"><span className="font-medium">{formatDateTime(f.dueAt)}</span>{f.note && <span className="text-muted-foreground"> · {f.note}</span>}{f.doneAt && <span className="text-success"> · done</span>}</span>
                      {editable && !f.doneAt && <Button size="icon-sm" variant="ghost" aria-label="Mark done" onClick={() => doneFollow.mutate({ id: f.id })}><Check /></Button>}
                      {editable && <Button size="icon-sm" variant="ghost" aria-label="Delete follow-up" onClick={async () => { if (await confirm({ title: "Delete this follow-up?", destructive: true, confirmText: "Delete" })) delFollow.mutate({ id: f.id }); }}><Trash2 /></Button>}
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <aside className="space-y-4">
                <div className="grid gap-2 rounded-xl border p-3">
                  <Field label="Stage">
                    <Select value={stage.stageId} disabled={!editable} onChange={(e) => setStage({ ...stage, stageId: e.target.value })}>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  {target?.kind === "lost" && (
                    <Field label="Lost reason">
                      <Select value={stage.lostReason} onChange={(e) => setStage({ ...stage, lostReason: e.target.value })}>
                        <option value="">Pick a reason</option>
                        {reasons.data?.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
                      </Select>
                    </Field>
                  )}
                  <Field label="Note (optional)"><Input value={stage.note} onChange={(e) => setStage({ ...stage, note: e.target.value })} /></Field>
                  {editable && <Button size="sm" disabled={!stage.stageId || stage.stageId === lead.stageId} loading={move.isPending} onClick={() => move.mutate({ id: lead.id, input: stage })}>Move to stage</Button>}
                </div>
                <div className="grid gap-2 rounded-xl border p-3">
                  <Field label="Owner (counsellor)">
                    <Select value={lead.ownerId ?? ""} disabled={!editable || assign.isPending} onChange={(e) => assign.mutate({ id: lead.id, input: { ownerId: e.target.value } })}>
                      <option value="">Unassigned (queue)</option>
                      {counsellors.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.teamName && ` · ${c.teamName}`}</option>)}
                    </Select>
                  </Field>
                  {lead.nextFollowUpAt && <p className="text-xs text-muted-foreground">Next follow-up {formatDateTime(lead.nextFollowUpAt)}</p>}
                  {lead.slaDueAt && !lead.firstContactedAt && <p className="text-xs text-warning">First contact due {timeAgo(lead.slaDueAt)}</p>}
                </div>
                {lead.message && <div className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{lead.message}</div>}
              </aside>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
