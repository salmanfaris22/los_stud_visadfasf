import { Code, ConnectError, createClient, type Interceptor, type Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "./gen/lms/v1/auth_pb";

/** Auth RPCs that must never trigger a token refresh. */
const NO_REFRESH = new Set(["Login", "Register", "Refresh", "Logout", "ForgotPassword", "ResetPassword"]);

export interface RpcOptions {
  app: "admin" | "student";
  /** Empty in the browser: Next.js rewrites /rpc to the Go server. */
  baseUrl?: string;
  onUnauthorized?: () => void;
}

/**
 * Connect transport for the gRPC API at `${baseUrl}/rpc`.
 * Every call carries X-LMS-App (picks the portal's cookies). When a call fails with
 * Unauthenticated, the session is refreshed once (shared between parallel calls) and the call is retried.
 */
export function createRpc({ app, baseUrl = "", onUnauthorized }: RpcOptions) {
  const appHeader: Interceptor = (next) => (req) => {
    req.header.set("X-LMS-App", app);
    return next(req);
  };
  // The refresh client has no retry interceptor, so a failed refresh cannot loop.
  const plain = createConnectTransport({ baseUrl: `${baseUrl}/rpc`, interceptors: [appHeader] });
  const auth = createClient(AuthService, plain);

  let refreshing: Promise<boolean> | null = null;
  const refresh = () => {
    refreshing ??= auth
      .refresh({})
      .then(() => true)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
    return refreshing;
  };

  const isUnauthenticated = (e: unknown) => ConnectError.from(e).code === Code.Unauthenticated;

  const retryAfterRefresh: Interceptor = (next) => async (req) => {
    try {
      return await next(req);
    } catch (e) {
      if (req.stream || NO_REFRESH.has(req.method.name) || !isUnauthenticated(e)) throw e;
      if (!(await refresh())) {
        onUnauthorized?.();
        throw e;
      }
      try {
        return await next(req);
      } catch (e2) {
        if (isUnauthenticated(e2)) onUnauthorized?.();
        throw e2;
      }
    }
  };

  const transport: Transport = createConnectTransport({ baseUrl: `${baseUrl}/rpc`, interceptors: [appHeader, retryAfterRefresh] });
  return { transport, refresh };
}
