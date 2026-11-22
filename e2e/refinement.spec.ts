import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** Click HeroUI Checkbox.Content so React Aria toggles controlled selection. */
async function clickSelectAllVisible(page: Page) {
  const checkbox = page.getByRole("checkbox", { name: "Select all visible cases" });
  await page
    .locator('[data-slot="checkbox"]')
    .filter({ has: checkbox })
    .locator('[data-slot="checkbox-content"]')
    .click();
}

for (const theme of ["light", "dark"] as const) {
  test(`screen families are accessible in ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    test.setTimeout(120_000);
    const settings = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'GET');
    await page.goto('/');
    await settings;
    const saved = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'PATCH');
    await page.getByRole('radiogroup', { name: 'Color theme' }).getByRole('radio', { name: theme === 'dark' ? 'Dark theme' : 'Light theme', exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
    for (const route of ["/", "/cases", "/runs", "/runs/new", "/plans", "/triage", "/automation", "/reports", "/settings", "/requirements", "/releases", "/cases/import", "/intents", "/journeys", "/components", "/risks", "/milestones"]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark).*$/);
      await page.screenshot({caret: "initial",  path: info.outputPath(`${route.replaceAll("/", "-") || "home"}-${theme}.png`), fullPage: true });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect.soft(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")), `${route} ${theme}`).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} overflow`).toBeLessThanOrEqual(1);
    }
  });
}

test("responsive cases, keyboard dialog and inspector", async ({ page }, info) => {
  for (const width of [320, 390, 834, 1194, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/cases");
    await expect(page.locator("main h1")).toHaveText("Test cases");
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `cases at ${width}`).toBeLessThanOrEqual(1);
    await page.screenshot({caret: "initial",  path: info.outputPath(`cases-${width}.png`), fullPage: true });
  }
  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts).toBeVisible();
  for (let count = 0; count < 8; count++) { await page.keyboard.press("Tab"); expect(await shortcuts.evaluate((element) => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(shortcuts).not.toBeVisible();
  await page.getByRole("button", { name: "Search ⌘K", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  for (let count = 0; count < 6; count++) { await page.keyboard.press("Tab"); expect(await palette.evaluate((element) => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(palette).not.toBeVisible();
});

test("review template, create fresh run, retest failure and follow lineage", async ({ page }) => {
  const name = `Refinement ${Date.now()}`;
  await page.goto("/runs/new");
  await page.getByLabel("Run name", { exact: true }).filter({visible:true}).fill(name);
  await clickSelectAllVisible(page);
  await expect(page.getByRole("button", { name: /^Create run/ })).toBeDisabled();
  await clickSelectAllVisible(page);
  await page.getByRole("button", { name: "Save as template", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Template saved" })).toBeVisible();
  await page.goto("/runs");
  const templates = page.getByRole("region", { name: "Run templates" });
  const row = templates.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  await Promise.all([
    page.waitForURL(/\/runs\/new\?template=/),
    row.getByRole("link", { name: "Review and launch" }).click(),
  ]);
  await expect(page.getByLabel("Run name", { exact: true }).filter({ visible: true })).toHaveValue(name);
  const creation = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/runs(?:\/retest)?$/.test(new URL(response.url()).pathname));
  await page.getByRole("button", { name: /^Create run/ }).click();
  expect((await creation).status()).toBe(201);
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+(?:\?|$)/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: /Mark (?!step).* as failed/ }).click();
  await page.getByText(/Reuse this run · Retest history/).click();
  const failures = page.getByRole("group", { name: "Select failures to retest" });
  await failures.getByRole("checkbox").first().check();
  await page.getByRole("link", { name: /Review retest/ }).click();
  await expect(page.locator("main h1")).toHaveText("Review retest");
  const retestCreation = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/runs/retest");
  await page.getByRole("button", { name: /^Create run/ }).click();
  expect((await retestCreation).status()).toBe(201);
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+(?:\?|$)/);
  await page.getByText(/Reuse this run · Retest history/).click();
  await expect(page.getByRole("link", { name: `${name} · failed` })).toBeVisible();
});

test("execution reflows with accessible actions in both themes", async ({ page }, info) => {
  const response = await page.request.get("/api/runs?kind=manual&limit=1");
  expect(response.ok()).toBe(true);
  const { runs } = await response.json();
  expect(runs.length).toBeGreaterThan(0);
  const settings = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'GET');
  await page.goto(`/runs/${runs[0].id}`);
  expect((await settings).ok()).toBeTruthy();
  await expect(page.locator("main h1")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const saved = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'PATCH');
    await page.getByRole('radiogroup', { name: 'Color theme' }).getByRole('radio', { name: theme === 'dark' ? 'Dark theme' : 'Light theme', exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 834, 1194, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `execution ${theme} ${width}`).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
    await page.screenshot({caret: "initial",  path: info.outputPath(`execution-${theme}.png`), fullPage: true });
  }
});
