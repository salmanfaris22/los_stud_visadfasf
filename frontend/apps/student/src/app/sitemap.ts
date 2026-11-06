import type { MetadataRoute } from "next";
import { SITE_URL, getCourses, getPosts } from "@/lib/server-api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, posts] = await Promise.all([getCourses({ limit: 200 }), getPosts(100)]);
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, priority: 0.5 },
    ...courses.map((c) => ({ url: `${SITE_URL}/courses/${c.slug}`, lastModified: now, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.published_at ? new Date(p.published_at) : now, priority: 0.6 })),
  ];
}
