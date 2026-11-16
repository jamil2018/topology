import { test, expect } from "./fixtures";

const routes = ["/", "/cases", "/runs", "/runs/new", "/plans", "/triage", "/automation", "/reports", "/settings", "/requirements", "/releases", "/cases/import", "/intents", "/journeys", "/components", "/risks", "/milestones"];
for (const route of routes) {
  test(`reflow ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    for (const width of [320, 390, 834, 1194, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} at ${width}`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} 200% CSS zoom`).toBeLessThanOrEqual(1);
  });
}

test("case filters and pagination restore through browser Back", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  const search = page.getByLabel("Search cases", { exact: true }).filter({visible:true});
  await search.fill("checkout");
  await expect(page).toHaveURL(/q=checkout/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(search).toHaveValue("");
});

test("case details allow browser navigation and preserve a dirty draft", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await page.goto("/cases");
  await page.getByRole("button", { name: "HAR-1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Case HAR-1" });
  await expect(dialog).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Preserve this unsaved draft");
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Discard unsaved changes/)).toBeVisible();
  await page.getByRole("button", { name: /Keep editing/ }).click();
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).not.toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Preserve this unsaved draft");
  await page.getByRole("button", {name:"Browse test cases",exact:true}).focus();
  await expect(page.getByLabel("Search cases", {exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", {name:"Title",exact:true})).toHaveValue("Preserve this unsaved draft");
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Preserve this unsaved draft");
});
