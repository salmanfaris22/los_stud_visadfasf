import createFetchClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./schema";
import { createRpc } from "./transport";

export type Schemas = components["schemas"];
export type App = "admin" | "student";

export interface ApiOptions {
  /** Which portal is calling: decides which auth cookies the API reads. */
  app: App;
  /** Empty in the browser (Next.js rewrites /api to the Go server). */
  baseUrl?: string;
  /** Called when the session cannot be refreshed. */
  onUnauthorized?: () => void;
}

/**
 * Creates a typed API client.
 * - `transport` is the Connect transport for the gRPC API (use with connect-query hooks).
 * - `client` is openapi-fetch (await client.GET("/api/v1/courses")).
 * - `$api` is the TanStack Query wrapper ($api.useQuery("get", "/api/v1/courses")).
 * Expired access tokens are refreshed once (shared between parallel requests) and the request is retried.
 */
export function createApi({ app, baseUrl = "", onUnauthorized }: ApiOptions) {
  // Sessions are refreshed over gRPC (AuthService.Refresh); REST and RPC calls share one refresh.
  const { transport, refresh } = createRpc({ app, baseUrl, onUnauthorized });

  const authFetch = async (request: Request): Promise<Response> => {
    const retry = request.clone();
    let res = await fetch(request);
    if (res.status === 401) {
      if (await refresh()) res = await fetch(retry);
      if (res.status === 401) onUnauthorized?.();
    }
    return res;
  };

  const client = createFetchClient<paths>({ baseUrl, fetch: authFetch, credentials: "include", headers: { "X-LMS-App": app } });
  const $api = createQueryClient(client);
  return { client, $api, transport, app, refresh, baseUrl };
}

export type Api = ReturnType<typeof createApi>;
