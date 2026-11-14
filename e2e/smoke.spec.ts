import { test, expect } from "@playwright/test";

// desktop-1440 injects the admin session and /login redirects to the hub.
// These two tests assert the logged-out form. Health does not need a session.
test.describe("logged-out smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page renders Topology brand", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();
    await expect(page.getByLabel("Email", {exact:true})).toBeVisible();
  });

  test("demo credentials reach the hub", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@topology.local");
    await page.getByLabel("Password").fill("topology-demo");
    await page.getByRole("button", { name: /Sign in with email/i }).click();
    await expect(page.getByRole("heading", {name:"Home",exact:true})).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /Topology/i }).first()).toBeVisible();
  });
});

test("health endpoint reports status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe("ok");
});
