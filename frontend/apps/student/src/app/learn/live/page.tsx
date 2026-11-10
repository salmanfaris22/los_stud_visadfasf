"use client";
import * as React from "react";
import { Video } from "lucide-react";
import { EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@lms/ui";

import { LiveCard } from "@/features/learn/cards";
import { LiveService, useRpcQuery } from "@lms/api-client";

export default function LivePage() {
  const up = useRpcQuery(LiveService.method.listMyLive, { scope: "upcoming" }, { refetchInterval: 60_000 });
  const past = useRpcQuery(LiveService.method.listMyLive, { scope: "past" });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Live classes</h1>
      <p className="mb-6 text-muted-foreground">Join on Google Meet. The Join button opens 30 minutes before start.</p>
      <Tabs defaultValue="upcoming">
        <TabsList><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="past">Past & recordings</TabsTrigger></TabsList>
        <TabsContent value="upcoming">{up.isLoading ? <Skeleton className="h-48" /> : up.data?.items.length === 0 ? <EmptyState icon={<Video />} title="No upcoming classes" /> : <div className="space-y-3">{up.data?.items.map((s) => <LiveCard key={s.id} s={s} />)}</div>}</TabsContent>
        <TabsContent value="past">{past.isLoading ? <Skeleton className="h-48" /> : past.data?.items.length === 0 ? <EmptyState icon={<Video />} title="No past classes yet" /> : <div className="space-y-3">{past.data?.items.map((s) => <LiveCard key={s.id} s={s} past />)}</div>}</TabsContent>
      </Tabs>
    </div>
  );
}
