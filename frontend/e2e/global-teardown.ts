import { request } from "@playwright/test";
import { ADMIN, API_URL, rpcLogin } from "./tests/helpers";

/** Removes everything the tests created (matched by their naming patterns) so the demo data stays clean. */
export default async function globalTeardown() {
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { "X-LMS-App": "admin" } });
  if (!(await rpcLogin(api, ADMIN)).ok()) return;
  const courses = await (await api.get("/api/v1/courses?per_page=200")).json();
  for (const c of courses.items ?? []) if (/^(Journey|E2E Course|Versions) [a-z0-9]+$/.test(c.title)) await api.delete(`/api/v1/courses/${c.id}`);
  const students = await (await api.get("/api/v1/students?q=%40example.com&per_page=200")).json();
  for (const s of students.items ?? []) if (/^(journey|quiz|made|new|versions)-[a-z0-9]+@example\.com$/.test(s.email)) await api.delete(`/api/v1/students/${s.id}`);
  const roles = await (await api.get("/api/v1/roles")).json();
  for (const r of roles ?? []) if (/^QA Reviewer [a-z0-9]+$/.test(r.name)) await api.delete(`/api/v1/roles/${r.id}`);
  const leads = await (await api.get("/api/v1/leads?q=Playwright%20Visitor&per_page=200")).json();
  for (const l of leads.items ?? []) if (l.name === "Playwright Visitor") await api.delete(`/api/v1/leads/${l.id}`);
  const live = await (await api.get("/api/v1/live?per_page=200")).json();
  for (const v of live.items ?? []) if (/^Live: Building your first API [a-z0-9]+$/.test(v.title)) await api.delete(`/api/v1/live/${v.id}`);
  await api.dispose();
}
