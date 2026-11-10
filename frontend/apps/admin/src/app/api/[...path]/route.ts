// Forwards /api/* to the Go API from the server (see @lms/api-client/proxy for why not a rewrite).
import { proxy } from "@lms/api-client/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The realtime stream stays open; Vercel ends a function after this many seconds and the client reconnects.
export const maxDuration = 300;

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
