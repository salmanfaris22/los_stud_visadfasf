import { expect, test } from "@playwright/test";
import { API_URL, STUDENT_URL } from "./helpers";

test.describe("Public website", () => {
  test("landing page shows CMS hero, stats, courses and FAQ", async ({ page }) => {
    await page.goto(STUDENT_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Learn skills that get you");
    await expect(page.getByText("Learners", { exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/courses/"]').first()).toBeVisible();
    await expect(page.getByText("How it works")).toBeVisible();
    await expect(page.getByText("Do I need any experience?")).toBeVisible();
  });

  test("catalog search and course page with free preview", async ({ page }) => {
    await page.goto(`${STUDENT_URL}/courses?q=Go`);
    await expect(page.getByRole("heading", { name: "Explore courses" })).toBeVisible();
    await page.getByRole("link", { name: /Go Backend Mastery/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Go Backend Mastery" })).toBeVisible();
    await expect(page.getByText("What you'll learn")).toBeVisible();
    await expect(page.getByText("Upcoming batches")).toBeVisible();
    await page.getByRole("button", { name: /Go in 100 seconds/ }).click();
    await expect(page.locator("iframe[src*='youtube-nocookie.com/embed/446E-r0rXHI']")).toBeVisible();
  });

  test("enquiry form creates a lead", async ({ page }) => {
    // v2 (sales/CRM) enquiries are phone-first: name + phone / WhatsApp.
    await page.goto(`${STUDENT_URL}/contact`);
    await page.getByLabel("Your name").fill("Playwright Visitor");
    await page.getByLabel("Phone / WhatsApp").fill(`+91 9${String(Date.now()).slice(-9)}`);
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText(/our team will contact you/i)).toBeVisible();
  });

  test("blog post, sitemap and invalid certificate", async ({ page, request }) => {
    await page.goto(`${STUDENT_URL}/blog/why-learn-go-in-2027`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why learn Go in 2027?");
    const sitemap = await request.get(`${STUDENT_URL}/sitemap.xml`);
    expect(await sitemap.text()).toContain("/courses/go-backend-mastery");
    await page.goto(`${STUDENT_URL}/verify/LMS-NOTREAL1`);
    await expect(page.getByText("Certificate not found")).toBeVisible();
    const health = await request.get(`${API_URL}/healthz`);
    expect(await health.json()).toMatchObject({ status: "ok", db: "ok", redis: "ok", storage: "ok" });
  });
});
