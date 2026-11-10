"use client";
import * as React from "react";
import { CalendarClock, CheckCircle2, Info, Trophy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PortalService, errorMessage, uploadFile, useRpcMutation, useRpcQuery } from "@lms/api-client";
import { Badge, Card, CardContent, CardHeader, CardTitle, Markdown, Skeleton, StatusBadge, SubmissionItems, ThreadView, cn, formatDateTime, timeAgo, toast } from "@lms/ui";
import { api, invalidate, rpc } from "@/lib/api";
import { useSession } from "@/lib/session";
import { SubmitForm } from "./submit-form";

/**
 * One task: its details and the upload form. Used inline (task dropdown in lists) and on the full task page.
 * Students only need the task and the upload for now, so the other parts are hidden (not deleted).
 * Set a flag to true to show that part again.
 */
const SHOW = {
  instructions: false, // "Instructions" card
  approvedNote: false, // green "Approved · 8/10 marks" banner and the "Approved — great work!" line
  attempts: false, // "Your attempts" list
  mentorChat: false, // "Ask your mentor" chat
};

export function TaskPanel({ taskId, inline }: { taskId: string; inline?: boolean }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [sending, setSending] = React.useState(false);
  const q = useRpcQuery(PortalService.method.getMyTask, { id: taskId });
  const submit = useRpcMutation(PortalService.method.submitTask, {
    onSuccess: () => {
      toast.success("Submitted! Your mentor will review it soon.");
      void invalidate(qc, PortalService);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Skeleton className="h-48" />;
  const p = q.data?.page;
  if (!p?.task) return <p className="text-sm text-muted-foreground">This task is not available.</p>;
  const t = p.task;
  const latest = p.attempts[0];

  const send = async (body: string, file?: File) => {
    setSending(true);
    try {
      const up = file ? await uploadFile(api, file, "comment") : undefined;
      await rpc(PortalService).commentTask({ taskId, input: { body, uploadId: up?.id } });
      await invalidate(qc, PortalService.method.getMyTask);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Trophy className="size-4" />{t.maxMarks} marks{t.passMarks ? ` · pass ${t.passMarks}` : ""}</span>
        {t.dueAt && <span className={cn("inline-flex items-center gap-1", p.isOverdue && "text-destructive")}><CalendarClock className="size-4" />Due {formatDateTime(t.dueAt)}</span>}
        <span className="flex flex-wrap gap-1">{t.allowedTypes.map((a) => <Badge key={a} variant="secondary" className="capitalize">{a}</Badge>)}</span>
      </div>
      <div className={cn("grid gap-6", SHOW.mentorChat && "lg:grid-cols-[1fr_360px]")}>
        <div className="min-w-0 space-y-5">
          {SHOW.instructions && t.instructions && <Card><CardHeader><CardTitle>Instructions</CardTitle></CardHeader><CardContent><Markdown>{t.instructions}</Markdown></CardContent></Card>}
          {latest && (latest.status === "approved" ? (
            SHOW.approvedNote && <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-success"><CheckCircle2 className="size-6" /><div><b>Approved</b>{latest.marks != null && ` · ${latest.marks}/${t.maxMarks} marks`}{latest.feedback && <p className="text-sm text-foreground">{latest.feedback}</p>}</div></div>
          ) : latest.status !== "pending" && latest.feedback ? (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4"><Info className="mt-0.5 size-5 text-warning" /><div><b className="text-warning">Mentor feedback</b><p className="text-sm">{latest.feedback}</p></div></div>
          ) : null)}
          {p.canSubmit ? (
            <SubmitForm page={p} submitting={submit.isPending} onSubmit={(items) => submit.mutate({ taskId, input: { items } })} />
          ) : SHOW.approvedNote || p.status !== "approved" ? (
            <Card className="p-5 text-sm text-muted-foreground">{p.reason}</Card>
          ) : null}
          {SHOW.attempts && p.attempts.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Your attempts</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {p.attempts.map((a) => (
                  <div key={a.id} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <b>Attempt #{a.attempt}</b><StatusBadge status={a.status} />{a.isLate && <Badge variant="destructive">Late</Badge>}
                      <span className="text-muted-foreground">{timeAgo(a.createdAt)}</span>
                      {a.marks != null && <span className="ml-auto font-semibold">{a.marks}/{t.maxMarks}</span>}
                    </div>
                    <SubmissionItems items={a.items} />
                    {a.feedback && <p className="rounded-lg bg-muted p-3 text-sm"><b>{a.reviewerName || "Mentor"}:</b> {a.feedback}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        {SHOW.mentorChat && (
          <Card className={cn("h-fit", !inline && "lg:sticky lg:top-20")}>
            <CardHeader><CardTitle>Ask your mentor</CardTitle></CardHeader>
            <CardContent><ThreadView messages={p.comments} meId={me?.id} onSend={send} sending={sending} onAttach /></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
