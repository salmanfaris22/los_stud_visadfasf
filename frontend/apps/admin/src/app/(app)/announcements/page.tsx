"use client";
import * as React from "react";
import { Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type Announcement, type AnnouncementInput, AnnouncementService, useRpcMutation, useRpcQuery, type Draft } from "@lms/api-client";
import { Badge, Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Input, Markdown, PageHeader, Pagination, Select, Skeleton, Switch, Textarea, timeAgo, useConfirm } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";

function AnnouncementDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Announcement }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const courses = useCourseOptions();
  const batches = useBatchOptions();
  const [f, setF] = React.useState<Draft<AnnouncementInput>>({ title: "", body: "", targetType: "all", pinned: false });
  React.useEffect(() => { if (open) setF({ title: item?.title ?? "", body: item?.body ?? "", targetType: item?.targetType ?? (me?.scoped ? "course" : "all"), targetId: item?.targetId ?? undefined, pinned: item?.pinned ?? false }); }, [open, item, me]);
  const create = useRpcMutation(AnnouncementService.method.createAnnouncement, feedback(qc, "Announcement posted — students notified", [AnnouncementService], () => onOpenChange(false)));
  const update = useRpcMutation(AnnouncementService.method.updateAnnouncement, feedback(qc, "Announcement saved", [AnnouncementService], () => onOpenChange(false)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{item ? "Edit announcement" : "New announcement"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (item) update.mutate({ id: item.id, input: f }); else create.mutate({ input: f }); }}>
          <Field label="Title" required><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message" hint="Markdown supported" required><Textarea required rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send to">
              <Select value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value as "all", targetId: undefined })}>
                {!me?.scoped && <option value="all">Everyone</option>}<option value="course">A course</option><option value="batch">A batch</option>
              </Select>
            </Field>
            {f.targetType !== "all" && (
              <Field label={f.targetType === "course" ? "Course" : "Batch"} required>
                <Select required value={f.targetId ?? ""} onChange={(e) => setF({ ...f, targetId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(f.targetType === "course" ? courses.data?.map((c) => ({ id: c.id, name: c.title })) : batches.data?.map((b) => ({ id: b.id, name: `${b.name} · ${b.courseTitle}` })))?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.pinned} onCheckedChange={(v) => setF({ ...f, pinned: v })} /> Pin to the top</label>
          <DialogFooter><Button type="submit" loading={create.isPending || update.isPending}>{item ? "Save" : "Post & notify"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = React.useState(1);
  const [edit, setEdit] = React.useState<{ item?: Announcement } | null>(null);
  const list = useRpcQuery(AnnouncementService.method.listAnnouncements, { page });
  const del = useRpcMutation(AnnouncementService.method.deleteAnnouncement, feedback(qc, "Announcement deleted", [AnnouncementService]));
  return (
    <>
      <PageHeader title="Announcements" description="Share news with everyone, a course or a batch. Students get a notification." actions={<Can module="announcements" action="create"><Button onClick={() => setEdit({})}><Plus /> New announcement</Button></Can>} />
      {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<Megaphone />} title="No announcements yet" /> : (
        <div className="space-y-3">
          {list.data?.items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">{a.pinned && <Pin className="size-4 text-primary" />}{a.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{a.targetLabel}</Badge>{a.authorName} · {timeAgo(a.createdAt)}</div>
                </div>
                <Can module="announcements" action="edit"><Button variant="ghost" size="icon-sm" onClick={() => setEdit({ item: a })} aria-label="Edit"><Pencil /></Button></Can>
                <Can module="announcements" action="delete"><Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: "Delete this announcement?", destructive: true, confirmText: "Delete" })) del.mutate({ id: a.id }); }}><Trash2 /></Button></Can>
              </div>
              <Markdown className="mt-3 text-sm text-muted-foreground">{a.body}</Markdown>
            </Card>
          ))}
          {list.data && <Pagination page={page} perPage={list.data.perPage} total={list.data.total} onPage={setPage} />}
        </div>
      )}
      <AnnouncementDialog open={!!edit} item={edit?.item} onOpenChange={(o) => !o && setEdit(null)} />
    </>
  );
}
