import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/server-api";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/learn", "/api", "/login", "/register"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
