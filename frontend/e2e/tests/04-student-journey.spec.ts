import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_URL, STUDENT_URL, apiAs, json, loginAdmin, loginStudent, stamp } from "./helpers";

test("full journey: assigned course → watch → submit → mentor approves → certificate verified", async ({ page, browser }) => {
  const s = stamp();
  const admin = await apiAs("admin", ADMIN);
  const course = await json(await admin.post("/api/v1/courses", { data: { title: `Journey ${s}`, status: "published", is_public: true } }));
  const video = await json(await admin.post(`/api/v1/courses/${course.id}/videos`, { data: { title: "Lesson one", provider: "youtube", url: "https://youtu.be/446E-r0rXHI" } }));
  await json(await admin.post(`/api/v1/videos/${video.id}/tasks`, { data: { title: "Share your repo", allowed_types: ["text", "link"], max_marks: 10, pass_marks: 5 } }));
  const email = `journey-${s}@example.com`;
  await json(await admin.post("/api/v1/students", { data: { name: `Journey Student ${s}`, email, password: "Journey@123", enrollments: [{ course_id: course.id }] } }));

  // Student: dashboard → course → watch page with watermark
  await loginStudent(page, { email, password: "Journey@123" });
  await expect(page).toHaveURL(/\/learn\/courses$/);
  await page.goto(`${STUDENT_URL}/learn`);
  // Home: the task opens as a dropdown on the same page
  await page.getByRole("button", { name: /Share your repo/ }).click();
  await expect(page.getByRole("heading", { name: "Your submission" })).toBeVisible();
  await expect(page).toHaveURL(/\/learn$/);
  await page.getByRole("button", { name: /Share your repo/ }).click();
  // The course card (not the "Next stop" shortcut, which jumps straight to the lesson).
  await page.locator('a[href^="/learn/courses/"]', { hasText: `Journey ${s}` }).first().click();
  await page.getByRole("link", { name: /Start course/ }).click();
  await expect(page.locator("iframe[src*='446E-r0rXHI']")).toBeVisible();
  await expect(page.getByText(`Journey Student ${s} · ${email}`)).toBeVisible();

  // Submit the task
  await page.getByRole("button", { name: /Share your repo/ }).click();
  await page.getByPlaceholder("Write your answer…").fill("My solution is in the repo.");
  await page.getByPlaceholder("https://github.com/you/project").fill("https://github.com/example/journey");
  await page.getByRole("button", { name: "Submit task" }).click();
  await expect(page.getByText("Your submission is waiting for review")).toBeVisible();
  await page.getByPlaceholder("Write a message…").fill("Please check the README too.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Please check the README too.")).toBeVisible();

  // Admin reviews in a second browser
  const ap = await browser.newPage();
  await loginAdmin(ap);
  await ap.goto(`${ADMIN_URL}/submissions`);
  await ap.getByPlaceholder("Student or task…").fill(`Journey Student ${s}`);
  await ap.getByRole("cell", { name: new RegExp(`Journey Student ${s}`) }).click();
  await expect(ap.getByText("https://github.com/example/journey")).toBeVisible();
  await expect(ap.getByText("Please check the README too.")).toBeVisible();
  await ap.getByLabel(/Marks/).fill("9");
  await ap.getByLabel("Feedback for the student").fill("Excellent work");
  await ap.getByRole("button", { name: "Approve" }).click();
  await expect(ap.getByText("Review saved")).toBeVisible();

  // Student sees approval, 100% progress and the certificate
  await page.reload();
  await page.getByRole("button", { name: /Share your repo/ }).click();
  await expect(page.getByText(/Approved — great work/)).toBeVisible();
  await page.goto(`${STUDENT_URL}/learn/courses`);
  await expect(page.getByText(/1\/1 tasks · 100%/)).toBeVisible();
  await page.goto(`${STUDENT_URL}/learn/certificates`);
  await expect(page.getByText(`Journey ${s}`)).toBeVisible();
  const code = await page.locator("text=/LMS-[A-Z0-9]{8}/").first().textContent();
  await page.goto(`${STUDENT_URL}/verify/${code}`);
  await expect(page.getByText("Certificate verified")).toBeVisible();
  await expect(page.getByText(`Journey Student ${s}`)).toBeVisible();
});
