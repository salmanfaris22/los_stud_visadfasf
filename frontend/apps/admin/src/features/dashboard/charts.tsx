"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CourseStat, DayPoint } from "@lms/api-client";
import { lineColor } from "@lms/ui";

const tooltip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--popover-foreground)", boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.25)" } };

export function ActivityChart({ data }: { data: DayPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="sub" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--line-2)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--line-2)" stopOpacity={0} /></linearGradient>
          <linearGradient id="app" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--line-3)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--line-3)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <Tooltip {...tooltip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
        <Area type="monotone" dataKey="submitted" name="Submitted" stroke="var(--line-2)" fill="url(#sub)" strokeWidth={3} strokeLinecap="round" />
        <Area type="monotone" dataKey="approved" name="Approved" stroke="var(--line-3)" fill="url(#app)" strokeWidth={3} strokeLinecap="round" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CourseProgressChart({ data }: { data: CourseStat[] }) {
  const rows = data.map((c) => ({ id: c.id, name: c.title.length > 22 ? c.title.slice(0, 21) + "…" : c.title, progress: c.avgProgress, students: c.students }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} unit="%" />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip {...tooltip} formatter={(v) => `${v ?? 0}%`} />
        <Bar dataKey="progress" name="Avg progress" radius={[0, 999, 999, 0]} barSize={14}>
          {rows.map((r) => <Cell key={r.id} fill={lineColor(r.id)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
