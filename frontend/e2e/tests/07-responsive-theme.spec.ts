import { expect, test } from "@playwright/test";
import { STUDENT, STUDENT_URL, loginAdmin, loginStudent } from "./helpers";

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test.describe("Phone layout (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("public pages fit the screen", async ({ page }) => {
    for (const path of ["/", "/courses", "/courses/go-backend-mastery", "/blog", "/contact", "/login"]) {
      await page.goto(`${STUDENT_URL}${path}`);
      await noSideScroll(page);
    }
    await page.goto(STUDENT_URL);
    await page.screenshot({ path: "screenshots/11-mobile-landing.png" });
  });

  test("student portal uses the bottom navigation", async ({ page }) => {
    await loginStudent(page, STUDENT);
    const bottom = page.locator("nav.fixed.bottom-0");
    await expect(bottom.getByRole("link", { name: "Tasks" })).toBeVisible();
    for (const path of ["/learn", "/learn/courses", "/learn/tasks", "/learn/live", "/learn/certificates"]) {
      await page.goto(`${STUDENT_URL}${path}`);
      await noSideScroll(page);
    }
    await page.goto(`${STUDENT_URL}/learn`);
    await page.screenshot({ path: "screenshots/12-mobile-learn.png" });
  });

  test("admin portal opens the menu drawer", async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Students" })).toBeVisible();
    await noSideScroll(page);
  });
});

test.describe("Light theme", () => {
  test.use({ colorScheme: "light" });
  test("theme toggle switches to light and persists", async ({ page }) => {
    await page.goto(STUDENT_URL, { waitUntil: "networkidle" });
    await expect(async () => {
      if (!/light/.test((await page.locator("html").getAttribute("class")) ?? "")) await page.getByRole("button", { name: "Toggle theme" }).first().click();
      await expect(page.locator("html")).toHaveClass(/light/, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.screenshot({ path: "screenshots/13-light-landing.png" });
  });
});
