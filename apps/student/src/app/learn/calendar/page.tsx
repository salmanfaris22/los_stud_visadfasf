"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar, Skeleton } from "@lms/ui";
import { $api } from "@/lib/api";

export default function CalendarPage() {
  const router = useRouter();
  const [month, setMonth] = React.useState(new Date());
  const up = $api.useQuery("get", "/api/v1/me/live", { params: { query: { scope: "upcoming" } } });
  const past = $api.useQuery("get", "/api/v1/me/live", { params: { query: { scope: "past" } } });
  const tasks = $api.useQuery("get", "/api/v1/me/tasks");
  if (up.isLoading || tasks.isLoading) return <Skeleton className="h-[600px]" />;
  const events = [
    ...[...(up.data ?? []), ...(past.data ?? [])].map((l) => ({ id: "l" + l.id, title: l.title, start: l.starts_at, tone: "primary" as const, href: "/learn/live" })),
    ...(tasks.data ?? []).filter((t) => t.due_at).map((t) => ({ id: "t" + t.id, title: `Due: ${t.title}`, start: t.due_at!, tone: t.status === "approved" ? ("success" as const) : ("warning" as const), href: `/learn/tasks/${t.id}` })),
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Calendar</h1>
      <p className="mb-6 text-muted-foreground"><span className="text-primary">■</span> Live classes · <span className="text-warning">■</span> Task deadlines</p>
      <MonthCalendar month={month} onMonth={setMonth} events={events} onSelect={(e) => router.push((e as { href?: string }).href ?? "/learn")} />
    </div>
  );
}
