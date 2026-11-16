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
    expect(session, "Email login must issue a session cookie").toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(["Lax", "Strict"]).toContain(session!.sameSite);
    expect(session!.secure).toBe(page.url().startsWith("https:"));
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


test("SEC-HEADERS-001: production HTML and API responses enforce the baseline policy", async ({ page }) => {
  for (const path of ["/login", "/", "/api/health"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["strict-transport-security"]).toBeUndefined(); // HTTP is not an HSTS qualification.
  }
});
