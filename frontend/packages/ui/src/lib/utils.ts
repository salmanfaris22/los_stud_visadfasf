import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 3725 → "1:02:05", 95 → "1:35" */
export function formatDuration(seconds?: number | null) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** 3725 → "1h 2m" */
export function formatHours(seconds?: number | null) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A date from the API: an ISO string, a Date, or a protobuf Timestamp ({seconds, nanos}). */
export type DateLike = string | Date | { seconds: bigint; nanos: number } | null | undefined;

/** Converts any DateLike to a Date (null when empty or invalid). */
export function toDate(v: DateLike): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : new Date(Number(v.seconds) * 1000 + Math.floor(v.nanos / 1e6));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Like new Date(v) for API dates: an Invalid Date when empty. */
export function asDate(v: DateLike): Date {
  return toDate(v) ?? new Date(Number.NaN);
}

export function formatDate(v?: DateLike, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, opts) : "";
}

export function formatDateTime(v?: DateLike) {
  const d = toDate(v);
  return d ? d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
}

export function formatTime(v?: DateLike) {
  const d = toDate(v);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
}

/** "3 minutes ago", "in 2 days" */
export function timeAgo(v?: DateLike) {
  const d = toDate(v);
  if (!d) return "";
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}

export function initials(name?: string | null) {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function formatBytes(v?: number | bigint | null) {
  const n = Number(v ?? 0);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Value for <input type="datetime-local"> from an API date (local time). */
export function toLocalInput(v?: DateLike) {
  const d = toDate(v);
  if (!d) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** ISO string from a datetime-local value. */
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : "";
}

/** Paise (bigint from the API, or a number) → "₹1,499". */
export function formatRupees(paise?: bigint | number | null) {
  const n = Number(paise ?? 0) / 100;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
}
