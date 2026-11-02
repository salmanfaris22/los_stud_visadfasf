"use client";
import * as React from "react";
import { Video } from "lucide-react";
import { EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@lms/ui";
import { $api } from "@/lib/api";
import { LiveCard } from "@/features/learn/cards";

export default function LivePage() {
  const up = $api.useQuery("get", "/api/v1/me/live", { params: { query: { scope: "upcoming" } } }, { refetchInterval: 60_000 });
  const past = $api.useQuery("get", "/api/v1/me/live", { params: { query: { scope: "past" } } });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Live classes</h1>
      <p className="mb-6 text-muted-foreground">Join on Google Meet. The Join button opens 30 minutes before start.</p>
      <Tabs defaultValue="upcoming">
        <TabsList><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="past">Past & recordings</TabsTrigger></TabsList>
        <TabsContent value="upcoming">{up.isLoading ? <Skeleton className="h-48" /> : up.data?.length === 0 ? <EmptyState icon={<Video />} title="No upcoming classes" /> : <div className="space-y-3">{up.data?.map((s) => <LiveCard key={s.id} s={s} />)}</div>}</TabsContent>
        <TabsContent value="past">{past.isLoading ? <Skeleton className="h-48" /> : past.data?.length === 0 ? <EmptyState icon={<Video />} title="No past classes yet" /> : <div className="space-y-3">{past.data?.map((s) => <LiveCard key={s.id} s={s} past />)}</div>}</TabsContent>
      </Tabs>
    </div>
  );
}
