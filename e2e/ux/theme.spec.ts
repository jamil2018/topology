import { expect, test, type Page } from "../fixtures";

/** `THEME_STORAGE_KEY` in `src/components/theme-provider.tsx`. */
const THEME_STORAGE_KEY = "topology-theme";

async function chooseTheme(page: Page, mode: "Light" | "Dark" | "System") {
  const saved = page.waitForResponse((response) => {
    if (!response.url().includes("/api/settings")) return false;
    if (response.request().method() !== "PATCH") return false;
    const body = response.request().postData() ?? "";
    return body.includes(`"${mode.toLowerCase()}"`);
  });
  await page
    .getByRole("radiogroup", { name: "Color theme" })
    .getByRole("radio", { name: `${mode} theme` })
    .click();
  expect((await saved).ok()).toBeTruthy();
}

test("theme toggle cycles light and dark and persists", async ({ page }) => {
  const settingsLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("/api/settings") &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await settingsLoaded;

  const root = page.locator("html");
  const group = page.getByRole("radiogroup", { name: "Color theme" });
  await expect(group).toBeVisible();

  await chooseTheme(page, "Light");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).not.toHaveClass(/\bdark\b/);
  await expect(group.getByRole("radio", { name: "Light theme" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await chooseTheme(page, "Dark");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveClass(/\bdark\b/);
  await expect(group.getByRole("radio", { name: "Dark theme" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await chooseTheme(page, "System");
  await expect(group.getByRole("radio", { name: "System theme" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(root).toHaveAttribute("data-theme", /^(light|dark)$/);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe("system");

  await chooseTheme(page, "Dark");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe("dark");

  const persisted = page.waitForResponse(
    (response) =>
      response.url().includes("/api/settings") &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await page.reload();
  await persisted;

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe("dark");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveClass(/\bdark\b/);
});
