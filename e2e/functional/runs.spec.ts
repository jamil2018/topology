import { test, expect } from "../fixtures";
import {
  SEEDED_RUN_TITLES,
  caseStatusButton,
  focusedCaseKey,
  startManualRun,
} from "./run-flow";

test("take an exploratory charter from findings to a reviewed case proposal", async ({ page }) => {
  const name = `Explore checkout ${Date.now()}`;
  const caseKey = `EXP-${Date.now()}`;
  await page.goto("/runs/new");
  await page.getByRole("link", { name: "Exploratory session" }).click();
  await page.getByLabel("Session name").fill(name);
  await page.getByLabel("Charter").fill("Explore checkout recovery after the network disconnects.");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Explore checkout recovery after the network disconnects.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exploratory findings" })).toBeVisible();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Retry leaves a blank screen.");
  const recorded = page.waitForResponse((response) =>
    response.url().includes("/api/runs/") && response.request().method() === "PATCH" &&
    response.request().postData()?.includes('"status":"failed"') === true
  );
  await caseStatusButton(page, "failed").click();
  expect((await recorded).ok()).toBeTruthy();

  await page.getByRole("button", { name: "Propose a follow-up case" }).click();
  await page.getByLabel("Case key", { exact: true }).fill(caseKey);
  await page.getByLabel("Case title").fill("Restore checkout after a disconnect");
  await page.getByLabel("Steps to reproduce").fill("Reconnect and retry checkout.");
  await page.getByLabel("Expected result").fill("Checkout restores the cart.");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proposal submitted." })).toBeVisible();
  const sourceRun = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Open the review queue" }).click();
  const proposal = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Open source run" }) }).filter({ hasText: caseKey });
  await expect(proposal.getByRole("link", { name: "Open source run" })).toHaveAttribute("href", sourceRun);
  await proposal.getByText(`create case ${caseKey}: Restore checkout after a disconnect`).click();
  await expect(proposal.getByText("Checkout restores the cart.", { exact: false }).last()).toBeVisible();
  await proposal.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("link", { name: `case ${caseKey}` })).toHaveAttribute("href", `/cases/${caseKey}`);
});

test("pass, fail, block, skip, complete, and lock the run", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `E2E run ${Date.now()}`;
  await startManualRun(page, name, SEEDED_RUN_TITLES);

  const caseList = page.getByRole("list", { name: "Run cases" });
  await expect(caseList.getByRole("listitem")).toHaveCount(SEEDED_RUN_TITLES.length);

  for (const status of ["passed", "failed", "blocked"] as const) {
    const before = await focusedCaseKey(page).innerText();
    await caseStatusButton(page, status).click();
    await expect(
      caseList.getByRole("button", { name: new RegExp(`${before}.* · ${status}$`) }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(focusedCaseKey(page)).not.toHaveText(before, { timeout: 10_000 });
  }

  await expect(caseStatusButton(page, "skipped")).toBeVisible();
  const skippedKey = await focusedCaseKey(page).innerText();
  await caseStatusButton(page, "skipped").click();
  await expect(page.getByRole("list", {name:"Run cases"}).getByRole("button", {name:new RegExp(`${skippedKey}.* · skipped$`)})).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Complete this run?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete run" }).click();

  await expect(
    page.getByText("This run is completed and locked."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Complete", exact: true }),
  ).toHaveCount(0);
  await expect(caseStatusButton(page, "passed")).toBeDisabled();
  await expect(caseStatusButton(page, "failed")).toBeDisabled();
  await expect(caseStatusButton(page, "blocked")).toBeDisabled();
  await expect(caseStatusButton(page, "skipped")).toBeDisabled();
});
