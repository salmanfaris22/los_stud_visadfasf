// Server-side proxy from the web apps to the Go API, used by the /rpc/* and /api/* route handlers.
//
// The next.config rewrites do the same job under `next start` and `next dev`, but on Vercel a
// rewrite goes through Vercel's edge proxy, which refuses a bare IP / non-standard port as the
// destination (DNS_HOSTNAME_RESOLVED_PRIVATE). A route handler fetches from the function instead,
// which can reach any address. Route handlers win over rewrites, so this runs everywhere.

const API = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");

// Hop-by-hop and length headers are not forwarded (the body may be re-chunked).
const DROP_REQUEST = new Set(["host", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "accept-encoding"]);
const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding"]);

/** Forwards the request to API_URL + same path and query, streaming the answer back (cookies included). */
export async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  // Ask for an uncompressed HTTP body: fetch would unzip it and the browser would try again.
  // (Connect's own message compression travels in Connect-Content-Encoding and is untouched.)
  headers.set("accept-encoding", "identity");

  const init: RequestInit = { method: req.method, headers, redirect: "manual", signal: req.signal, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();

  let res: Response;
  try {
    res = await fetch(API + url.pathname + url.search, init);
  } catch {
    return Response.json({ code: "unavailable", message: "the server is not answering, try again in a moment" }, { status: 503 });
  }
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") out.append(key, value);
  });
  for (const c of res.headers.getSetCookie()) out.append("set-cookie", c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
