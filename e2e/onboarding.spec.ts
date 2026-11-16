import { expect, test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });
test("FN-AUTH-001: empty-instance setup permits exactly one first admin and real login", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("button", { name: "Create admin", exact: true })).toBeVisible();
  const password = "validation-admin-password";
  const accounts = ["first@onboarding.test", "second@onboarding.test"];
  const responses = await Promise.all(accounts.map((email) => page.request.post("/api/setup", {
    data: { name: "First administrator", email, password },
  })));
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const index = responses.findIndex((response) => response.status() === 200);
  await page.goto("/login");
  await page.getByLabel("Email").fill(accounts[index]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  expect(await (await page.request.get("/api/setup")).json()).toEqual({ needsSetup: false });
});
