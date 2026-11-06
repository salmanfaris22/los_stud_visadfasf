"use client";
import { createApi, invalidatePaths, type InvalidateTarget } from "@lms/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** Typed client for the admin portal (cookies: lms_admin_*). */
export const api = createApi({
  app: "admin",
  onUnauthorized: () => {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  },
});

export const $api = api.$api;

/** Refetch every query whose path starts with one of the given API paths. */
export const invalidate = (qc: QueryClient, ...paths: InvalidateTarget[]) => invalidatePaths(qc, ...paths);
