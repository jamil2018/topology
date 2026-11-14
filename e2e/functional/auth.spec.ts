import { test, expect, USERS } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

async function revealEmailForm(page: import("@playwright/test").Page) {
  const email = page.getByLabel("Email");
  if (await email.isVisible()) return;
  await page.getByRole("button", { name: "Use email instead" }).click();
  await expect(email).toBeVisible();
}

test("logged-out login page offers email sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();

  const oauth = page.getByRole("button", { name: /Continue with / });
  if ((await oauth.count()) > 0) {
    await expect(oauth.first()).toBeVisible();
  }

  await revealEmailForm(page);
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with email" }),
  ).toBeVisible();
});

test("wrong password stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await revealEmailForm(page);
  await page.getByLabel("Email").fill(USERS.admin.email);
  await page.getByLabel("Password").fill("not-the-real-password");
  await page.getByRole("button", { name: "Sign in with email" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid email or password" }),
  ).toHaveText("Invalid email or password");
  await expect(page.getByRole("heading", { name: "Home" })).toHaveCount(0);
});

test("sign out returns to the login page", async ({ asAdmin }) => {
  await asAdmin.goto("/");
  await expect(
    asAdmin.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  await asAdmin.getByRole("button", { name: "Sign out" }).click();
  await expect(asAdmin).toHaveURL(/\/login$/);
  await expect(
    asAdmin.getByRole("heading", { name: "Topology" }),
  ).toBeVisible();
  await expect(asAdmin.getByLabel("Email")).toBeVisible();
});

test.fixme("first-run /setup redirects to /login while any user exists, so admin creation cannot run without destroying the seeded database", async () => {});
