import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import { expect, test } from "./fixtures";

test("OPS-LH-001: authenticated production hub, cases and run meet Lighthouse budgets", async ({ baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const lighthouse = (await import("lighthouse")).default;
  const profile = mkdtempSync(path.join(tmpdir(), "topology-lighthouse-"));
  const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless", "--no-sandbox"], userDataDir: profile });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
  try {
    const page = await browser.contexts()[0].newPage();
    await page.goto(`${baseURL}/login`);
    await page.getByLabel("Email").fill("demo@topology.local");
    await page.getByLabel("Password", { exact: true }).fill("topology-demo");
    await page.getByRole("button", { name: "Sign in with email", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await page.goto(`${baseURL}/runs`);
    const runUrl = await page.locator("main a[href^='/runs/']:not([href='/runs/new'])").first().getAttribute("href");
    expect(runUrl).toBeTruthy();
    for (const [name, route] of [["home", "/"], ["cases", "/cases"], ["run", runUrl!]]) {
      const result = await lighthouse(`${baseURL}${route}`, {
        port: chrome.port, logLevel: "error", output: ["json", "html"],
        onlyCategories: ["performance", "accessibility", "best-practices"],
        formFactor: "desktop", screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
        throttlingMethod: "provided", disableStorageReset: true,
      });
      expect(result).toBeDefined();
      const { lhr } = result!;
      await testInfo.attach(`lighthouse-${name}.json`, { body: JSON.stringify(lhr), contentType: "application/json" });
      await testInfo.attach(`lighthouse-${name}.html`, { body: result!.report[1], contentType: "text/html" });
      await testInfo.attach(`lighthouse-${name}-environment.json`, { body: JSON.stringify({ cpu: cpus()[0]?.model, memoryBytes: totalmem(), node: process.version, throttling: "provided", viewport: "1440x900" }), contentType: "application/json" });
      expect(lhr.runtimeError).toBeUndefined();
      expect(new URL(lhr.finalDisplayedUrl!).pathname).toBe(route);
      expect(lhr.categories.performance.score).toBeGreaterThanOrEqual(0.9);
      expect(lhr.categories["best-practices"].score).toBeGreaterThanOrEqual(0.9);
      expect(lhr.categories.accessibility.score).toBe(1);
    }
  } finally {
    await browser.close();
    await chrome.kill();
    rmSync(profile, { recursive: true, force: true });
  }
});
