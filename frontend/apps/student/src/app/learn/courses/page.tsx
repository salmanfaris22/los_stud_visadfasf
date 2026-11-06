"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Search, X } from "lucide-react";
import { EmptyState, Select, Skeleton, cn } from "@lms/ui";
import { $api } from "@/lib/api";
import { CourseCard } from "@/features/learn/course-card";

const tabs = [
  { key: "all", label: "All courses" },
  { key: "progress", label: "In progress" },
  { key: "new", label: "Not started" },
  { key: "done", label: "Completed" },
] as const;
type Tab = (typeof tabs)[number]["key"];

const sorts = {
  recent: "Recently enrolled",
  title: "Title: A to Z",
  progress: "Most progress",
} as const;
type Sort = keyof typeof sorts;

function Courses() {
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [tab, setTab] = React.useState<Tab>("all");
  const [sort, setSort] = React.useState<Sort>("recent");
  const [category, setCategory] = React.useState("");
  const list = $api.useQuery("get", "/api/v1/me/courses");
  const all = list.data ?? [];

  const inTab = (pct: number, t: Tab) => t === "all" || (t === "done" ? pct >= 100 : t === "new" ? pct === 0 : pct > 0 && pct < 100);
  const categories = [...new Set(all.map((c) => c.category).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const items = all
    .filter((c) => inTab(c.progress_pct, tab))
    .filter((c) => !category || c.category === category)
    .filter((c) => !needle || `${c.title} ${c.subtitle} ${c.category} ${c.batch_name}`.toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title)
      : sort === "progress" ? b.progress_pct - a.progress_pct
      : +new Date(b.enrolled_at) - +new Date(a.enrolled_at));
  const filtered = !!(needle || category || sort !== "recent");
  const reset = () => { setQ(""); setCategory(""); setSort("recent"); };

  return (
    <div>
      {/* Dark header band, edge to edge like Udemy's "My learning" */}
      <div className="-mx-4 -mt-7 bg-rail text-rail-foreground sm:-mx-6 lg:-mx-8">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <h1 className="font-display text-[30px] leading-tight font-extrabold sm:text-[40px]">My learning</h1>
          <nav className="-mb-px mt-8 flex gap-6 overflow-x-auto [scrollbar-width:none]" aria-label="Course status">
            {tabs.map((t) => {
              const count = all.filter((c) => inTab(c.progress_pct, t.key)).length;
              return (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}
                  className={cn("shrink-0 border-b-[3px] pb-2.5 text-sm font-bold whitespace-nowrap transition",
                    tab === t.key ? "border-rail-foreground text-rail-foreground" : "border-transparent text-rail-muted hover:text-rail-foreground")}>
                  {t.label} {!list.isLoading && <span className="ml-0.5 font-medium opacity-60 tabular-nums">{count}</span>}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl pt-7">
        {/* Sort, filter, search */}
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="block text-xs font-bold md:w-48">
            Sort by
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="mt-1.5 rounded-md">
              {Object.entries(sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          {categories.length > 1 && (
            <label className="block text-xs font-bold md:w-48">
              Filter by
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 rounded-md">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
          )}
          {filtered && (
            <button type="button" onClick={reset} className="h-10 self-start px-1 text-sm font-bold text-muted-foreground hover:text-foreground md:self-auto">Reset</button>
          )}
          <form role="search" onSubmit={(e) => e.preventDefault()} className="flex h-10 md:ml-auto md:w-80">
            <div className="relative flex-1">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my courses" aria-label="Search my courses"
                className="size-full rounded-l-md border border-r-0 border-input bg-card pr-8 pl-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/60" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
            </div>
            <button type="submit" aria-label="Search" className="flex w-10 items-center justify-center rounded-r-md bg-violet-700 text-white hover:bg-violet-800 dark:bg-violet-500"><Search className="size-4" /></button>
          </form>
        </div>

        {list.isLoading ? (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i}><Skeleton className="aspect-video rounded-lg" /><Skeleton className="mt-3 h-4 w-4/5" /><Skeleton className="mt-2 h-3 w-1/2" /></div>)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<BookOpen />}
            title={all.length === 0 ? "No courses yet" : "No matching courses"}
            description={all.length === 0 ? "Courses your institute assigns to you will show up here." : "Try another tab, filter or search."} />
        ) : (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((c) => <CourseCard key={c.enrollment_id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoursesPage() {
  return <React.Suspense><Courses /></React.Suspense>;
}
