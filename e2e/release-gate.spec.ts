import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@topology.local");
  await page.getByLabel("Password").fill("topology-demo");
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await expect(page.getByText("Operating hub")).toBeVisible({
    timeout: 20_000,
  });
}

test("release gate: login → hub → case → run → fail → mock issue → triage", async ({
  page,
}) => {
  await signIn(page);

  // Hub readiness / pulse smoke
  await expect(page.getByText("Quality pulse")).toBeVisible();
  await expect(page.getByText("Milestone gate", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/^(Go|At risk|No-Go)$/).first(),
  ).toBeVisible();

  // Cases
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: /Test Cases/,
  }).click();
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("TOP-1").first()).toBeVisible();

  // Runs — create a dedicated release-gate run
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: /Test Runs/,
  }).click();
  await expect(page.getByRole("heading", { name: "Runs" })).toBeVisible({
    timeout: 15_000,
  });

  const runName = `Release gate ${Date.now()}`;
  const startTrigger = page.getByRole("button", { name: /Start a run/i });
  if (await startTrigger.isVisible()) {
    // Disclosure may already be expanded; click only if needed
    const runNameField = page.getByLabel("Run name");
    if (!(await runNameField.isVisible().catch(() => false))) {
      await startTrigger.click();
    }
  }
  await page.getByLabel("Run name").fill(runName);
  await page.getByRole("button", { name: /Create run/ }).click();
  await expect(page.getByRole("heading", { name: runName })).toBeVisible({
    timeout: 20_000,
  });

  // Execute: start → fail first case → create mock issue
  const startBtn = page.getByRole("button", { name: "Start" });
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await expect(startBtn).toBeHidden({ timeout: 15_000 });
  }

  await page.getByRole("button", { name: "failed", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Create issue" }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Create issue uses TOPOLOGY_ISSUE_PROVIDER=mock (no remote OAuth/issue APIs).
  await page.getByRole("button", { name: "Create issue" }).first().click();
  await expect(page.getByText(/MOCK-\d+/).first()).toBeVisible({
    timeout: 20_000,
  });

  // Triage smoke
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: /Triage/,
  }).click();
  await expect(page.getByRole("heading", { name: "Triage" })).toBeVisible({
    timeout: 15_000,
  });
});
