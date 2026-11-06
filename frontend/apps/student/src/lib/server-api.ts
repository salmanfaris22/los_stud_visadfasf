import "server-only";
import createClient from "openapi-fetch";
import type { paths, Schemas } from "@lms/api-client";

/** Server-side client for public pages (no cookies). Responses are cached and refreshed every minute. */
const server = createClient<paths>({ baseUrl: process.env.API_URL ?? "http://localhost:8080", headers: { "X-LMS-App": "student" } });
const cache = { next: { revalidate: 60 } } as const;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const fallbackSite: Schemas["SiteInfo"] = {
  branding: { name: "LMS", tagline: "Learn by doing", logo_url: "", primary_color: "#6366f1", support_email: "" },
  signup: true, google: false, blocks: {},
};

export async function getSite(): Promise<Schemas["SiteInfo"]> {
  try {
    const { data } = await server.GET("/api/v1/public/site", cache);
    return data ?? fallbackSite;
  } catch {
    return fallbackSite;
  }
}

export async function getCourses(query: { q?: string; category?: string; limit?: number } = {}) {
  try {
    const { data } = await server.GET("/api/v1/public/courses", { params: { query }, ...cache });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getCategories() {
  try {
    const { data } = await server.GET("/api/v1/public/categories", cache);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getCourse(slug: string) {
  try {
    const { data } = await server.GET("/api/v1/public/courses/{slug}", { params: { path: { slug } }, ...cache });
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getPosts(limit = 30) {
  try {
    const { data } = await server.GET("/api/v1/public/blog", { params: { query: { limit } }, ...cache });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getPost(slug: string) {
  try {
    const { data } = await server.GET("/api/v1/public/blog/{slug}", { params: { path: { slug } }, ...cache });
    return data ?? null;
  } catch {
    return null;
  }
}

export async function verifyCertificate(code: string) {
  try {
    const { data } = await server.GET("/api/v1/public/certificates/{code}", { params: { path: { code } }, cache: "no-store" });
    return data ?? null;
  } catch {
    return null;
  }
}
