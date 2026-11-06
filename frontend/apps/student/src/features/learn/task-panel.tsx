"use client";
import * as React from "react";
import { CalendarClock, CheckCircle2, Info, Trophy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, uploadFile } from "@lms/api-client";
import { Badge, Card, CardContent, CardHeader, CardTitle, Markdown, Skeleton, StatusBadge, SubmissionItems, ThreadView, cn, formatDateTime, timeAgo, toast } from "@lms/ui";
import { $api, api, invalidate } from "@/lib/api";
import { useSession } from "@/lib/session";
import { SubmitForm } from "./submit-form";

/**
 * Everything about one task: details, instructions, submission form, attempts and the mentor chat.
 * Used inline (task dropdown in lists) and on the full task page.
 */
export function TaskPanel({ taskId, inline }: { taskId: string; inline?: boolean }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [sending, setSending] = React.useState(false);
  const init = { params: { path: { id: taskId } } };
  const q = $api.useQuery("get", "/api/v1/me/tasks/{id}", init);
  const submit = $api.useMutation("post", "/api/v1/me/tasks/{id}/submissions", {
    onSuccess: (d) => {
      qc.setQueryData(["get", "/api/v1/me/tasks/{id}", init], d);
      toast.success("Submitted! Your mentor will review it soon.");
      void invalidate(qc, "/api/v1/me");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Skeleton className="h-48" />;
  if (!q.data) return <p className="text-sm text-muted-foreground">This task is not available.</p>;
  const p = q.data;
  const t = p.task;
  const latest = p.attempts[0];

  const send = async (body: string, file?: File) => {
    setSending(true);
    try {
      const up = file ? await uploadFile(api, file, "comment") : undefined;
      const r = await api.client.POST("/api/v1/me/tasks/{id}/comments", { params: { path: { id: taskId } }, body: { body, upload_id: up?.id } });
      if (r.error) throw r.error;
      await invalidate(qc, `/api/v1/me/tasks/${taskId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Trophy className="size-4" />{t.max_marks} marks{t.pass_marks ? ` · pass ${t.pass_marks}` : ""}</span>
        {t.due_at && <span className={cn("inline-flex items-center gap-1", p.is_overdue && "text-destructive")}><CalendarClock className="size-4" />Due {formatDateTime(t.due_at)}</span>}
        <span className="flex flex-wrap gap-1">{t.allowed_types.map((a) => <Badge key={a} variant="secondary" className="capitalize">{a}</Badge>)}</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {t.instructions && <Card><CardHeader><CardTitle>Instructions</CardTitle></CardHeader><CardContent><Markdown>{t.instructions}</Markdown></CardContent></Card>}
          {latest && (latest.status === "approved" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-success"><CheckCircle2 className="size-6" /><div><b>Approved</b>{latest.marks != null && ` · ${latest.marks}/${t.max_marks} marks`}{latest.feedback && <p className="text-sm text-foreground">{latest.feedback}</p>}</div></div>
          ) : latest.status !== "pending" && latest.feedback ? (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4"><Info className="mt-0.5 size-5 text-warning" /><div><b className="text-warning">Mentor feedback</b><p className="text-sm">{latest.feedback}</p></div></div>
          ) : null)}
          {p.can_submit ? (
            <SubmitForm page={p} submitting={submit.isPending} onSubmit={(items) => submit.mutate({ params: { path: { id: taskId } }, body: { items } })} />
          ) : (
            <Card className="p-5 text-sm text-muted-foreground">{p.reason}</Card>
          )}
          {p.attempts.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Your attempts</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {p.attempts.map((a) => (
                  <div key={a.id} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <b>Attempt #{a.attempt}</b><StatusBadge status={a.status} />{a.is_late && <Badge variant="destructive">Late</Badge>}
                      <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                      {a.marks != null && <span className="ml-auto font-semibold">{a.marks}/{t.max_marks}</span>}
                    </div>
                    <SubmissionItems items={a.items} />
                    {a.feedback && <p className="rounded-lg bg-muted p-3 text-sm"><b>{a.reviewer_name || "Mentor"}:</b> {a.feedback}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <Card className={cn("h-fit", !inline && "lg:sticky lg:top-20")}>
          <CardHeader><CardTitle>Ask your mentor</CardTitle></CardHeader>
          <CardContent><ThreadView messages={p.comments} meId={me?.id} onSend={send} sending={sending} onAttach /></CardContent>
        </Card>
      </div>
    </div>
  );
}
