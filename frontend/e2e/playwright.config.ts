import { defineConfig, devices } from "@playwright/test";

export const STUDENT_URL = process.env.STUDENT_URL ?? "http://localhost:3000";
export const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:3001";
export const API_URL = process.env.API_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  globalTeardown: "./global-teardown.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["json", { outputFile: "test-results/results.json" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
