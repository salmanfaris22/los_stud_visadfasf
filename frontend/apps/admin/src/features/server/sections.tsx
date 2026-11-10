"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Database, ScrollText, Users } from "lucide-react";
import {
  Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton, TBody, TD, TH, THead, TR, Table,
  Tabs, TabsList, TabsTrigger, cn, formatDateTime, timeAgo,
} from "@lms/ui";
import { AdminService, ServerService, useRpcQuery, type ServerOverview } from "@lms/api-client";

import { bytes, endpointName, ms, num, rate, since, statusVariant, toDate, type Period } from "./format";

const REFRESH = 10_000;

/* ── tiles ── */

const tones = {
  primary: "bg-signal/25 text-foreground dark:text-signal", success: "bg-success/12 text-success", warning: "bg-warning/15 text-warning",
  info: "bg-info/12 text-info", destructive: "bg-destructive/12 text-destructive",
};

export function Tile({ label, icon, value, hint, meter, tone = "primary" }: {
  label: string; icon: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; meter?: number; tone?: keyof typeof tones;
}) {
  return (
    <div className="rounded-[20px] border bg-card p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("rounded-full p-2 [&_svg]:size-4", tones[tone])}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-[28px] leading-none font-extrabold tabular-nums">{value}</div>
      {meter !== undefined && <Meter value={meter} />}
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Thin usage bar: violet, amber from 75 %, red from 90 %. */
export function Meter({ value, className }: { value: number; className?: string }) {
  const v = Math.min(100, Math.max(0, value));
  const color = v >= 90 ? "var(--destructive)" : v >= 75 ? "var(--warning)" : "var(--line-5)";
  return (
    <div className={cn("mt-3 h-1.5 overflow-hidden rounded-full bg-muted", className)} role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

/* ── this machine ── */

export function MachineCard({ o }: { o: ServerOverview }) {
  const s = o.system, a = o.api;
  const facts: [string, React.ReactNode][] = [
    ["Host", s?.host || "—"],
    ["System", s?.os || "—"],
    ["CPU", `${s?.cores ?? 0} cores · ${s?.arch ?? ""}`],
    ["Load (1 / 5 / 15 m)", `${(s?.load1 ?? 0).toFixed(2)} / ${(s?.load5 ?? 0).toFixed(2)} / ${(s?.load15 ?? 0).toFixed(2)}`],
    ["Machine up", since(toDate(s?.bootTime))],
    ["API up", since(toDate(a?.startedAt))],
    ["API build", <span key="v" className="font-mono">{a?.version || "dev"}</span>],
    ["Go", a?.goVersion || "—"],
    ["API memory", `${bytes(a?.rssBytes)} (heap ${bytes(a?.heapBytes)})`],
    ["Goroutines", num(a?.goroutines)],
    ["Network", `↓ ${rate(s?.netRxRate)} · ↑ ${rate(s?.netTxRate)}`],
    ["Swap", s?.swapTotalBytes ? `${bytes(s.swapUsedBytes)} of ${bytes(s.swapTotalBytes)}` : "none"],
  ];
  return (
    <Card>
      <CardHeader><CardTitle>This machine</CardTitle><CardDescription>Read every 10 seconds by the API itself.</CardDescription></CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2 last:border-0">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="truncate text-right font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/* ── endpoints ── */

type Sort = "busy" | "slow" | "errors";

export function EndpointsCard({ period }: { period: Period }) {
  const [sort, setSort] = React.useState<Sort>("busy");
  const [all, setAll] = React.useState(false);
  const q = useRpcQuery(ServerService.method.listEndpointStats, { period, sort }, { select: (r) => r.items, refetchInterval: REFRESH });
  const items = q.data ?? [];
  const shown = all ? items : items.slice(0, 12);
  const slowest = Math.max(1, ...items.map((e) => e.p95Ms));
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle>API speed by endpoint</CardTitle><CardDescription>Every call to the API in this period. p95 = 95 % of calls were faster.</CardDescription></div>
        <Tabs value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <TabsList><TabsTrigger value="busy">Busiest</TabsTrigger><TabsTrigger value="slow">Slowest</TabsTrigger><TabsTrigger value="errors">Errors</TabsTrigger></TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState title="No calls yet" description="Numbers appear as soon as the API gets traffic." /> : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <THead><TR><TH>Endpoint</TH><TH className="text-right">Calls</TH><TH className="text-right">4xx</TH><TH className="text-right">5xx</TH><TH className="text-right">Avg</TH><TH className="w-[26%]">p95</TH><TH className="text-right">Max</TH></TR></THead>
                <TBody>
                  {shown.map((e) => {
                    const n = endpointName(e.service, e.method);
                    return (
                      <TR key={e.procedure}>
                        <TD><span className="text-muted-foreground">{n.service} · </span><span className="font-semibold">{n.method}</span></TD>
                        <TD className="text-right tabular-nums">{num(e.calls)}</TD>
                        <TD className={cn("text-right tabular-nums", e.err4xx ? "text-warning" : "text-muted-foreground")}>{num(e.err4xx)}</TD>
                        <TD className={cn("text-right tabular-nums", e.err5xx ? "font-bold text-destructive" : "text-muted-foreground")}>{num(e.err5xx)}</TD>
                        <TD className="text-right whitespace-nowrap tabular-nums">{ms(e.avgMs)}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Meter value={(e.p95Ms * 100) / slowest} className="mt-0 flex-1" />
                            <span className="w-16 text-right text-xs whitespace-nowrap tabular-nums">{ms(e.p95Ms)}</span>
                          </div>
                        </TD>
                        <TD className="text-right whitespace-nowrap text-muted-foreground tabular-nums">{ms(e.maxMs)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            {items.length > 12 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${items.length}`}</Button>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── requests ── */

type Kind = "live" | "slow" | "failed";

export function RequestsCard() {
  const [kind, setKind] = React.useState<Kind>("live");
  const q = useRpcQuery(ServerService.method.listRecentRequests, { kind, limit: 50 }, { select: (r) => r.items, refetchInterval: kind === "live" ? 5_000 : REFRESH });
  const items = q.data ?? [];
  const empty = { live: "No requests yet.", slow: "Nothing took 1 second or more in the last 30 days.", failed: "No server errors (5xx) in the last 30 days." }[kind];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Requests</CardTitle><CardDescription>Live = the latest 50. Slow (1 s+) and failed (5xx) are kept for 30 days.</CardDescription></div>
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList><TabsTrigger value="live">Live</TabsTrigger><TabsTrigger value="slow">Slow</TabsTrigger><TabsTrigger value="failed">Failed</TabsTrigger></TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState title={empty} /> : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <THead className="sticky top-0 z-10 bg-card"><TR><TH>Time</TH><TH>Endpoint</TH><TH>Status</TH><TH className="text-right">Time taken</TH><TH>User</TH><TH>IP</TH></TR></THead>
              <TBody>
                {items.map((r, i) => {
                  const [svc, method] = r.procedure.startsWith("/") ? r.procedure.slice(1).replace("lms.v1.", "").split("/") : ["HTTP", r.procedure];
                  return (
                    <TR key={`${r.procedure}-${i}`}>
                      <TD className="whitespace-nowrap text-muted-foreground tabular-nums">{toDate(r.at)?.toLocaleTimeString()}</TD>
                      <TD className="whitespace-nowrap"><span className="text-muted-foreground">{(svc ?? "").replace(/Service$/, "")} · </span><span className="font-semibold">{method}</span></TD>
                      <TD><Badge variant={statusVariant(r.status)}>{r.status}{r.code ? ` ${r.code.replace(/_/g, " ")}` : ""}</Badge></TD>
                      <TD className={cn("text-right whitespace-nowrap tabular-nums", r.ms >= 1000 && "font-bold text-destructive", r.ms >= 300 && r.ms < 1000 && "text-warning")}>{ms(r.ms)}</TD>
                      <TD className="whitespace-nowrap">{r.userName || <span className="text-muted-foreground">—</span>}</TD>
                      <TD className="font-mono text-xs text-muted-foreground">{r.ip}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── database ── */

export function DatabaseCard() {
  const q = useRpcQuery(ServerService.method.getDatabaseStats, {}, { select: (r) => r.database, refetchInterval: REFRESH });
  const d = q.data;
  if (q.isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-80" /></CardContent></Card>;
  if (!d?.up) return <Card><CardContent className="p-6"><EmptyState icon={<Database />} title="Postgres is not answering" description="The API cannot reach the database right now." /></CardContent></Card>;
  const facts: [string, React.ReactNode][] = [
    ["Version", `PostgreSQL ${d.version}`],
    ["Database", d.name],
    ["Up", since(toDate(d.startedAt))],
    ["Size", bytes(d.sizeBytes)],
    ["Cache hits", `${d.cacheHitPct.toFixed(1)} %`],
    ["Connections", `${d.connections} of ${d.maxConnections}`],
    ["Commits / rollbacks", `${num(d.commits)} / ${num(d.rollbacks)}`],
    ["Deadlocks", num(d.deadlocks)],
    ["API pool", `${d.pool?.inUse ?? 0} busy · ${d.pool?.idle ?? 0} idle · max ${d.pool?.max ?? 0}`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Database <Badge variant="success">up</Badge></CardTitle>
        <CardDescription>Postgres numbers since it started (or since its stats were last reset).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2">
              <dt className="shrink-0 text-muted-foreground">{k}</dt><dd className="truncate text-right font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold">Database users</h3>
            <Table>
              <THead><TR><TH>Login role</TH><TH className="text-right">Open</TH><TH className="text-right">Busy</TH><TH className="text-right">Idle</TH><TH className="text-right">Stuck in tx</TH></TR></THead>
              <TBody>
                {d.users.map((u) => (
                  <TR key={u.name}>
                    <TD className="font-semibold">{u.name} {u.superuser && <Badge variant="secondary" className="ml-1">superuser</Badge>}</TD>
                    <TD className="text-right tabular-nums">{u.connections}</TD>
                    <TD className="text-right tabular-nums">{u.active}</TD>
                    <TD className="text-right text-muted-foreground tabular-nums">{u.idle}</TD>
                    <TD className={cn("text-right tabular-nums", u.idleInTx ? "font-bold text-warning" : "text-muted-foreground")}>{u.idleInTx}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">Biggest tables</h3>
            <div className="max-h-[340px] overflow-auto">
              <Table>
                <THead><TR><TH>Table</TH><TH className="text-right">Rows</TH><TH className="text-right">Size</TH><TH className="text-right">Dead rows</TH><TH>Last vacuum</TH></TR></THead>
                <TBody>
                  {d.tables.map((t) => (
                    <TR key={t.name}>
                      <TD className="font-mono text-xs">{t.name}</TD>
                      <TD className="text-right tabular-nums">{num(t.rows)}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">{bytes(t.sizeBytes)}</TD>
                      <TD className={cn("text-right tabular-nums", t.rows > 0 && t.deadRows > t.rows * 0.2 ? "text-warning" : "text-muted-foreground")}>{num(t.deadRows)}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{t.lastVacuum ? timeAgo(t.lastVacuum) : "never"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold">Running now</h3>
          {d.running.length === 0 ? <p className="text-sm text-muted-foreground">No other statements running.</p> : (
            <div className="overflow-x-auto"><Table>
              <THead><TR><TH>PID</TH><TH>User</TH><TH>State</TH><TH className="text-right">For</TH><TH>Statement</TH></TR></THead>
              <TBody>
                {d.running.map((r) => (
                  <TR key={r.pid}>
                    <TD className="font-mono text-xs">{r.pid}</TD>
                    <TD>{r.user}</TD>
                    <TD><Badge variant={r.state === "active" ? "info" : "warning"}>{r.state}</Badge>{r.wait && <span className="ml-1 text-xs text-muted-foreground">{r.wait}</span>}</TD>
                    <TD className={cn("text-right tabular-nums", r.seconds > 5 && "font-bold text-destructive")}>{r.seconds.toFixed(1)} s</TD>
                    <TD className="max-w-[420px] truncate font-mono text-xs text-muted-foreground" title={r.query}>{r.query}</TD>
                  </TR>
                ))}
              </TBody>
            </Table></div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── online users ── */

export function OnlineCard() {
  const q = useRpcQuery(ServerService.method.listOnlineUsers, {}, { select: (r) => r.items, refetchInterval: REFRESH });
  const items = q.data ?? [];
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Online now</CardTitle><CardDescription>Used the app in the last 5 minutes, or has it open.</CardDescription></CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-48" /> : items.length === 0 ? <EmptyState icon={<Users />} title="Nobody online" /> : (
          <ul className="max-h-[420px] space-y-1 overflow-auto">
            {items.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-muted/60">
                <span className="relative">
                  <Avatar src={u.avatarUrl} name={u.name} className="size-9" />
                  <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card", u.tabs > 0 ? "bg-success" : "bg-warning")} title={u.tabs > 0 ? "App open" : "Recently active"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold">{u.name}<Badge variant={u.kind === "staff" ? "default" : "secondary"}>{u.kind}</Badge></div>
                  <div className="truncate text-xs text-muted-foreground">{u.email} · {u.ip}</div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{timeAgo(u.lastSeen)}</div>
                  <div>{u.tabs > 0 ? `${u.tabs} tab${u.tabs > 1 ? "s" : ""} · ` : ""}{num(u.requests)} req</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── recent admin activity (audit log) ── */

export function ActivityCard() {
  const q = useRpcQuery(AdminService.method.listAuditLog, { page: 1, perPage: 8 }, { refetchInterval: REFRESH });
  const items = q.data?.items ?? [];
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle>Recent admin activity</CardTitle><CardDescription>The latest changes from the audit log.</CardDescription></div>
        <Button asChild variant="ghost" size="sm"><Link href="/audit">Audit log <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-48" /> : items.length === 0 ? <EmptyState icon={<ScrollText />} title="No activity yet" /> : (
          <div className="overflow-x-auto"><Table>
            <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Area</TH><TH>IP</TH></TR></THead>
            <TBody>
              {items.map((a) => (
                <TR key={String(a.id)}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt)}</TD>
                  <TD className="whitespace-nowrap">{a.actorName || <span className="text-muted-foreground">System</span>}</TD>
                  <TD><Badge variant={a.action === "delete" ? "destructive" : a.action === "create" ? "success" : "secondary"}>{a.action}</Badge></TD>
                  <TD className="capitalize">{a.entity.replace("_", " ")}</TD>
                  <TD className="font-mono text-xs text-muted-foreground">{a.ip}</TD>
                </TR>
              ))}
            </TBody>
          </Table></div>
        )}
      </CardContent>
    </Card>
  );
}

