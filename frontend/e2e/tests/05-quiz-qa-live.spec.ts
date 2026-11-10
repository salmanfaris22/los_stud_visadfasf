import { expect, test } from "@playwright/test";
import { ADMIN, STUDENT_URL, apiAs, json, loginStudent, rpc, stamp } from "./helpers";

test("quiz, video Q&A and live classes for a batch student", async ({ page }) => {
  const s = stamp();
  const admin = await apiAs("admin", ADMIN);
  const courses = await json(await rpc(admin, "CourseService/ListCourses", { q: "Go Backend" }));
  const course = courses.items[0];
  const batches = await json(await rpc(admin, "BatchService/ListBatches", { course_id: course.id, q: "Online" }));
  const email = `quiz-${s}@example.com`;
  await json(await rpc(admin, "StudentService/CreateStudent", { input: { name: `Quiz Taker ${s}`, email, password: "Quiz@12345", enrollments: [{ course_id: course.id, batch_id: batches.items[0].id }] } }));
  // The seeded live class ages into the past, so schedule one for this batch tomorrow.
  const liveTitle = `Live: Building your first API ${s}`;
  const start = new Date(Date.now() + 24 * 3600_000);
  start.setUTCMinutes(0, 0, 0);
  await json(await rpc(admin, "LiveService/CreateLive", { input: { title: liveTitle, meet_url: "https://meet.google.com/abc-defg-hij", starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600_000).toISOString(), targets: [{ type: "batch", id: batches.items[0].id }] } }));
  const curriculum = (await json(await rpc(admin, "CourseService/GetCurriculum", { course_id: course.id }))).items;
  const first = curriculum.find((v: { title: string }) => v.title === "Go in 100 seconds");

  await loginStudent(page, { email, password: "Quiz@12345" });
  await page.goto(`${STUDENT_URL}/learn/watch/${first.id}`);
  await page.getByRole("tab", { name: /Quizzes/ }).click();
  await page.getByRole("link", { name: "Start quiz" }).click();
  await expect(page.getByText("Which keyword declares a function in Go?")).toBeVisible();
  for (const answer of ["func", "Compiles and runs", "string", "go f()", "gofmt"]) await page.getByLabel(answer, { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("Passed 🎉")).toBeVisible();

  await page.goto(`${STUDENT_URL}/learn/watch/${first.id}?tab=qa`);
  await page.getByPlaceholder("Ask a question about this lesson…").fill(`How do goroutines work? ${s}`);
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText(`How do goroutines work? ${s}`)).toBeVisible();

  await page.goto(`${STUDENT_URL}/learn/live`);
  await expect(page.getByText(liveTitle)).toBeVisible();
  await expect(page.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com/);
  await page.goto(`${STUDENT_URL}/learn/calendar`);
  await expect(page.getByText(/Building your first API/).first()).toBeVisible();
});
