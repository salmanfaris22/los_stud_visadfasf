import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_URL, STUDENT_URL, apiAs, json, loginAdmin, loginStudent, rpc, stamp } from "./helpers";

test("full journey: assigned course → watch → submit → mentor approves → certificate verified", async ({ page, browser }) => {
  const s = stamp();
  const admin = await apiAs("admin", ADMIN);
  const { course } = await json(await rpc(admin, "CourseService/CreateCourse", { input: { title: `Journey ${s}`, status: "published", is_public: true } }));
  const { video } = await json(await rpc(admin, "CourseService/CreateVideo", { course_id: course.id, input: { title: "Lesson one", provider: "youtube", url: "https://youtu.be/446E-r0rXHI" } }));
  await json(await rpc(admin, "CourseService/CreateTask", { video_id: video.id, input: { title: "Share your repo", allowed_types: ["text", "link"], max_marks: 10, pass_marks: 5 } }));
  const email = `journey-${s}@example.com`;
  await json(await rpc(admin, "StudentService/CreateStudent", { input: { name: `Journey Student ${s}`, email, password: "Journey@123", enrollments: [{ course_id: course.id }] } }));

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
  // The task panel shows only the task and the upload: no mentor chat, attempts list or instructions.
  await expect(page.getByText("Ask your mentor")).toHaveCount(0);
  await expect(page.getByText("Your attempts")).toHaveCount(0);

  // Admin reviews in a second browser
  const ap = await browser.newPage();
  await loginAdmin(ap);
  await ap.goto(`${ADMIN_URL}/submissions`);
  await ap.getByPlaceholder("Student or task…").fill(`Journey Student ${s}`);
  await ap.getByRole("cell", { name: new RegExp(`Journey Student ${s}`) }).click();
  await expect(ap.getByText("https://github.com/example/journey")).toBeVisible();
  await ap.getByLabel(/Marks/).fill("9");
  await ap.getByLabel("Feedback for the student").fill("Excellent work");
  await ap.getByRole("button", { name: "Approve" }).click();
  await expect(ap.getByText("Review saved")).toBeVisible();

  // Student sees approval, 100% progress and the certificate
  await page.reload();
  const row = page.getByRole("button", { name: /Share your repo/ });
  await expect(row).toContainText("9/10");
  await row.click();
  await expect(page.getByText("10 marks · pass 5")).toBeVisible();
  await expect(page.getByText(/Approved — great work/)).toHaveCount(0);
  await page.goto(`${STUDENT_URL}/learn/courses`);
  // My courses card: task count in the footer, percentage in the progress ring.
  const card = page.locator('a[href^="/learn/courses/"]', { hasText: `Journey ${s}` });
  await expect(card).toContainText("1/1 tasks");
  await expect(card.getByRole("progressbar", { name: "100% complete" })).toBeVisible();
  await page.goto(`${STUDENT_URL}/learn/certificates`);
  await expect(page.getByText(`Journey ${s}`)).toBeVisible();
  const code = await page.locator("text=/LMS-[A-Z0-9]{8}/").first().textContent();
  await page.goto(`${STUDENT_URL}/verify/${code}`);
  await expect(page.getByText("Certificate verified")).toBeVisible();
  await expect(page.getByText(`Journey Student ${s}`)).toBeVisible();
});
