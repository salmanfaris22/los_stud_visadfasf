import type { Timestamp } from "@lms/api-client";
import { formatBytes } from "@lms/ui";

export type Period = "1h" | "24h" | "7d" | "30d";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export const toDate = (t?: Timestamp) => (t ? new Date(Number(t.seconds) * 1000 + Math.floor(t.nanos / 1e6)) : undefined);

/** 0.4 → "<1 ms", 7.25 → "7.3 ms", 180 → "180 ms", 2400 → "2.40 s". */
export function ms(v?: number) {
  if (!v) return "0 ms";
  if (v < 1) return "<1 ms";
  if (v < 10) return `${v.toFixed(1)} ms`;
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

export const bytes = (v?: number) => formatBytes(v ?? 0);
export const rate = (v?: number) => `${formatBytes(v ?? 0)}/s`;
export const pct = (used: number, total: number) => (total > 0 ? (used * 100) / total : 0);
export const num = (v?: number) => (v ?? 0).toLocaleString();

/** Time since a date, two units: "3 d 4 h", "5 h 12 m", "4 m", "20 s". */
export function since(d?: Date) {
  if (!d) return "—";
  let s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const days = Math.floor(s / 86400); s -= days * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (days) return `${days} d ${h} h`;
  if (h) return `${h} h ${m} m`;
  if (m) return `${m} m`;
  return `${s} s`;
}

/** Chart axis label for a point time. */
export function pointLabel(d: Date, period: Period) {
  return period === "1h" || period === "24h"
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "/lms.v1.AuthService/Login" → "Auth · Login". */
export function endpointName(service: string, method: string) {
  return { service: service.replace(/Service$/, ""), method };
}

export function statusVariant(status: number): "success" | "warning" | "destructive" | "secondary" {
  if (status >= 500) return "destructive";
  if (status >= 400) return "warning";
  if (status >= 200 && status < 300) return "success";
  return "secondary";
}
