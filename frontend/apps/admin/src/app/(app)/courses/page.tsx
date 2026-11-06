"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Users, Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, LineBadge, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, lineColor } from "@lms/ui";
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
            <Link key={c.id} href={`/courses/${c.id}`} className="group flex flex-col overflow-hidden rounded-[20px] border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg dark:shadow-none">
              <div className="relative aspect-video overflow-hidden" style={{ background: `color-mix(in oklab, ${lineColor(c.id)} 18%, var(--card))` }}>
                {c.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnail_url} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                ) : (
                  <div className="map-grid flex size-full items-center justify-center"><LineBadge id={c.id} name={c.title} size="xl" /></div>
                )}
                <StatusBadge status={c.status} className="absolute top-3 left-3 bg-card/95 shadow-sm backdrop-blur" />
                <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: lineColor(c.id) }} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground"><LineBadge id={c.id} name={c.title} size="sm" /><span className="capitalize">{c.category || "General"} · {c.level}</span></div>
                <h3 className="mt-3 line-clamp-1 font-bold">{c.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.subtitle}</p>
                <div className="mt-auto flex gap-4 pt-4 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Video className="size-3.5" />{c.video_count} stops</span>
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
