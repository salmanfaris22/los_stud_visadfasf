import { expect, test } from "@playwright/test";
import { ADMIN_URL, STUDENT, STUDENT_URL, loginAdmin, stamp } from "./helpers";

test.describe("Authentication & portals", () => {
  test("wrong password shows an error", async ({ page }) => {
    await page.goto(`${STUDENT_URL}/login`);
    await page.getByLabel("Email").fill(STUDENT.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("wrong email or password");
  });

  test("students cannot sign in to the admin portal", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel("Email").fill(STUDENT.email);
    await page.getByLabel("Password").fill(STUDENT.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("student portal");
  });

  test("protected pages redirect to login", async ({ page }) => {
    await page.goto(`${STUDENT_URL}/learn/tasks`);
    await page.waitForURL(/\/login\?next=/);
    await page.goto(`${ADMIN_URL}/students`);
    await page.waitForURL(/\/login/);
  });

  test("self sign-up lands on the empty learning home", async ({ page }) => {
    await page.goto(`${STUDENT_URL}/register`);
    await page.getByLabel("Full name").fill("New Learner");
    await page.getByLabel("Email").fill(`new-${stamp()}@example.com`);
    await page.getByLabel("Password").fill("Learner@123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/learn/);
    await expect(page.getByText("No courses yet")).toBeVisible();
  });

  test("admin sign in and sign out", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByText(/Hi Super/)).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);
  });
});
