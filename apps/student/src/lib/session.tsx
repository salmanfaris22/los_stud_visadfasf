"use client";
import * as React from "react";
import type { Schemas } from "@lms/api-client";
import { $api } from "./api";

type Session = { me?: Schemas["Me"]; loading: boolean; refetch: () => void };
const Ctx = React.createContext<Session>({ loading: true, refetch: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const q = $api.useQuery("get", "/api/v1/auth/me", {}, { retry: false, staleTime: 60_000 });
  return <Ctx.Provider value={{ me: q.data, loading: q.isLoading, refetch: () => void q.refetch() }}>{children}</Ctx.Provider>;
}

export const useSession = () => React.useContext(Ctx);
