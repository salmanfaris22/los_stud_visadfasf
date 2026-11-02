import { expect, test } from "@playwright/test";
import { ADMIN_URL, loginAdmin, stamp } from "./helpers";

test.describe("Admin portal", () => {
  test.beforeEach(async ({ page }) => loginAdmin(page));

  test("dashboard shows stats, activity and review queue", async ({ page }) => {
    await expect(page.getByText("Students", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pending reviews")).toBeVisible();
    await expect(page.getByText(/Task activity/)).toBeVisible();
    await expect(page.getByText("Waiting for review")).toBeVisible();
  });

  test("build a course: Vimeo video with live preview, then a task", async ({ page }) => {
    const title = `E2E Course ${stamp()}`;
    await page.goto(`${ADMIN_URL}/courses`);
    await page.getByRole("button", { name: "New course" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Title/).fill(title);
    await dialog.getByRole("button", { name: "Create & add videos" }).click();
    await page.waitForURL(/\/courses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.getByRole("button", { name: "Add first video" }).click();
    const vd = page.getByRole("dialog");
    await vd.getByRole("button", { name: "Vimeo" }).click();
    await vd.getByLabel("Video link").fill("https://vimeo.com/1084537");
    await expect(vd.locator("iframe[src*='player.vimeo.com/video/1084537']")).toBeVisible();
    await vd.getByLabel(/^Title/).fill("Kickoff lesson");
    await vd.getByLabel("Duration").fill("9:57");
    await vd.getByRole("button", { name: "Add video" }).click();
    await expect(page.getByText("Kickoff lesson")).toBeVisible();
    await expect(page.getByText("vimeo", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Task", exact: true }).click();
    const td = page.getByRole("dialog");
    await td.getByLabel(/^Title/).fill("Write your learning goals");
    await td.getByLabel("Instructions").fill("Write 3 goals for this course.");
    await td.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Write your learning goals")).toBeVisible();
  });

  test("create a student with a course assigned", async ({ page }) => {
    const s = stamp();
    await page.goto(`${ADMIN_URL}/students`);
    await page.getByRole("button", { name: "Add student" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Full name/).fill(`Admin Made ${s}`);
    await d.getByLabel(/^Email/).fill(`made-${s}@example.com`);
    await d.getByLabel(/^Password/).fill("Made@12345");
    await d.locator("select").first().selectOption({ label: "Go Backend Mastery" });
    await d.getByRole("button", { name: "Create student" }).click();
    await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: new RegExp(`Admin Made ${s}`) })).toBeVisible();
    await expect(page.getByText("Go Backend Mastery")).toBeVisible();
    await expect(page.getByText(/STU\d+/)).toBeVisible();
  });

  test("roles: permission matrix and a new role", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/roles`);
    await expect(page.getByRole("cell", { name: "Students & enrollments", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New role" }).click();
    await page.getByLabel(/^Role name/).fill(`QA Reviewer ${stamp()}`);
    await page.getByRole("checkbox", { name: "Task submissions & reviews edit" }).click();
    await expect(page.getByRole("checkbox", { name: "Task submissions & reviews view" })).toBeChecked();
    await page.getByRole("button", { name: "Save role" }).click();
    await expect(page.getByText("Role created")).toBeVisible();
  });

  test("review queue, live calendar, website CMS and settings open", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/submissions`);
    await expect(page.getByRole("heading", { name: "Task reviews" })).toBeVisible();
    await page.goto(`${ADMIN_URL}/live`);
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await page.goto(`${ADMIN_URL}/website`);
    await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(/Learn skills/);
    await page.goto(`${ADMIN_URL}/settings`);
    await expect(page.getByLabel("Institute name")).toHaveValue("LMS");
    await expect(page.getByText("Google Workspace features")).toBeVisible();
  });
});
