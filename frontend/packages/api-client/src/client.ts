import { createRpc } from "./transport";

export type App = "admin" | "student";

export interface ApiOptions {
  /** Which portal is calling: decides which auth cookies the API reads. */
  app: App;
  /** Empty in the browser (Next.js rewrites /rpc to the Go server). */
  baseUrl?: string;
  /** Called when the session cannot be refreshed. */
  onUnauthorized?: () => void;
}

/**
 * Creates the app's API client: a Connect transport for the gRPC API (use it with the
 * useRpcQuery / useRpcMutation hooks, or createClient(Service, api.transport)).
 * Expired sessions are refreshed once (shared between parallel calls) and the call is retried.
 */
export function createApi({ app, baseUrl = "", onUnauthorized }: ApiOptions) {
  const { transport, refresh } = createRpc({ app, baseUrl, onUnauthorized });
  return { transport, app, refresh, baseUrl };
}

export type Api = ReturnType<typeof createApi>;
