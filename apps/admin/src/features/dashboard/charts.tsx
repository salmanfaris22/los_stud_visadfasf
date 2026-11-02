"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Schemas } from "@lms/api-client";

const tooltip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" } };

export function ActivityChart({ data }: { data: Schemas["DayPoint"][] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="sub" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
          <linearGradient id="app" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <Tooltip {...tooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="submitted" name="Submitted" stroke="var(--primary)" fill="url(#sub)" strokeWidth={2} />
        <Area type="monotone" dataKey="approved" name="Approved" stroke="var(--success)" fill="url(#app)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CourseProgressChart({ data }: { data: Schemas["CourseStat"][] }) {
  const rows = data.map((c) => ({ name: c.title.length > 22 ? c.title.slice(0, 21) + "…" : c.title, progress: c.avg_progress, students: c.students }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} unit="%" />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip {...tooltip} formatter={(v) => `${v ?? 0}%`} />
        <Bar dataKey="progress" name="Avg progress" fill="var(--primary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
