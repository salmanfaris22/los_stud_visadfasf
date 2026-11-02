"use client";
import * as React from "react";
import type { Schemas } from "@lms/api-client";
import { $api } from "./api";

type Me = Schemas["Me"];
type Session = { me?: Me; loading: boolean; can: (module: string, action?: string) => boolean; refetch: () => void };

const Ctx = React.createContext<Session>({ loading: true, can: () => false, refetch: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const q = $api.useQuery("get", "/api/v1/auth/me", {}, { retry: false, staleTime: 60_000 });
  const perms = React.useMemo(() => new Set(q.data?.permissions ?? []), [q.data]);
  const value: Session = {
    me: q.data,
    loading: q.isLoading,
    can: (module, action = "view") => !!q.data && (q.data.is_super_admin || perms.has(`${module}:${action}`)),
    refetch: () => void q.refetch(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => React.useContext(Ctx);

/** Renders children only when the user has the permission. */
export function Can({ module, action = "view", children, fallback = null }: { module: string; action?: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useSession();
  return <>{can(module, action) ? children : fallback}</>;
}
