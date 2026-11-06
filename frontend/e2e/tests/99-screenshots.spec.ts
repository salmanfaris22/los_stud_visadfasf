import { test } from "@playwright/test";
import { ADMIN_URL, STUDENT, STUDENT_URL, apiAs, json, loginAdmin, loginStudent } from "./helpers";

const shot = (name: string) => ({ path: `screenshots/${name}.png`, fullPage: false });

test("capture key screens for the docs", async ({ page, browser }) => {
  await page.goto(STUDENT_URL);
  await page.waitForTimeout(1800);
  await page.screenshot(shot("01-landing"));
  await page.goto(`${STUDENT_URL}/courses/go-backend-mastery`);
  await page.screenshot(shot("02-course-page"));

  await loginStudent(page, STUDENT);
  await page.waitForTimeout(600);
  await page.screenshot(shot("03-student-home"));
  const admin = await apiAs("admin", { email: "admin@lms.local", password: "Admin@12345" });
  const go = (await json(await admin.get("/api/v1/courses?q=Go%20Backend"))).items[0];
  const cur = await json(await admin.get(`/api/v1/courses/${go.id}/curriculum`));
  await page.goto(`${STUDENT_URL}/learn/watch/${cur[0].id}`);
  await page.waitForTimeout(2500);
  await page.screenshot(shot("04-watch-page"));
  await page.goto(`${STUDENT_URL}/learn/tasks/${cur[1].tasks[0].id}`);
  await page.screenshot(shot("05-task-page"));

  const ap = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginAdmin(ap);
  await ap.waitForTimeout(1200);
  await ap.screenshot(shot("06-admin-dashboard"));
  await ap.goto(`${ADMIN_URL}/courses/${go.id}`);
  await ap.waitForTimeout(800);
  await ap.screenshot(shot("07-curriculum-builder"));
  const subs = await json(await admin.get("/api/v1/submissions?per_page=1"));
  if (subs.items[0]) {
    await ap.goto(`${ADMIN_URL}/submissions/${subs.items[0].id}`);
    await ap.screenshot(shot("08-review"));
  }
  await ap.goto(`${ADMIN_URL}/roles`);
  await ap.screenshot(shot("09-roles-matrix"));
  await ap.goto(`${ADMIN_URL}/live`);
  await ap.screenshot(shot("10-live-calendar"));
});
