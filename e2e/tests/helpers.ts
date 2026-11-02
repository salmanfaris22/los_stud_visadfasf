import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN_URL, API_URL, STUDENT_URL } from "../playwright.config";

export const ADMIN = { email: "admin@lms.local", password: "Admin@12345" };
export const MENTOR = { email: "mentor@lms.local", password: "Mentor@12345" };
export const STUDENT = { email: "student@lms.local", password: "Student@12345" };
export const stamp = () => Date.now().toString(36);

/** API context signed in as the given portal user (used to set up data quickly). */
export async function apiAs(app: "admin" | "student", creds: { email: string; password: string }): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { "X-LMS-App": app, "Content-Type": "application/json" } });
  const res = await ctx.post("/api/v1/auth/login", { data: creds });
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
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
