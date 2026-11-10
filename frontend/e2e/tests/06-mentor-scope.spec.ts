import { expect, test } from "@playwright/test";
import { ADMIN_URL, MENTOR, apiAs, loginAdmin, rpc } from "./helpers";

test("mentor sees only assigned courses and no admin-only areas", async ({ page }) => {
  await loginAdmin(page, MENTOR);
  const nav = page.locator("aside");
  await expect(nav.getByRole("link", { name: "Courses", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Task reviews" })).toBeVisible();
  for (const hidden of ["Staff", "Roles & permissions", "Settings", "Audit log", "Leads"]) await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/courses`);
  await expect(page.getByText("Go Backend Mastery")).toBeVisible();
  await expect(page.getByText("Next.js Frontend Bootcamp")).toHaveCount(0);

  const api = await apiAs("admin", MENTOR);
  expect((await rpc(api, "StaffService/ListStaff")).status()).toBe(403);
  expect((await rpc(api, "AdminService/GetSettings")).status()).toBe(403);
});
