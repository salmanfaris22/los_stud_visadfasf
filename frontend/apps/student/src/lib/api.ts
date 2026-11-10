"use client";
import { createApi, createClient, invalidateRpc, type DescService, type InvalidateTarget } from "@lms/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** gRPC client for the student portal (cookies: lms_student_*). */
export const api = createApi({
  app: "student",
  onUnauthorized: () => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/learn")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  },
});

/** A typed client for one service, for calls outside hooks. */
export const rpc = <S extends DescService>(service: S) => createClient(service, api.transport);

/** Refetch every query of the given services / methods. */
export const invalidate = (qc: QueryClient, ...targets: InvalidateTarget[]) => invalidateRpc(qc, ...targets);
