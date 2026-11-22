import { ownedDatabase } from "./database";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
for (const theme of ["light", "dark"] as const) {
  test(`primary screens, case dialog and empty state in ${theme}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-01-02T12:00:00Z"));
    const loaded = page.waitForResponse((response) => response.url().includes("/api/settings") && response.request().method() === "GET");
    await page.goto("/");
    await loaded;
    await page.getByRole("radiogroup", { name: "Color theme" }).getByRole("radio", { name: `${theme === "light" ? "Light" : "Dark"} theme`, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const [url, title, name] of [
      ["/", "Home", "home"], ["/cases", "Test cases", "cases"], ["/runs", "Test runs", "runs"],
      ["/reports?range=all", "Reports", "reports"], ["/settings", "Settings", "settings"],
    ]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { fullPage: true, animations: "disabled" });
    }
    testInfo.annotations.push({ type: "expected-page-error", description: "An error occurred in the Server Components render" });
    const sql = await ownedDatabase();
    let renamed = false;
    try {
      await sql`ALTER TABLE cases RENAME TO cases_validation_unavailable`;
      renamed = true;
      await page.goto("/cases");
      await expect(page.getByRole("heading", { name: "Test cases couldn’t load" })).toBeVisible();
      await expect(page).toHaveScreenshot(`cases-error-${theme}.png`, { animations: "disabled" });
      await sql`ALTER TABLE cases_validation_unavailable RENAME TO cases`;
      renamed = false;
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Test cases", exact: true })).toBeVisible();
    } finally {
      try { if (renamed) await sql`ALTER TABLE cases_validation_unavailable RENAME TO cases`; }
      finally { await sql.end(); }
    }
    await page.getByRole("button", { name: /^Checkout presentation with a deliberately long/ }).click();
    await expect(page.getByRole("dialog", { name: /^Case / })).toBeVisible();
    await expect(page).toHaveScreenshot(`case-dialog-${theme}.png`, { animations: "disabled" });
    await page.getByRole("button", { name: "Close case editor", exact: true }).click();
    await page.getByRole("button", { name: "New case", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`case-authoring-${theme}.png`, { animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByLabel("Search cases").filter({ visible: true }).fill("visual-no-match-fixture");
    await expect(page.getByText("No cases match this search or folder.", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`cases-empty-${theme}.png`, { animations: "disabled" });
  });
}
