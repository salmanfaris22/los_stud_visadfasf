"use client";
import * as React from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from "@lms/ui";
import { $api } from "@/lib/api";
import { TaskRow } from "@/features/learn/cards";

const TABS = [{ v: "open", label: "To do" }, { v: "pending", label: "In review" }, { v: "approved", label: "Approved" }, { v: "", label: "All" }];

export default function TasksPage() {
  const [tab, setTab] = React.useState("open");
  const q = $api.useQuery("get", "/api/v1/me/tasks");
  const items = (q.data ?? []).filter((t) => (tab === "open" ? ["todo", "rejected", "resubmit"].includes(t.status) : tab ? t.status === tab : true));
  const count = (s: string) => (q.data ?? []).filter((t) => (s === "open" ? ["todo", "rejected", "resubmit"].includes(t.status) : s ? t.status === s : true)).length;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Tasks</h1>
      <p className="mb-6 text-muted-foreground">Everything you need to submit, across your courses.</p>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-5">{TABS.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.label} <span className="text-xs opacity-60">{count(t.v)}</span></TabsTrigger>)}</TabsList></Tabs>
      {q.isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState icon={<ClipboardList />} title="Nothing here" description={tab === "open" ? "You're all caught up 🎉" : undefined} /> : <div className="space-y-2">{items.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
    </div>
  );
}
