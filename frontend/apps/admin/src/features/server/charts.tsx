"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ServerPoint } from "@lms/api-client";

import { ms, pointLabel, rate, toDate, type Period } from "./format";

const tooltip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--popover-foreground)", boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.25)", fontSize: 12 },
  labelStyle: { fontWeight: 700, marginBottom: 4 },
};
const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;
const legend = { iconType: "circle" as const, wrapperStyle: { fontSize: 12, fontWeight: 600 } };
const H = 230;

function rows(points: ServerPoint[], period: Period) {
  return points.map((p) => {
    const at = toDate(p.at) ?? new Date();
    return {
      label: pointLabel(at, period),
      ok: Math.max(0, p.requests - p.err4xx - p.err5xx), e4: p.err4xx, e5: p.err5xx,
      avg: p.requests ? p.avgMs : null, p95: p.requests ? p.p95Ms : null,
      cpu: p.hasSample ? p.cpuPct : null, mem: p.hasSample ? p.memPct : null, swap: p.hasSample ? p.swapPct : null,
      online: p.hasSample ? p.online : null, conns: p.hasSample ? p.dbConns : null, tabs: p.hasSample ? p.openStreams : null,
      rx: p.hasSample ? p.netRxRate : null, tx: p.hasSample ? p.netTxRate : null,
    };
  });
}

export function TrafficChart({ points, period }: { points: ServerPoint[]; period: Period }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={rows(points, period)} margin={{ left: -18, right: 6, top: 8 }} barCategoryGap="18%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Legend {...legend} />
        <Bar dataKey="ok" name="OK" stackId="r" fill="var(--line-2)" />
        <Bar dataKey="e4" name="4xx" stackId="r" fill="var(--line-4)" />
        <Bar dataKey="e5" name="5xx" stackId="r" fill="var(--line-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpeedChart({ points, period }: { points: ServerPoint[]; period: Period }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={rows(points, period)} margin={{ left: -6, right: 6, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis {...axis} tickFormatter={(v: number) => ms(v)} width={56} />
        <Tooltip {...tooltip} formatter={(v) => ms(Number(v))} />
        <Legend {...legend} />
        <Line type="monotone" dataKey="avg" name="Average" stroke="var(--line-2)" strokeWidth={2.5} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="p95" name="p95 (95% faster than)" stroke="var(--line-4)" strokeWidth={2.5} dot={false} strokeDasharray="5 4" connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MachineChart({ points, period }: { points: ServerPoint[]; period: Period }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <AreaChart data={rows(points, period)} margin={{ left: -18, right: 6, top: 8 }}>
        <defs>
          <linearGradient id="srv-cpu" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--line-5)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--line-5)" stopOpacity={0} /></linearGradient>
          <linearGradient id="srv-mem" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--line-6)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--line-6)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis domain={[0, 100]} unit="%" {...axis} />
        <Tooltip {...tooltip} formatter={(v) => `${Number(v).toFixed(1)}%`} />
        <Legend {...legend} />
        <Area type="monotone" dataKey="cpu" name="CPU" stroke="var(--line-5)" fill="url(#srv-cpu)" strokeWidth={2.5} connectNulls={false} />
        <Area type="monotone" dataKey="mem" name="RAM" stroke="var(--line-6)" fill="url(#srv-mem)" strokeWidth={2.5} connectNulls={false} />
        <Area type="monotone" dataKey="swap" name="Swap" stroke="var(--line-4)" fill="none" strokeWidth={1.5} strokeDasharray="4 4" connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PeopleChart({ points, period }: { points: ServerPoint[]; period: Period }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={rows(points, period)} margin={{ left: -18, right: 6, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltip} />
        <Legend {...legend} />
        <Line type="stepAfter" dataKey="online" name="Online users" stroke="var(--line-3)" strokeWidth={2.5} dot={false} connectNulls={false} />
        <Line type="stepAfter" dataKey="tabs" name="Open tabs" stroke="var(--line-5)" strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="stepAfter" dataKey="conns" name="DB connections" stroke="var(--line-6)" strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function NetworkChart({ points, period }: { points: ServerPoint[]; period: Period }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <AreaChart data={rows(points, period)} margin={{ left: 0, right: 6, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis {...axis} tickFormatter={(v: number) => rate(v)} width={72} />
        <Tooltip {...tooltip} formatter={(v) => rate(Number(v))} />
        <Legend {...legend} />
        <Area type="monotone" dataKey="rx" name="In" stroke="var(--line-2)" fill="var(--line-2)" fillOpacity={0.12} strokeWidth={2} connectNulls={false} />
        <Area type="monotone" dataKey="tx" name="Out" stroke="var(--line-3)" fill="var(--line-3)" fillOpacity={0.12} strokeWidth={2} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
