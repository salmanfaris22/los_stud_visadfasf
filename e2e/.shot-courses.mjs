import { chromium } from "@playwright/test";
const out = process.argv[2], tag = process.argv[3] || "x", dark = process.argv[4] === "dark";
const b = await chromium.launch();
for (const [name, vp] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  if (dark) await ctx.addInitScript(() => localStorage.setItem("theme", "dark"));
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://localhost:3000/login");
  await p.fill('input[type=email]', "student@lms.local");
  await p.fill('input[type=password]', "Student@12345");
  await p.click('button[type=submit]');
  await p.waitForURL(/learn/, { timeout: 20000 });
  await p.goto("http://localhost:3000/learn/courses"); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/${tag}-list-${name}.png`, fullPage: true });
  const href = await p.locator('a[href^="/learn/courses/"]').first().getAttribute("href");
  if (href) { await p.goto("http://localhost:3000" + href); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/${tag}-detail-${name}.png`, fullPage: true }); }
  console.log(name, href, errs.slice(0, 5));
  await ctx.close();
}
await b.close();
