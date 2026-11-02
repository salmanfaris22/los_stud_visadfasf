"use client";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Api } from "./client";

const Ctx = React.createContext<Api | null>(null);

/** Makes the app's API client available to shared components. */
export function ApiProvider({ api, children }: { api: Api; children: React.ReactNode }) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApi(): Api {
  const api = React.useContext(Ctx);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}

type KeyInit = { params?: { path?: Record<string, string | number> } } | undefined;

/** The real URL path of a query key: "/api/v1/courses/{id}/curriculum" + {id: "42"} → "/api/v1/courses/42/curriculum". */
function concretePath(template: string, init: KeyInit) {
  const path = init?.params?.path ?? {};
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (path[k] !== undefined ? String(path[k]) : m));
}

/**
 * Refetch every query whose API path starts with one of the given prefixes.
 * Prefixes may be generic ("/api/v1/courses") or concrete ("/api/v1/courses/<id>"); both the templated
 * key and the filled-in path are compared, so record-specific refreshes work too.
 */
export function invalidatePaths(qc: QueryClient, ...paths: string[]) {
  return Promise.all(
    paths.map((p) =>
      qc.invalidateQueries({
        predicate: (q) => {
          const template = q.queryKey[1];
          if (typeof template !== "string") return false;
          return template.startsWith(p) || concretePath(template, q.queryKey[2] as KeyInit).startsWith(p);
        },
      }),
    ),
  );
}
