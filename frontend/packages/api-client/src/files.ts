import { timestampDate, timestampFromDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import type { File as FileMessage } from "./gen/lms/v1/common_pb";

/** Saves a file returned by an RPC (CSV export, certificate PDF, .ics) through the browser. */
export function saveFile(file: FileMessage | undefined, fallbackName = "download") {
  if (!file || typeof window === "undefined") return;
  const blob = new Blob([file.data as BlobPart], { type: file.contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name || fallbackName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A Timestamp for an RPC from an ISO string or Date ("" / null → unset). */
export function toTimestamp(v: string | Date | null | undefined): Timestamp | undefined {
  if (!v) return undefined;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? undefined : timestampFromDate(d);
}

/** ISO string of an RPC Timestamp (unset → ""). */
export function fromTimestamp(t: Timestamp | undefined): string {
  return t ? timestampDate(t).toISOString() : "";
}

/**
 * A plain, editable copy of a message type (no $typeName), for form state. A Draft can be
 * passed straight to an RPC as its input.
 */
export type Draft<T> = T extends { $typeName: string }
  ? { -readonly [K in keyof T as K extends "$typeName" | "$unknown" ? never : K]: Draft<T[K]> }
  : T extends readonly (infer U)[]
    ? Draft<U>[]
    : T extends { [k: string]: infer V } & object
      ? T extends (...args: never[]) => unknown ? T : { [k: string]: Draft<V> }
      : T;
