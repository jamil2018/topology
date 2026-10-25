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

  // Hub lands on QA home (overview pulse is ?view=overview).
  await expect(
    page.getByRole("heading", { name: "QA home" }),
  ).toBeVisible();
  await expect(page.getByText("My assigned runs")).toBeVisible();

  // Cases
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: "Cases",
    exact: true,
  }).click();
  await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Search cases").fill("HAR-1");
  await expect(page.getByText("HAR-1").first()).toBeVisible({
    timeout: 10_000,
  });

  // Runs — create a dedicated release-gate run
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: "Runs",
    exact: true,
  }).click();
  await expect(page.getByRole("heading", { name: "Test Runs" })).toBeVisible({
    timeout: 15_000,
  });

  const runName = `Release gate ${Date.now()}`;
  await page.getByRole("link", { name: /Start a run/i }).first().click();
  await expect(page.getByRole("heading", { name: "Start a run" })).toBeVisible({
    timeout: 15_000,
  });
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

  await page.getByRole("button", { name: /Mark .+ as failed/ }).first().click();
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
