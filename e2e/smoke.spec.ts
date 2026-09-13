import { test, expect } from "@playwright/test";

test("login page renders Topology brand", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();
  await expect(page.getByText(/demo@topology.local/)).toBeVisible();
});

test("demo credentials reach the hub", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@topology.local");
  await page.getByLabel("Password").fill("topology-demo");
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await expect(page.getByText("Operating hub")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("link", { name: /Topology/i }).first()).toBeVisible();
});

test("health endpoint reports status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe("ok");
});
