"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, List, Plus, Video } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatusBadge, Tabs, TabsList, TabsTrigger, formatDateTime } from "@lms/ui";
import { $api } from "@/lib/api";
import { Can } from "@/lib/session";
import { LiveFormDialog } from "@/features/live/live-form";
import { MonthCalendar } from "@lms/ui";

export default function LivePage() {
  const router = useRouter();
  const [view, setView] = React.useState("calendar");
  const [month, setMonth] = React.useState(new Date());
  const [creating, setCreating] = React.useState(false);
  const from = new Date(month.getFullYear(), month.getMonth() - 1, 20).toISOString();
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 10).toISOString();
  const cal = $api.useQuery("get", "/api/v1/live", { params: { query: { from, to, per_page: 200 } } }, { enabled: view === "calendar" });
  const list = $api.useQuery("get", "/api/v1/live", { params: { query: { per_page: 100 } } }, { enabled: view === "list" });
  const now = Date.now();
  return (
    <>
      <PageHeader title="Live sessions" description="Google Meet classes for batches, courses or individual students."
        actions={<>
          <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="calendar"><CalendarDays /> Calendar</TabsTrigger><TabsTrigger value="list"><List /> List</TabsTrigger></TabsList></Tabs>
          <Can module="live" action="create"><Button onClick={() => setCreating(true)}><Plus /> Schedule</Button></Can>
        </>} />
      {view === "calendar" ? (
        cal.isLoading ? <Skeleton className="h-[600px]" /> : (
          <MonthCalendar month={month} onMonth={setMonth} onSelect={(e) => router.push(`/live/${e.id}`)}
            events={(cal.data?.items ?? []).map((l) => ({ id: l.id, title: l.title, start: l.starts_at, tone: l.status === "cancelled" ? "muted" : new Date(l.ends_at).getTime() < now ? "success" : "primary" }))} />
        )
      ) : list.isLoading ? <Skeleton className="h-96" /> : list.data?.items.length === 0 ? (
        <EmptyState icon={<Video />} title="No live sessions yet" description="Schedule a Google Meet class and students get notified." />
      ) : (
        <div className="grid gap-3">
          {list.data?.items.map((l) => (
            <Link key={l.id} href={`/live/${l.id}`}>
              <Card className="flex flex-wrap items-center gap-4 p-4 transition hover:border-foreground/25">
                <div className="flex w-24 flex-col justify-center rounded-2xl bg-rail px-3.5 py-2.5 text-rail-foreground">
                  <span className="font-display text-lg leading-none font-extrabold tabular-nums">{new Date(l.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="mt-1 text-[11px] font-semibold text-rail-muted">{new Date(l.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(l.starts_at)} · {l.host_name || "No host"}</div>
                </div>
                {l.calendar_synced && <Badge variant="info">Calendar synced</Badge>}
                {l.recording_url && <Badge variant="success">Recording</Badge>}
                <span className="text-sm text-muted-foreground">{l.present_count} attended</span>
                <StatusBadge status={l.status === "scheduled" && new Date(l.ends_at).getTime() < now ? "completed" : l.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
      <LiveFormDialog open={creating} onOpenChange={setCreating} onSaved={(d) => router.push(`/live/${d.session.id}`)} />
    </>
  );
}
