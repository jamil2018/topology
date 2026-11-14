import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", testMatch: ["refinement.spec.ts", "refinement-context.spec.ts"], workers: 1,
  timeout: 60_000, outputDir: "test-results/refinement",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4318", storageState: "e2e/.auth/admin.json", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 1000 } } },
  ],
});
