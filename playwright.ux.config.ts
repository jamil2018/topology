import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", testMatch: "simplification.spec.ts", workers: 1, timeout: 60_000,
  outputDir: "test-results/ux-simplification/runs",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4320", storageState: process.env.UX_STORAGE_STATE ?? "e2e/.auth/admin.json", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: {width:1440,height:1000} } }, { name: "webkit", use: { ...devices["Desktop Safari"], viewport: {width:1440,height:1000} } }],
});
