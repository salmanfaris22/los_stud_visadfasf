import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_URL, STUDENT_URL, apiAs, json, loginAdmin, loginStudent, rpc, stamp } from "./helpers";

test("Build update: new lesson stays hidden until the student is moved to the new version", async ({ browser }) => {
  const s = stamp();
  const admin = await apiAs("admin", ADMIN);
  const { course } = await json(await rpc(admin, "CourseService/CreateCourse", { input: { title: `Versions ${s}`, status: "published", is_public: true } }));
  const lesson = (title: string) => rpc(admin, "CourseService/CreateVideo", { course_id: course.id, input: { title, provider: "youtube", url: "https://youtu.be/446E-r0rXHI" } });
  await json(await lesson("Lesson one"));
  const email = `versions-${s}@example.com`;
  await json(await rpc(admin, "StudentService/CreateStudent", { input: { name: `Version Student ${s}`, email, password: "Version@123", enrollments: [{ course_id: course.id }] } }));

  // The enrollment built v1. The next lesson is an unbuilt change.
  await json(await lesson("Lesson two"));

  const studentPage = await (await browser.newContext()).newPage();
  await loginStudent(studentPage, { email, password: "Version@123" });
  await studentPage.goto(`${STUDENT_URL}/learn/courses/${course.id}`);
  await expect(studentPage.getByRole("link", { name: /Lesson one/ })).toBeVisible();
  await expect(studentPage.getByText("Lesson two")).toHaveCount(0);

  const page = await (await browser.newContext()).newPage();
  await loginAdmin(page);
  await page.goto(`${ADMIN_URL}/courses/${course.id}`);
  await expect(page.getByText("Nobody sees these changes yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Update students" })).toHaveCount(0);

  await page.getByRole("button", { name: "Build update" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("+1 video")).toBeVisible();
  await dialog.getByLabel("Note").fill("Added lesson two");
  await dialog.getByRole("button", { name: "Build v2" }).click();

  // Building goes straight to moving students, with the new version as the target.
  await expect(dialog.getByRole("heading", { name: "Update students" })).toBeVisible();
  await expect(dialog.getByText("v1 · 1 student")).toBeVisible();
  await expect(dialog.getByText("v2 · 0 students")).toBeVisible();
  await expect(page.getByText("Nobody sees these changes yet.")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Move 0 students to v2" })).toBeDisabled();
  await dialog.getByRole("button", { name: /Everyone on older versions/ }).click();
  await dialog.getByRole("button", { name: "Move 1 student to v2" }).click();
  await expect(page.getByText("1 student moved to v2")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update students" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Students" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Version Student ${s}.*v2`) })).toBeVisible();

  // Nothing left to build, and the history shows the note.
  await page.getByRole("button", { name: "Build update" }).click();
  await expect(page.getByRole("dialog").getByText("Nothing has changed since v2.")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Added lesson two")).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByRole("link", { name: /Lesson two/ })).toBeVisible();
});
