"use client";
import * as React from "react";
import { MessageCircle, Pin, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CommentService, errorMessage, useRpcMutation, useRpcQuery, type VideoComment } from "@lms/api-client";
import { Avatar, Badge, Button, Textarea, timeAgo, toast, useConfirm } from "@lms/ui";
import { invalidate } from "@/lib/api";
import { useSession } from "@/lib/session";

function Comment({ c, videoId, reply }: { c: VideoComment; videoId: string; reply?: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { me } = useSession();
  const [replying, setReplying] = React.useState(false);
  const [body, setBody] = React.useState("");
  const key = CommentService.method.listVideoComments;
  const post = useRpcMutation(CommentService.method.createVideoComment, { onSuccess: () => { setBody(""); setReplying(false); void invalidate(qc, key); }, onError: (e) => toast.error(errorMessage(e)) });
  const del = useRpcMutation(CommentService.method.deleteVideoComment, { onSuccess: () => invalidate(qc, key), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="flex gap-3">
      <Avatar src={c.authorAvatar} name={c.authorName} className={reply ? "size-7" : "size-9"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">{c.authorName}</span>{c.authorKind === "staff" && <Badge>Mentor</Badge>}{c.pinned && <Badge variant="info"><Pin /> Pinned</Badge>}
          <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
        <div className="mt-1 flex gap-1">
          {!reply && <Button variant="ghost" size="sm" onClick={() => setReplying(!replying)}><MessageCircle /> Reply</Button>}
          {c.authorId === me?.id && <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: "Delete your comment?", destructive: true, confirmText: "Delete" })) del.mutate({ id: c.id }); }}><Trash2 /></Button>}
        </div>
        {replying && (
          <div className="mt-2 flex gap-2">
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a reply…" />
            <Button disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate({ videoId, input: { body, parentId: c.id } })}>Reply</Button>
          </div>
        )}
        {c.replies.length > 0 && <div className="mt-3 space-y-3 border-l pl-4">{c.replies.map((r) => <Comment key={r.id} c={r} videoId={videoId} reply />)}</div>}
      </div>
    </div>
  );
}

/** YouTube-like questions & answers under a lesson. */
export function VideoQA({ videoId }: { videoId: string }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [body, setBody] = React.useState("");
  const list = useRpcQuery(CommentService.method.listVideoComments, { videoId });
  const post = useRpcMutation(CommentService.method.createVideoComment, { onSuccess: () => { setBody(""); void invalidate(qc, CommentService.method.listVideoComments); }, onError: (e) => toast.error(errorMessage(e)) });
  const count = (list.data?.items ?? []).reduce((n, c) => n + 1 + c.replies.length, 0);
  return (
    <div className="space-y-6">
      <div className="text-sm font-semibold">{count} comments</div>
      <div className="flex gap-3">
        <Avatar src={me?.avatarUrl} name={me?.name} />
        <div className="flex-1 space-y-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ask a question about this lesson…" />
          <div className="flex justify-end"><Button disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate({ videoId, input: { body } })}>Comment</Button></div>
        </div>
      </div>
      {list.data?.items.map((c) => <Comment key={c.id} c={c} videoId={videoId} />)}
    </div>
  );
}
