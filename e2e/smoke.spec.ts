import { test, expect } from "@playwright/test";

test("login page renders Topology brand", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();
  await expect(page.getByText("Demo:")).toBeVisible();
});

test("demo credentials reach the hub", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@topology.local");
  await page.getByLabel("Password").fill("topology-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Operating hub")).toBeVisible();
});
