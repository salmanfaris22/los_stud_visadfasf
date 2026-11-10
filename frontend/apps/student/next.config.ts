import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@lms/ui", "@lms/api-client", "@lms/shared"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
  // The browser talks to /rpc (gRPC/Connect) and /api (files, Google redirects) on this origin, so cookies
  // stay first-party. Route handlers in src/app/{rpc,api}/[...path] forward them to API_URL; not rewrites,
  // because Vercel's edge proxy will not forward to a bare IP / port 8080. The Go server strips /rpc.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
