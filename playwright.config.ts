import { defineConfig, devices } from "@playwright/test";

// Release validation uses a production build and owned fixtures. Development
// execution is opt-in with PLAYWRIGHT_DEV_SERVER=1 for debugging only.
const port = process.env.PORT ?? "4317";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const adminStorageState = "e2e/.auth/admin.json";
const ignoreAuthSetup = /auth\.setup\.ts|onboarding\.spec\.ts|performance\.spec\.ts|visual\.spec\.ts|lighthouse\.spec\.ts/;
const responsiveOrA11y = /@responsive|@a11y/;

function taggedViewport(name: string, width: number, height: number) {
  return {
    name,
    dependencies: ["setup"],
    testIgnore: ignoreAuthSetup,
    grep: responsiveOrA11y,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height },
      storageState: adminStorageState,
    },
  };
}

export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate: `{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-${process.env.PLAYWRIGHT_SNAPSHOT_PLATFORM ?? process.platform}{ext}`,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results/browser",
  // Suites share seeded accounts, project selection, and saved preferences.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? "playwright-report" }], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "test-results/playwright.json" }]],
  use: {
    baseURL,
    connectOptions: process.env.PLAYWRIGHT_WS_ENDPOINT ? { wsEndpoint: process.env.PLAYWRIGHT_WS_ENDPOINT, exposeNetwork: "<loopback>" } : undefined,
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
    screenshot: "off",
  },
  projects: [
    {
      name: "lighthouse",
      testMatch: /lighthouse\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual",
      dependencies: ["setup"],
      testMatch: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: adminStorageState },
    },
    {
      name: "performance",
      dependencies: ["setup"],
      testMatch: /performance\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: adminStorageState,
        // DOM snapshots visit the live document on each action and skew the
        // main-thread budget. Keep failure tracing with action metadata.
        trace: { mode: "retain-on-failure", screenshots: false, snapshots: false, sources: true },
      },
    },
    {
      name: "onboarding",
      testMatch: /onboarding\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "smoke",
      testMatch: [/smoke\.spec\.ts$/, /release-gate\.spec\.ts$/],
      testIgnore: ignoreAuthSetup,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: ignoreAuthSetup,
      grepInvert: /@responsive/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: adminStorageState,
      },
    },
    ...(["firefox", "webkit"] as const).map((browserName) => ({
      name: `${browserName}-core`,
      dependencies: ["setup"],
      testMatch: [/release-gate\.spec\.ts$/, /refinement\.spec\.ts$/, /functional\/reports\.spec\.ts$/],
      use: { browserName, storageState: adminStorageState },
    })),
    taggedViewport("mobile-390", 390, 844),
    taggedViewport("tablet-834", 834, 1194),
    taggedViewport("tablet-1194", 1194, 834),
    taggedViewport("laptop-1366", 1366, 768),
    taggedViewport("desktop-1920", 1920, 1080),
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_DEV_SERVER === "1"
          ? `npx next dev --port ${port} --hostname 127.0.0.1`
          : process.env.PLAYWRIGHT_BUILD_READY === "1"
            ? "node scripts/validation/start-production.mjs"
            : "npm run build && node scripts/validation/start-production.mjs",
        url: baseURL,
        reuseExistingServer: process.env.PLAYWRIGHT_DEV_SERVER === "1",
        timeout: 300_000,
      },
});
