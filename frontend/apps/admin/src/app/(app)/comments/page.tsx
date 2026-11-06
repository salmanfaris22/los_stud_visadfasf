"use client";
import * as React from "react";
import { MessagesSquare, Pin, Reply, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, Skeleton, Switch, Textarea, timeAgo, useConfirm } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";

function ReplyBox({ videoId, parentId, onDone }: { videoId: string; parentId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [body, setBody] = React.useState("");
  const post = $api.useMutation("post", "/api/v1/videos/{id}/comments", feedback(qc, "Reply posted", ["/api/v1/comments"], onDone));
  return (
    <div className="mt-3 flex gap-2">
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write an answer…" />
      <Button disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate({ params: { path: { id: videoId } }, body: { body, parent_id: parentId } })}>Reply</Button>
    </div>
  );
}

export default function CommentsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [unanswered, setUnanswered] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [replying, setReplying] = React.useState<string | null>(null);
  const list = $api.useQuery("get", "/api/v1/comments", { params: { query: { unanswered, page } } });
  const del = $api.useMutation("delete", "/api/v1/comments/{id}", feedback(qc, "Comment deleted", ["/api/v1/comments"]));
  const pin = $api.useMutation("put", "/api/v1/comments/{id}/pin", feedback(qc, null, ["/api/v1/comments"]));
  return (
    <>
      <PageHeader title="Video Q&A" description="Questions students ask under lessons." actions={<label className="flex items-center gap-2 text-sm"><Switch checked={unanswered} onCheckedChange={(v) => { setUnanswered(v); setPage(1); }} /> Only unanswered questions</label>} />
      {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<MessagesSquare />} title={unanswered ? "No unanswered questions 🎉" : "No comments yet"} /> : (
        <div className="space-y-3">
          {list.data?.items.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author_name}</span>{c.author_kind === "staff" && <Badge>Mentor</Badge>}
                <span>on <b>{c.video_title}</b> · {c.course_title}</span><span>· {timeAgo(c.created_at)}</span>{c.pinned && <Badge variant="info"><Pin /> Pinned</Badge>}{c.parent_id && <Badge variant="outline">reply</Badge>}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>
              <div className="mt-2 flex gap-1">
                {can("comments", "create") && !c.parent_id && <Button variant="ghost" size="sm" onClick={() => setReplying(replying === c.id ? null : c.id)}><Reply /> Answer</Button>}
                {can("comments", "edit") && <Button variant="ghost" size="sm" onClick={() => pin.mutate({ params: { path: { id: c.id } }, body: { pinned: !c.pinned } })}><Pin /> {c.pinned ? "Unpin" : "Pin"}</Button>}
                {can("comments", "delete") && <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { if (await confirm({ title: "Delete this comment?", destructive: true, confirmText: "Delete" })) del.mutate({ params: { path: { id: c.id } } }); }}><Trash2 /> Delete</Button>}
              </div>
              {replying === c.id && <ReplyBox videoId={c.video_id} parentId={c.id} onDone={() => setReplying(null)} />}
            </Card>
          ))}
          {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
        </div>
      )}
    </>
  );
}
