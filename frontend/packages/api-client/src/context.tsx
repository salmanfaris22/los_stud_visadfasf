"use client";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { DescMethod, DescMethodUnary, DescService } from "@bufbuild/protobuf";
import { createConnectQueryKey, TransportProvider } from "@connectrpc/connect-query";
import type { Api } from "./client";

const Ctx = React.createContext<Api | null>(null);

/** Makes the app's API client and its gRPC transport available to pages and shared components. */
export function ApiProvider({ api, children }: { api: Api; children: React.ReactNode }) {
  return (
    <Ctx.Provider value={api}>
      <TransportProvider transport={api.transport}>{children}</TransportProvider>
    </Ctx.Provider>
  );
}

export function useApi(): Api {
  const api = React.useContext(Ctx);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}

/** What to refetch after a change: a whole gRPC service, or one method (every input). */
export type InvalidateTarget = DescService | DescMethod;

/** Refetches every cached query of the given services / methods. */
export function invalidateRpc(qc: QueryClient, ...targets: InvalidateTarget[]) {
  return Promise.all(targets.map((t) => qc.invalidateQueries({ queryKey: rpcKey(t) })));
}

function rpcKey(schema: InvalidateTarget) {
  if (schema.kind === "service") return createConnectQueryKey({ schema, cardinality: undefined });
  if (schema.methodKind !== "unary") throw new Error(`cannot invalidate streaming method ${schema.name}`);
  return createConnectQueryKey({ schema: schema as DescMethodUnary, cardinality: undefined });
}
