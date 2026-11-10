import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN_URL, API_URL, STUDENT_URL } from "../playwright.config";

export const ADMIN = { email: "admin@lms.local", password: "Admin@12345" };
export const MENTOR = { email: "mentor@lms.local", password: "Mentor@12345" };
export const STUDENT = { email: "student@lms.local", password: "Student@12345" };
export const stamp = () => Date.now().toString(36);

/** Signs an API context in over gRPC (Connect JSON): AuthService.Login sets the session cookies. */
export function rpcLogin(ctx: APIRequestContext, creds: { email: string; password: string }) {
  return ctx.post("/lms.v1.AuthService/Login", { data: creds, headers: { "Content-Type": "application/json" } });
}

/** API context signed in as the given portal user (used to set up data quickly). */
export async function apiAs(app: "admin" | "student", creds: { email: string; password: string }): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { "X-LMS-App": app, "Content-Type": "application/json" } });
  const res = await rpcLogin(ctx, creds);
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
}

/** Calls an RPC with Connect JSON: rpc(admin, "CourseService/CreateCourse", { input: {...} }). Fields may be snake_case. */
export function rpc(ctx: APIRequestContext, procedure: string, body: unknown = {}) {
  return ctx.post(`/lms.v1.${procedure}`, { data: body, headers: { "Content-Type": "application/json" } });
}

export async function json<T = any>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

export async function loginAdmin(page: Page, creds = ADMIN) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

export async function loginStudent(page: Page, creds: { email: string; password: string }) {
  await page.goto(`${STUDENT_URL}/login`);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/learn/);
}

export { ADMIN_URL, API_URL, STUDENT_URL };
