import { request } from "@playwright/test";
import { ADMIN, API_URL, rpc, rpcLogin } from "./tests/helpers";

/** Removes everything the tests created (matched by their naming patterns) so the demo data stays clean. */
export default async function globalTeardown() {
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { "X-LMS-App": "admin" } });
  if (!(await rpcLogin(api, ADMIN)).ok()) return;
  const call = async (procedure: string, body: unknown = {}) => {
    const res = await rpc(api, procedure, body);
    return res.ok() ? res.json() : {};
  };
  const courses = await call("CourseService/ListCourses", { per_page: 200 });
  for (const c of courses.items ?? []) if (/^(Journey|E2E Course|Versions) [a-z0-9]+$/.test(c.title)) await call("CourseService/DeleteCourse", { id: c.id });
  const students = await call("StudentService/ListStudents", { q: "@example.com", per_page: 200 });
  for (const s of students.items ?? []) if (/^(journey|quiz|made|new|versions)-[a-z0-9]+@example\.com$/.test(s.email)) await call("StudentService/DeleteStudent", { id: s.id });
  const roles = await call("StaffService/ListRoles");
  for (const r of roles.items ?? []) if (/^QA Reviewer [a-z0-9]+$/.test(r.name)) await call("StaffService/DeleteRole", { id: r.id });
  const leads = await call("LeadService/ListLeads", { q: "Playwright Visitor", per_page: 200 });
  for (const l of leads.list?.items ?? []) if (l.name === "Playwright Visitor") await call("LeadService/DeleteLead", { id: l.id });
  const live = await call("LiveService/ListLive", { per_page: 200 });
  for (const v of live.items ?? []) if (/^Live: Building your first API [a-z0-9]+$/.test(v.title)) await call("LiveService/DeleteLive", { id: v.id });
  await api.dispose();
}
