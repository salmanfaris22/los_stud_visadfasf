"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, X } from "lucide-react";
import { EmptyState, Skeleton, asDate } from "@lms/ui";

import { CourseCard } from "@/features/learn/course-card";
import { PortalService, useRpcQuery } from "@lms/api-client";

function Courses() {
  // The top bar search (⌘K) links here with ?q= to narrow the list.
  const q = (useSearchParams().get("q") ?? "").trim();
  const list = useRpcQuery(PortalService.method.listMyCourses, {});
  const all = list.data?.items ?? [];

  const needle = q.toLowerCase();
  // Newest enrolment first.
  const items = all
    .filter((c) => !needle || `${c.title} ${c.subtitle} ${c.category} ${c.batchName}`.toLowerCase().includes(needle))
    .sort((a, b) => +asDate(b.enrolledAt) - +asDate(a.enrolledAt));

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="sr-only">My courses</h1>
      {q && (
        <p className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          Results for “{q}”
          <Link href="/learn/courses" className="inline-flex items-center gap-1 font-bold text-foreground hover:underline"><X className="size-3.5" />Clear</Link>
        </p>
      )}

      {list.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<BookOpen />}
          title={all.length === 0 ? "No courses yet" : "No matching courses"}
          description={all.length === 0 ? "Courses your institute assigns to you will show up here." : "Try another search."} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((c) => <CourseCard key={c.enrollmentId} c={c} />)}</div>
      )}
    </div>
  );
}

export default function CoursesPage() {
  return <React.Suspense><Courses /></React.Suspense>;
}
