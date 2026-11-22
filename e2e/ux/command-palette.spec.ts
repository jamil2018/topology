import { expect, test } from "../fixtures";

/**
 * Command palette dialog name comes from `aria-label="Command palette"`
 * in `src/components/command-palette.tsx`. "Test cases" is a palette page
 * in `src/lib/nav-diet.ts`.
 */
test("command palette opens and jumps to test cases", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  const search = dialog.getByRole("textbox", { name: "Command search" });
  await search.fill("Test cases");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/cases/);
  await expect(dialog).toBeHidden();
});

test("escape closes the command palette", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  // Cases search can steal focus; blur so the global ⌘K listener fires cleanly.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
