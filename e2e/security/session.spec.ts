import { expect, STORAGE_STATE, test, USERS } from "../fixtures";

test.describe("logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visiting /cases redirects to login", async ({ page }) => {
    await page.goto("/cases");
    await expect(page).toHaveURL(/\/login/);
  });

  test("email sign-in leaves login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.admin.email);
    await page.getByLabel("Password").fill(USERS.admin.password);
    await page.getByRole("button", { name: "Sign in with email" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    const session = (await page.context().cookies()).find((cookie) =>
      cookie.name.includes("session-token"),
    );
    if (!session) return;
    expect(session.httpOnly).toBe(true);
    expect(["Lax", "Strict"]).toContain(session.sameSite);
    if (page.url().startsWith("https:")) {
      expect(session.secure).toBe(true);
    }
  });
});

test.describe("logout", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test("sign out returns to login", async ({ page }) => {
    await page.goto("/cases");
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await signOut.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
