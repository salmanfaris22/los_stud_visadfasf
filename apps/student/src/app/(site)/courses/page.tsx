import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { EmptyState, cn } from "@lms/ui";
import { CourseCard } from "@/features/landing/sections";
import { getCategories, getCourses } from "@/lib/server-api";

export const metadata: Metadata = { title: "Courses", description: "Browse all courses: video lessons with mentor-reviewed tasks." };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q, category } = await searchParams;
  const [courses, categories] = await Promise.all([getCourses({ q, category, limit: 100 }), getCategories()]);
  return (
    <div className="mx-auto max-w-7xl px-4 pt-32 pb-24 sm:px-6">
      <h1 className="font-display text-4xl font-bold tracking-tight">Explore courses</h1>
      <p className="mt-2 text-muted-foreground">Learn with short lessons, real tasks and mentor feedback.</p>
      <form className="relative mt-8 max-w-xl" action="/courses">
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Search courses…" className="h-12 w-full rounded-2xl border bg-card pr-4 pl-12 shadow-sm outline-none focus:ring-2 focus:ring-ring/30" />
        {category && <input type="hidden" name="category" value={category} />}
      </form>
      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/courses" className={cn("rounded-full border px-4 py-1.5 text-sm transition", !category ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>All</Link>
          {categories.map((c) => <Link key={c} href={`/courses?category=${encodeURIComponent(c)}`} className={cn("rounded-full border px-4 py-1.5 text-sm transition", category === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{c}</Link>)}
        </div>
      )}
      <div className="mt-10">
        {courses.length === 0 ? <EmptyState icon={<BookOpen />} title="No courses found" description="Try another search." /> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c, i) => <CourseCard key={c.id} c={c} index={i} />)}</div>
        )}
      </div>
    </div>
  );
}
