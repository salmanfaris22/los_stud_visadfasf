"use client";
import { createApi, createClient, invalidateRpc, type DescService, type InvalidateTarget } from "@lms/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** gRPC client for the admin portal (cookies: lms_admin_*). */
export const api = createApi({
  app: "admin",
  onUnauthorized: () => {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  },
});

/** A typed client for one service, for calls outside hooks: rpc(StudentService).exportStudents({}). */
export const rpc = <S extends DescService>(service: S) => createClient(service, api.transport);

/** Refetch every query of the given services / methods. */
export const invalidate = (qc: QueryClient, ...targets: InvalidateTarget[]) => invalidateRpc(qc, ...targets);
