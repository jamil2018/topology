import { test, expect } from "./fixtures";

// desktop-1440 injects the admin session. /login then redirects home, so the
// gate never reaches the email form it is asserting.
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@topology.local");
  await page.getByLabel("Password").fill("topology-demo");
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await expect(page.getByRole("heading", {name:"Home",exact:true})).toBeVisible({
    timeout: 20_000,
  });
}

test("release gate: login → hub → case → run → fail → mock issue → triage", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);

  // Hub lands on QA home (overview pulse is ?view=overview).
  await expect(
    page.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", {name:"My assigned runs",exact:true})).toBeVisible();

  // Cases
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: "Test cases",
    exact: true,
  }).click();
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Search cases").filter({visible:true}).fill("HAR-1");
  await expect(page.getByText("HAR-1").first()).toBeVisible({
    timeout: 10_000,
  });

  // Runs — create a dedicated release-gate run
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: "Test runs",
    exact: true,
  }).click();
  await expect(page.getByRole("heading", { name: "Test runs" })).toBeVisible({
    timeout: 15_000,
  });

  const runName = `Release gate ${Date.now()}`;
  await page.getByRole("link", { name: /Start a run/i }).first().click();
  await expect(page.getByRole("heading", { name: "Start a run" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Run name").filter({visible:true}).fill(runName);
  await page.getByRole("button", { name: /Create run/ }).click();
  await expect(page.getByRole("heading", { name: runName })).toBeVisible({
    timeout: 20_000,
  });

  // Execute: start → fail first case → create mock issue
  const startBtn = page.getByRole("button", { name: "Start" });
  await expect(startBtn).toBeVisible();
  await startBtn.click();
  await expect(startBtn).toBeHidden({ timeout: 15_000 });

  await page.getByRole("button", { name: /Mark .+ as failed/ }).first().click();
  // Auto-advance leaves the next untested case focused. Wait for the
  // Failed chip count, then filter so the failed case is focused again.
  const failedChip = page.getByRole("button", { name: /^Failed \d+$/ });
  await expect(failedChip).toContainText("1");
  await failedChip.click();
  await expect(page.getByRole("button", { name: "Create issue" })).toBeVisible({
    timeout: 15_000,
  });

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
