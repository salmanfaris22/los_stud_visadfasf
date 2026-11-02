"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, uploadFile } from "@lms/api-client";
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Markdown, PageHeader, Skeleton, StatusBadge,
  SubmissionItems, Textarea, ThreadView, cn, formatDateTime, timeAgo, toast,
} from "@lms/ui";
import { $api, api, invalidate } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";

const ACTIONS = [
  { status: "approved", label: "Approve", icon: CheckCircle2, variant: "success" },
  { status: "resubmit", label: "Ask to resubmit", icon: RotateCcw, variant: "outline" },
  { status: "rejected", label: "Reject", icon: XCircle, variant: "destructive" },
] as const;

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { me, can } = useSession();
  const q = $api.useQuery("get", "/api/v1/submissions/{id}", { params: { path: { id } } });
  const [marks, setMarks] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [sending, setSending] = React.useState(false);
  React.useEffect(() => {
    if (q.data) { setMarks(q.data.current.marks?.toString() ?? ""); setNotes(q.data.current.feedback); }
  }, [q.data]);
  const review = $api.useMutation("post", "/api/v1/submissions/{id}/review", feedback(qc, "Review saved", ["/api/v1/submissions", "/api/v1/analytics"]));

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Submission not found" />;
  const { task, student, current, history, comments } = q.data;
  const latest = history[0]?.id === current.id;

  const reply = async (body: string, file?: File) => {
    setSending(true);
    try {
      const up = file ? await uploadFile(api, file, "comment") : undefined;
      const r = await api.client.POST("/api/v1/tasks/{task_id}/threads/{student_id}", { params: { path: { task_id: task.id, student_id: student.id } }, body: { body, upload_id: up?.id } });
      if (r.error) throw r.error;
      await invalidate(qc, `/api/v1/submissions/${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        back={<Link href="/submissions" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Review queue</Link>}
        title={task.title}
        description={`${task.course_title} · ${task.video_title}`}
        actions={<span className="flex items-center gap-2"><StatusBadge status={current.status} />{current.is_late && <Badge variant="destructive">Late</Badge>}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <Avatar src={student.avatar_url} name={student.name} />
              <div className="min-w-0 flex-1">
                <Link href={`/students/${student.id}`} className="font-semibold hover:underline">{student.name}</Link>
                <div className="text-xs text-muted-foreground">{student.email}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">Attempt #{current.attempt}<br />{formatDateTime(current.created_at)}</div>
            </CardHeader>
            <CardContent><SubmissionItems items={current.items} /></CardContent>
          </Card>
          {task.instructions && (
            <Card><CardHeader><CardTitle>Task instructions</CardTitle></CardHeader><CardContent><Markdown>{task.instructions}</Markdown></CardContent></Card>
          )}
          {history.length > 1 && (
            <Card>
              <CardHeader><CardTitle>All attempts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {history.map((h) => (
                  <Link key={h.id} href={`/submissions/${h.id}`} className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm", h.id === current.id && "border-primary bg-primary/5")}>
                    <span className="font-medium">#{h.attempt}</span><StatusBadge status={h.status} />
                    <span className="flex-1 truncate text-muted-foreground">{h.feedback}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(h.created_at)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-20">
            <CardHeader><CardTitle>Review</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!latest && <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">This is an older attempt. Open the newest attempt to review.</p>}
              {current.reviewed_at && <p className="text-xs text-muted-foreground"><Clock className="mr-1 inline size-3" />Reviewed by {current.reviewer_name} {timeAgo(current.reviewed_at)}</p>}
              <Field label={`Marks (out of ${task.max_marks})`} hint={task.pass_marks ? `Pass mark: ${task.pass_marks}` : undefined}>
                <Input type="number" min={0} max={task.max_marks} value={marks} onChange={(e) => setMarks(e.target.value)} disabled={!can("submissions", "edit") || !latest} />
              </Field>
              <Field label="Feedback for the student"><Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!can("submissions", "edit") || !latest} placeholder="What was good, what to improve…" /></Field>
              {can("submissions", "edit") && latest && (
                <div className="grid gap-2">
                  {ACTIONS.map((a) => (
                    <Button key={a.status} variant={a.variant} loading={review.isPending && review.variables?.body.status === a.status}
                      onClick={() => review.mutate({ params: { path: { id } }, body: { status: a.status, marks: marks === "" ? undefined : Number(marks), feedback: notes } })}>
                      <a.icon /> {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
            <CardContent>
              <ThreadView messages={comments} meId={me?.id} onSend={reply} sending={sending} onAttach={can("submissions", "edit")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
