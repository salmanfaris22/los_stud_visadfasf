import { chromium } from "@playwright/test";

const url = process.argv[2];
const shot = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});

// wait for the password field to actually exist
const pw = page.locator('input[type="password"]').first();
await pw.waitFor({ state: "visible", timeout: 30000 });
await pw.fill("Admin@12345");

const eye = page.getByRole("button", { name: "Show password" }).first();
await eye.waitFor({ state: "visible", timeout: 5000 });
const eyeLabelBefore = await eye.getAttribute("aria-label");

// keep a stable handle on the input node
const handle = await pw.elementHandle();

// before click: password hidden
const typeBefore = await handle.getAttribute("type");
await page.screenshot({ path: shot });

// click the eye: password visible
await eye.click();
await page.waitForTimeout(300);
const typeAfter = await handle.getAttribute("type");
const eyeLabelAfter = await page.getByRole("button", { name: "Hide password" }).first().isVisible();
await page.screenshot({ path: shot.replace(".png", "-shown.png") });

console.log(JSON.stringify({ typeBefore, typeAfter, eyeLabelBefore, hideButtonAppeared: eyeLabelAfter }));
await browser.close();
