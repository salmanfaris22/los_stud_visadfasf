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
      <div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><span className="size-2.5 rounded-full border-[2.5px] border-foreground bg-signal" />{courses.length} line{courses.length === 1 ? "" : "s"} on the network</div>
      <h1 className="font-display text-4xl font-extrabold sm:text-6xl">Explore courses</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">Learn with short lessons, real tasks and mentor feedback.</p>
      <form className="relative mt-8 max-w-xl" action="/courses">
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Search courses…" className="h-14 w-full rounded-full border bg-card pr-5 pl-12 text-[15px] shadow-sm outline-none focus:border-foreground/60 focus:ring-4 focus:ring-signal/40" />
        {category && <input type="hidden" name="category" value={category} />}
      </form>
      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/courses" className={cn("rounded-full border bg-card px-4 py-2 text-sm font-semibold transition", !category ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40")}>All</Link>
          {categories.map((c) => <Link key={c} href={`/courses?category=${encodeURIComponent(c)}`} className={cn("rounded-full border bg-card px-4 py-2 text-sm font-semibold transition", category === c ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40")}>{c}</Link>)}
        </div>
      )}
      <div className="mt-10">
        {courses.length === 0 ? <EmptyState icon={<BookOpen />} title="No courses found" description="Try another search." /> : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c, i) => <CourseCard key={c.id} c={c} index={i} />)}</div>
        )}
      </div>
    </div>
  );
}
