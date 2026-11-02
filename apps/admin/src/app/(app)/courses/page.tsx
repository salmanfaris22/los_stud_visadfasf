"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Users, Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { Can } from "@/lib/session";
import { CourseForm, emptyCourse } from "@/features/courses/course-form";

export default function CoursesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyCourse());
  const list = $api.useQuery("get", "/api/v1/courses", { params: { query: { q: q || undefined, status: (status || undefined) as "draft" | undefined, page, per_page: 12 } } });
  const create = $api.useMutation("post", "/api/v1/courses", feedback(qc, "Course created", ["/api/v1/courses"], (c) => router.push(`/courses/${c.id}`)));

  return (
    <>
      <PageHeader title="Courses" description="Build courses from videos and tasks." actions={<Can module="courses" action="create"><Button onClick={() => { setDraft(emptyCourse()); setCreating(true); }}><Plus /> New course</Button></Can>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search courses…" className="sm:w-72" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44">
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
        </Select>
      </div>
      {list.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : list.data?.items.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No courses yet" description="Create your first course, then add videos and tasks." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.items.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`} className="group overflow-hidden rounded-xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="relative aspect-video bg-gradient-to-br from-primary/40 via-fuchsia-500/30 to-amber-400/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="size-full object-cover transition group-hover:scale-105" />}
                <StatusBadge status={c.status} className="absolute top-3 left-3 bg-background/90 backdrop-blur" />
              </div>
              <div className="p-4">
                <div className="text-xs text-muted-foreground">{c.category || "General"} · {c.level}</div>
                <h3 className="mt-1 line-clamp-1 font-semibold">{c.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.subtitle}</p>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Video className="size-3.5" />{c.video_count} videos</span>
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{c.student_count} students</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New course</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate({ body: draft }); }} className="grid gap-4">
            <CourseForm value={draft} onChange={setDraft} compact />
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Create & add videos</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
