"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar, Skeleton } from "@lms/ui";
import { LiveService, PortalService, useRpcQuery } from "@lms/api-client";

export default function CalendarPage() {
  const router = useRouter();
  const [month, setMonth] = React.useState(new Date());
  const up = useRpcQuery(LiveService.method.listMyLive, { scope: "upcoming" });
  const past = useRpcQuery(LiveService.method.listMyLive, { scope: "past" });
  const tasks = useRpcQuery(PortalService.method.listMyTasks, {});
  if (up.isLoading || tasks.isLoading) return <Skeleton className="h-[600px]" />;
  const events = [
    ...[...(up.data?.items ?? []), ...(past.data?.items ?? [])].map((l) => ({ id: "l" + l.id, title: l.title, start: l.startsAt, tone: "primary" as const, href: "/learn/live" })),
    ...(tasks.data?.items ?? []).filter((t) => t.dueAt).map((t) => ({ id: "t" + t.id, title: `Due: ${t.title}`, start: t.dueAt!, tone: t.status === "approved" ? ("success" as const) : ("warning" as const), href: `/learn/tasks/${t.id}` })),
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Calendar</h1>
      <p className="mb-6 text-muted-foreground"><span className="text-foreground">■</span> Live classes · <span className="text-warning">■</span> Task deadlines</p>
      <MonthCalendar month={month} onMonth={setMonth} events={events} onSelect={(e) => router.push((e as { href?: string }).href ?? "/learn")} />
    </div>
  );
}
