import { defineConfig, devices } from "@playwright/test";

/**
 * Exact default
 * -------------
 * `npm run test:e2e` runs `playwright test --project=chromium` only.
 * `chromium` is Desktop Chrome, has no storageState, does not depend on
 * `setup`, and collects only `e2e/smoke.spec.ts` and
 * `e2e/release-gate.spec.ts`. Functional and other release specs stay out
 * of `npm run test:e2e` so that job keeps the demo-only seed
 * (`TOPOLOGY_SEED_MODE` unset).
 *
 * Release harness (needs `npm run db:seed:e2e` or `TOPOLOGY_SEED_MODE=e2e`
 * so member, viewer, and custom logins exist):
 *   playwright test --project=setup --project=desktop-1440
 * `setup` writes `e2e/.auth/{admin,member,viewer,custom}.json`.
 * `desktop-1440` is Desktop Chrome at 1440×900, uses the admin storageState,
 * depends on `setup`, and runs every spec except `auth.setup.ts`.
 * `grepInvert` `@responsive` keeps mobile-only tests off this project.
 * `@a11y` still runs here unless a test is also tagged `@responsive`.
 *
 * Viewport projects are not part of `npm run test:e2e`. Opt in with
 * `--project=<name>`. Each depends on `setup`, uses the admin storageState,
 * and runs only tests tagged `@responsive` or `@a11y`:
 *   mobile-390 (390×844), tablet-834 (834×1194), tablet-1194 (1194×834),
 *   laptop-1366 (1366×768), desktop-1920 (1920×1080).
 *
 * A bare `playwright test` (no `--project`) runs every project, including
 * `setup` and the viewport projects.
 */

const port = process.env.PORT ?? "4317";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const adminStorageState = "e2e/.auth/admin.json";
const ignoreAuthSetup = /auth\.setup\.ts/;
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
  // Suites share seeded accounts, project selection, and saved preferences.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: [/smoke\.spec\.ts$/, /release-gate\.spec\.ts$/],
      testIgnore: ignoreAuthSetup,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop-1440",
      dependencies: ["setup"],
      testIgnore: ignoreAuthSetup,
      grepInvert: /@responsive/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: adminStorageState,
      },
    },
    taggedViewport("mobile-390", 390, 844),
    taggedViewport("tablet-834", 834, 1194),
    taggedViewport("tablet-1194", 1194, 834),
    taggedViewport("laptop-1366", 1366, 768),
    taggedViewport("desktop-1920", 1920, 1080),
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npm run dev -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
