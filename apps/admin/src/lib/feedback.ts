"use client";
import type { QueryClient } from "@tanstack/react-query";
import { errorMessage, type InvalidateTarget } from "@lms/api-client";
import { toast } from "@lms/ui";
import { invalidate } from "./api";

/** Standard mutation callbacks: toast, refresh affected lists, then run `after`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function feedback<T = any>(qc: QueryClient, success: string | null, paths: InvalidateTarget[], after?: (data: T) => void) {
  return {
    onSuccess: (data: T) => {
      if (success) toast.success(success);
      void invalidate(qc, ...paths);
      after?.(data);
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e));
    },
  };
}

/** Downloads a file endpoint (CSV / PDF / ICS) through the session-aware client. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(path, { credentials: "include", headers: { "X-LMS-App": "admin" } });
  if (!res.ok) {
    toast.error("Download failed");
    return;
  }
  const blob = await res.blob();
  const name = /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
