"use client";
import * as React from "react";
import { Activity, AlertTriangle, Cpu, Database, Gauge, HardDrive, MemoryStick, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Skeleton, Tabs, TabsList, TabsTrigger, cn } from "@lms/ui";
import { ServerService, errorMessage, useRpcQuery } from "@lms/api-client";

import { MachineChart, NetworkChart, PeopleChart, SpeedChart, TrafficChart } from "@/features/server/charts";
import { PERIODS, bytes, ms, num, pct, type Period } from "@/features/server/format";
import { ActivityCard, DatabaseCard, EndpointsCard, MachineCard, OnlineCard, RequestsCard, Tile } from "@/features/server/sections";
import { useSession } from "@/lib/session";

/** Server monitor: the machine, API speed, the database and who is online. Refreshes every 10 s. */
export default function ServerPage() {
  const { can } = useSession();
  const [period, setPeriod] = React.useState<Period>("1h");
  const q = useRpcQuery(ServerService.method.getServerOverview, { period }, { select: (r) => r.overview, refetchInterval: 10_000, placeholderData: (prev) => prev });
  const o = q.data;
  const s = o?.system;
  const label = PERIODS.find((p) => p.value === period)?.label ?? period;

  return (
    <>
      <PageHeader title="Server" description="Live health of the machine, the API and the database. Updates every 10 seconds."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <LiveDot ok={!q.isError} at={q.dataUpdatedAt} />
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList>{PERIODS.map((p) => <TabsTrigger key={p.value} value={p.value}>{p.value}</TabsTrigger>)}</TabsList>
            </Tabs>
          </div>
        } />

      {q.isError && !o && <Card className="mb-6 border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{errorMessage(q.error)}</CardContent></Card>}
      {!o ? <Skeleton className="h-[520px] rounded-[24px]" /> : (
        <div className="space-y-6 [&_.grid>*]:min-w-0">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="CPU" icon={<Cpu />} value={`${(s?.cpuPct ?? 0).toFixed(0)}%`} meter={s?.cpuPct ?? 0}
              hint={`load ${(s?.load1 ?? 0).toFixed(2)} · ${s?.cores ?? 0} cores`} />
            <Tile label="RAM" icon={<MemoryStick />} value={`${pct(s?.memUsedBytes ?? 0, s?.memTotalBytes ?? 0).toFixed(0)}%`} meter={pct(s?.memUsedBytes ?? 0, s?.memTotalBytes ?? 0)}
              hint={`${bytes(s?.memUsedBytes)} of ${bytes(s?.memTotalBytes)}`} tone="info" />
            <Tile label="Disk" icon={<HardDrive />} value={`${pct(s?.diskUsedBytes ?? 0, s?.diskTotalBytes ?? 0).toFixed(0)}%`} meter={pct(s?.diskUsedBytes ?? 0, s?.diskTotalBytes ?? 0)}
              hint={`${bytes(s?.diskUsedBytes)} of ${bytes(s?.diskTotalBytes)}`} tone="warning" />
            <Tile label="API speed (5 min)" icon={<Gauge />} value={ms(o.recent?.avgMs)} tone="success"
              hint={`p95 ${ms(o.recent?.p95Ms)} · slowest ${ms(o.recent?.maxMs)}`} />
            <Tile label="Requests / minute" icon={<Activity />} value={num(o.perMinute)}
              hint={`${num(o.traffic?.requests)} in the last ${label}`} />
            <Tile label={`Server errors (${period})`} icon={<AlertTriangle />} value={num(o.traffic?.err5xx)} tone={o.traffic?.err5xx ? "destructive" : "success"}
              hint={`${num(o.traffic?.err4xx)} refused (4xx: sign-in, not found, invalid)`} />
            <Tile label="Online now" icon={<Users />} value={num(o.online?.total)} tone="info"
              hint={`${o.online?.staff ?? 0} staff · ${o.online?.students ?? 0} students · ${o.api?.openStreams ?? 0} open tabs`} />
            <Tile label="Database" icon={<Database />} value={o.database?.up ? bytes(o.database.sizeBytes) : "down"} tone={o.database?.up ? "success" : "destructive"}
              hint={o.database?.up ? `ping ${ms(o.database.pingMs)} · ${o.database.connections} connections` : "Postgres is not answering"} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Requests" description={`OK, refused (4xx) and failed (5xx) calls · last ${label}`}><TrafficChart points={o.points} period={period} /></ChartCard>
            <ChartCard title="Response time" description="Average and p95 per point, in milliseconds"><SpeedChart points={o.points} period={period} /></ChartCard>
            <ChartCard title="CPU and memory" description="Percent of the machine in use"><MachineChart points={o.points} period={period} /></ChartCard>
            <ChartCard title="People and connections" description="Online users, open app tabs and database connections"><PeopleChart points={o.points} period={period} /></ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <MachineCard o={o} />
            <ChartCard title="Network" description="Traffic in and out of the machine"><NetworkChart points={o.points} period={period} /></ChartCard>
          </div>

          <EndpointsCard period={period} />
          <RequestsCard />
          <DatabaseCard />

          <div className={cn("grid gap-6", can("audit") && "xl:grid-cols-2")}>
            <OnlineCard />
            {can("audit") && <ActivityCard />}
          </div>
        </div>
      )}
    </>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Green pulsing dot with the last update time; red when the API stopped answering. */
function LiveDot({ ok, at }: { ok: boolean; at: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <span className="relative flex size-2.5">
        {ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />}
        <span className={cn("relative inline-flex size-2.5 rounded-full", ok ? "bg-success" : "bg-destructive")} />
      </span>
      {ok ? (at ? `Live · ${new Date(at).toLocaleTimeString()}` : "Live") : "API not answering"}
    </span>
  );
}
