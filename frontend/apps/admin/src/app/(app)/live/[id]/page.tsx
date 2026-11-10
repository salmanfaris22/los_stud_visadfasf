"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, CheckCircle2, Download, ExternalLink, Film, Pencil, RefreshCw, Trash2, Video, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type SyncResult, type SyncStep, LiveService, useRpcMutation, useRpcQuery } from "@lms/api-client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Skeleton, StatusBadge, Switch, TBody, TD, TH, THead, TR, Table, cn, formatDateTime, formatTime, timeAgo, useConfirm, asDate } from "@lms/ui";

import { rpc } from "@/lib/api";
import { download, feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { LiveFormDialog } from "@/features/live/live-form";

function StepResult({ label, step }: { label: string; step?: SyncStep }) {
  if (!step?.ran) return null;
  return (
    <div className={cn("flex items-start gap-2 rounded-lg p-2.5 text-sm", step.ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
      {step.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
      <span><b>{label}:</b> {step.message}</span>
    </div>
  );
}

export default function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [editing, setEditing] = React.useState(false);
  const [sync, setSync] = React.useState({ calendar: true, attendance: true, recording: true });
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const [recording, setRecording] = React.useState("");
  const [marks, setMarks] = React.useState<Record<string, boolean>>({});
  const q = useRpcQuery(LiveService.method.getLive, { id }, { select: (r) => r.session });
  React.useEffect(() => {
    if (!q.data) return;
    setRecording(q.data.session?.recordingUrl ?? "");
    setMarks(Object.fromEntries(q.data.roster.map((r) => [r.studentId, r.present])));
  }, [q.data]);
  const paths = [LiveService];
  const runSync = useRpcMutation(LiveService.method.syncLive, feedback(qc, null, paths, (r) => setResult(r.result ?? null)));
  const saveRec = useRpcMutation(LiveService.method.setLiveRecording, feedback(qc, "Recording saved — students notified", paths));
  const saveAtt = useRpcMutation(LiveService.method.markLiveAttendance, feedback(qc, "Attendance saved", paths));
  const del = useRpcMutation(LiveService.method.deleteLive, feedback(qc, "Session deleted", paths, () => router.replace("/live")));

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data?.session) return <EmptyState title="Session not found" />;
  const { session: s, roster } = q.data;
  const started = asDate(s.startsAt).getTime() <= Date.now();
  const present = Object.values(marks).filter(Boolean).length;

  return (
    <>
      <PageHeader
        back={<Link href="/live" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Live sessions</Link>}
        title={s.title}
        description={<span className="flex flex-wrap items-center gap-2">{formatDateTime(s.startsAt)} – {formatTime(s.endsAt)} · Host: {s.hostName || "—"} <StatusBadge status={s.status} /></span>}
        actions={<>
          <Button variant="outline" asChild><a href={s.meetUrl} target="_blank" rel="noreferrer"><Video /> Open Meet</a></Button>
          <Button variant="outline" onClick={() => download(() => rpc(LiveService).getLiveIcs({ id }), "session.ics")}><Download /> .ics</Button>
          <Button variant="outline" asChild><a href={s.googleCalendarUrl} target="_blank" rel="noreferrer"><CalendarPlus /> Google Calendar</a></Button>
          <Can module="live" action="edit"><Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button></Can>
          <Can module="live" action="delete"><Button variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: "Delete this session?", description: "Attendance is deleted and the calendar event is cancelled.", destructive: true, confirmText: "Delete" })) del.mutate({ id }); }}><Trash2 /></Button></Can>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Attendance</CardTitle><p className="mt-1 text-sm text-muted-foreground">{present} of {roster.length} present</p></div>
            {can("live", "edit") && <Button size="sm" loading={saveAtt.isPending} onClick={() => saveAtt.mutate({ id, input: { records: Object.entries(marks).map(([studentId, p]) => ({ studentId, present: p })) } })}>Save attendance</Button>}
          </CardHeader>
          <CardContent>
            {roster.length === 0 ? <EmptyState title="Nobody targeted" description="Edit the session to add batches, courses or students." /> : (
              <Table>
                <THead><TR><TH className="w-10" /><TH>Student</TH><TH>Source</TH><TH>Joined</TH><TH>Time in call</TH></TR></THead>
                <TBody>
                  {roster.map((r) => (
                    <TR key={r.studentId}>
                      <TD><Checkbox checked={!!marks[r.studentId]} disabled={!can("live", "edit")} onCheckedChange={(v) => setMarks({ ...marks, [r.studentId]: !!v })} aria-label={`Mark ${r.name} present`} /></TD>
                      <TD><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TD>
                      <TD>{r.marked ? <Badge variant="secondary" className="capitalize">{r.source === "join" ? "Join button" : r.source === "meet" ? "Google Meet" : "Manual"}</Badge> : "—"}</TD>
                      <TD className="text-muted-foreground">{r.joinedAt ? timeAgo(r.joinedAt) : "—"}</TD>
                      <TD className="text-muted-foreground">{r.durationSeconds ? `${Math.round(r.durationSeconds / 60)} min` : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          {can("live", "edit") && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="size-4" /> Sync with Google</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center justify-between text-sm"><span>Calendar event + email invites</span><Switch checked={sync.calendar} onCheckedChange={(v) => setSync({ ...sync, calendar: v })} /></label>
                <label className="flex items-center justify-between text-sm"><span>Meet attendance {!started && <span className="text-xs text-muted-foreground">(after start)</span>}</span><Switch checked={sync.attendance} onCheckedChange={(v) => setSync({ ...sync, attendance: v })} /></label>
                <label className="flex items-center justify-between text-sm"><span>Recording from Drive</span><Switch checked={sync.recording} onCheckedChange={(v) => setSync({ ...sync, recording: v })} /></label>
                <Button className="w-full" loading={runSync.isPending} onClick={() => runSync.mutate({ id, input: sync })}><RefreshCw /> Sync now</Button>
                {s.lastSyncedAt && <p className="text-xs text-muted-foreground">Last synced {timeAgo(s.lastSyncedAt)}{s.calendarSynced && " · calendar event linked"}</p>}
                {result && <div className="space-y-2"><StepResult label="Calendar" step={result.calendar} /><StepResult label="Attendance" step={result.attendance} /><StepResult label="Recording" step={result.recording} /></div>}
                <p className="text-xs text-muted-foreground">Meet attendance and recordings need Google Workspace (turn on in Settings → Google).</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Film className="size-4" /> Recording</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Recording link" hint="YouTube, Vimeo, Drive… students see it on the live page"><Input value={recording} onChange={(e) => setRecording(e.target.value)} placeholder="https://" disabled={!can("live", "edit")} /></Field>
              <div className="flex gap-2">
                {can("live", "edit") && <Button loading={saveRec.isPending} onClick={() => saveRec.mutate({ id, input: { recordingUrl: recording } })}>Save</Button>}
                {s.recordingUrl && <Button variant="outline" asChild><a href={s.recordingUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">{s.targets.map((t) => <Badge key={t.type + t.id} variant="secondary" className="capitalize">{t.type}: {t.label}</Badge>)}</CardContent>
          </Card>
          {s.description && <Card><CardHeader><CardTitle>Agenda</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">{s.description}</CardContent></Card>}
        </div>
      </div>
      <LiveFormDialog open={editing} onOpenChange={setEditing} session={s} />
    </>
  );
}
