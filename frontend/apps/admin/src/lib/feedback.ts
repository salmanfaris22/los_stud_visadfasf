"use client";
import type { QueryClient } from "@tanstack/react-query";
import { errorMessage, saveFile, type File, type InvalidateTarget } from "@lms/api-client";
import { toast } from "@lms/ui";
import { invalidate } from "./api";

/** Standard mutation callbacks: toast, refresh affected lists, then run `after`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function feedback<T = any>(qc: QueryClient, success: string | null, targets: InvalidateTarget[], after?: (data: T) => void) {
  return {
    onSuccess: (data: T) => {
      if (success) toast.success(success);
      void invalidate(qc, ...targets);
      after?.(data);
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e));
    },
  };
}

/** Downloads a file RPC (CSV export, certificate PDF, .ics) with the admin session. */
export async function download(get: () => Promise<{ file?: File }>, fallbackName: string) {
  try {
    saveFile((await get()).file, fallbackName);
  } catch (e) {
    toast.error(errorMessage(e, "Download failed"));
  }
}
