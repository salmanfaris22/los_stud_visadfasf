"use client";
import { BookOpen } from "lucide-react";
import { PortalService, SiteService, useRpcQuery } from "@lms/api-client";
import { EmptyState, Skeleton, asDate } from "@lms/ui";

import { CourseCard, LockedCourseCard } from "@/features/learn/course-card";

/** Home: every course. Enrolled ones show progress; the rest show only the thumbnail with a lock. */
export default function LearnHome() {
  const mine = useRpcQuery(PortalService.method.listMyCourses, {});
  const catalog = useRpcQuery(SiteService.method.listPublicCourses, { limit: 200 });

  const owned = [...(mine.data?.items ?? [])].sort((a, b) => +asDate(b.enrolledAt) - +asDate(a.enrolledAt));
  const ownedIds = new Set(owned.map((c) => c.courseId));
  const locked = (catalog.data?.items ?? []).filter((c) => !ownedIds.has(c.id));

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-6 font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">All courses</h1>
      {mine.isLoading || catalog.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-video rounded-2xl" />)}</div>
      ) : owned.length + locked.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No courses yet" description="Courses will show up here." />
      ) : (
        <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {owned.map((c) => <CourseCard key={c.enrollmentId} c={c} />)}
          {locked.map((c) => <LockedCourseCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
