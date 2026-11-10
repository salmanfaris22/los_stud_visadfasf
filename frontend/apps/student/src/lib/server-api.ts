import "server-only";
import { CertificateService, SiteInfoSchema, SiteService, create, createClient, createConnectTransport, type Branding, type PublicCourse, type PublicCourseDetail, type SiteInfo } from "@lms/api-client/rpc";

/**
 * Server-side gRPC client for public pages (no cookies). Read-only RPCs go out as Connect GET
 * requests, so Next caches them and refreshes every minute.
 */
const api = process.env.API_URL ?? "http://localhost:8080";
const cached = createConnectTransport({
  baseUrl: api,
  useHttpGet: true,
  fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } } as RequestInit),
});
const fresh = createConnectTransport({ baseUrl: api, useHttpGet: true, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
const site = createClient(SiteService, cached);

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const fallbackSite: SiteInfo = create(SiteInfoSchema, {
  branding: { name: "LMS", tagline: "Learn by doing", logoUrl: "", primaryColor: "#6366f1", supportEmail: "" },
  signup: true,
  google: false,
  blocks: {},
});

/** Site info with branding and CMS blocks always present. */
export type Site = Omit<SiteInfo, "branding" | "blocks"> & { branding: Branding; blocks: Record<string, Record<string, unknown> | undefined> };

function normalizeSite(s: SiteInfo): Site {
  return { ...s, branding: s.branding ?? fallbackSite.branding!, blocks: (s.blocks ?? {}) as Site["blocks"] };
}

export async function getSite(): Promise<Site> {
  try {
    return normalizeSite((await site.getSite({})).site ?? fallbackSite);
  } catch {
    return normalizeSite(fallbackSite);
  }
}

export async function getCourses(query: { q?: string; category?: string; limit?: number } = {}) {
  try {
    return (await site.listPublicCourses(query)).items;
  } catch {
    return [];
  }
}

export async function getCategories() {
  try {
    return (await site.listCategories({})).items;
  } catch {
    return [];
  }
}

/** A public course page; null when the course does not exist. */
export type CourseDetail = Omit<PublicCourseDetail, "course"> & { course: PublicCourse };

export async function getCourse(slug: string): Promise<CourseDetail | null> {
  try {
    const d = (await site.getPublicCourse({ slug })).course;
    return d?.course ? { ...d, course: d.course } : null;
  } catch {
    return null;
  }
}

export async function getPosts(limit = 30) {
  try {
    return (await site.listPublicPosts({ limit })).items;
  } catch {
    return [];
  }
}

export async function getPost(slug: string) {
  try {
    return (await site.getPublicPost({ slug })).post ?? null;
  } catch {
    return null;
  }
}

export async function verifyCertificate(code: string) {
  try {
    return (await createClient(CertificateService, fresh).verifyCertificate({ code })).verification ?? null;
  } catch {
    return null;
  }
}
