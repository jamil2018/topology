import { expect, test, USERS } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

const callbacks = ["//evil.example", "https://evil.example"] as const;

for (const callbackUrl of callbacks) {
  test(`login callback ${callbackUrl} stays on this origin`, async ({ page }) => {
    await page.goto("/login");
    const origin = new URL(page.url()).origin;
    await page.goto(
      `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
    await page.getByLabel("Email").fill(USERS.admin.email);
    await page.getByLabel("Password").fill(USERS.admin.password);
    await page.getByRole("button", { name: "Sign in with email" }).click();
    await page.waitForURL(
      (url) => url.origin === origin && !url.pathname.startsWith("/login"),
      { timeout: 15_000 },
    );
    const landed = new URL(page.url());
    expect(landed.origin).toBe(origin);
    expect(landed.hostname).not.toContain("evil.example");
    expect(page.url()).not.toContain("evil.example");
  });
}
