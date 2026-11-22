import { test, expect } from "../fixtures";

test("admin can open every settings section", async ({ page }) => {
  await page.goto("/settings?section=account");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const settingsNav = page.getByRole("navigation", { name: "Settings" });
  await expect(settingsNav.getByRole("link", { name: "Account" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preferences" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("group", { name: "Color theme" }),
  ).toBeVisible();

  await page.goto("/settings?section=projects");
  await expect(settingsNav.getByRole("link", { name: "Projects" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Custom fields" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shared steps" }),
  ).toBeVisible();

  await page.goto("/settings?section=access");
  await expect(settingsNav.getByRole("link", { name: "Access" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", { name: "Harbor members" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roles", exact:true })).toBeVisible();

  await page.goto("/settings?section=integrations");
  await expect(
    settingsNav.getByRole("link", { name: "Integrations" }),
  ).toHaveAttribute("aria-current", "page");
  for (const [title, heading] of [["Connect an agent", "Connect an agent"], ["Import automated results", "CI ingest"], ["Repositories", "Repositories"], ["AI drafting", "AI (optional)"], ["Webhooks", "Webhooks"]]) {
    const content = page.getByRole("heading", {name:heading, exact:true});
    await expect(content).not.toBeVisible();
    // HeroUI Disclosure uses a button trigger, not native <summary>.
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await expect(content).toBeVisible();
  }

  await page.goto("/settings?section=security");
  await expect(settingsNav.getByRole("link", { name: "Security" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "API tokens" })).toBeVisible();
  await expect(page.getByText("E2E ci-write")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});
