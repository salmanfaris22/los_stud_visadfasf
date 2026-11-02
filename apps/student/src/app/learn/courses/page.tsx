"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { EmptyState, SearchInput, Skeleton } from "@lms/ui";
import { $api } from "@/lib/api";
import { CourseTile } from "@/features/learn/cards";

function Courses() {
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const list = $api.useQuery("get", "/api/v1/me/courses");
  const items = (list.data ?? []).filter((c) => (c.title + c.category).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="font-display text-2xl font-bold sm:text-3xl">My courses</h1><p className="text-muted-foreground">Courses your institute assigned to you.</p></div>
        <SearchInput value={q} onChange={setQ} placeholder="Filter courses…" className="sm:w-72" delay={0} />
      </div>
      {list.isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState icon={<BookOpen />} title={q ? "No matching courses" : "No courses yet"} /> : (
        <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((c) => <CourseTile key={c.enrollment_id} c={c} />)}</div>
      )}
    </div>
  );
}

export default function CoursesPage() {
  return <React.Suspense><Courses /></React.Suspense>;
}
