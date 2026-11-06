"use client";
import * as React from "react";
import { AuthService, useRpcQuery, type Me } from "@lms/api-client";

type Session = { me?: Me; loading: boolean; refetch: () => void };
const Ctx = React.createContext<Session>({ loading: true, refetch: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const q = useRpcQuery(AuthService.method.getMe, {}, { retry: false, staleTime: 60_000, select: (r) => r.me });
  return <Ctx.Provider value={{ me: q.data, loading: q.isLoading, refetch: () => void q.refetch() }}>{children}</Ctx.Provider>;
}

export const useSession = () => React.useContext(Ctx);
