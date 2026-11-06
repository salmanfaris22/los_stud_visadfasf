"use client";
import { createApi, invalidatePaths, type InvalidateTarget } from "@lms/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** Typed client for the student portal (cookies: lms_student_*). */
export const api = createApi({
  app: "student",
  onUnauthorized: () => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/learn")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  },
});

export const $api = api.$api;
export const invalidate = (qc: QueryClient, ...paths: InvalidateTarget[]) => invalidatePaths(qc, ...paths);
