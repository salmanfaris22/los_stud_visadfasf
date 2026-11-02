import createFetchClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./schema";

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

/** Endpoints that must never trigger a token refresh. */
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout", "/auth/forgot", "/auth/reset"];

/**
 * Creates a typed API client.
 * - `client` is openapi-fetch (await client.GET("/api/v1/courses")).
 * - `$api` is the TanStack Query wrapper ($api.useQuery("get", "/api/v1/courses")).
 * Expired access tokens are refreshed once (shared between parallel requests) and the request is retried.
 */
export function createApi({ app, baseUrl = "", onUnauthorized }: ApiOptions) {
  let refreshing: Promise<boolean> | null = null;
  const refresh = () => {
    refreshing ??= fetch(`${baseUrl}/api/v1/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-LMS-App": app } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
    return refreshing;
  };

  const authFetch = async (request: Request): Promise<Response> => {
    const retry = request.clone();
    let res = await fetch(request);
    if (res.status === 401 && !NO_REFRESH.some((p) => request.url.includes(p))) {
      if (await refresh()) res = await fetch(retry);
      if (res.status === 401) onUnauthorized?.();
    }
    return res;
  };

  const client = createFetchClient<paths>({ baseUrl, fetch: authFetch, credentials: "include", headers: { "X-LMS-App": app } });
  const $api = createQueryClient(client);
  return { client, $api, app, refresh, baseUrl };
}

export type Api = ReturnType<typeof createApi>;
