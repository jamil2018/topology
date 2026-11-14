import { existsSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { STORAGE_STATE, expect, test } from "../fixtures";

const roleStorageReady = (["member", "viewer", "custom"] as const).every(
  (role) => existsSync(path.join(process.cwd(), STORAGE_STATE[role])),
);

test.describe("role access", () => {
  test.beforeEach(() => {
    test.skip(
      !roleStorageReady,
      "Role storage states are written by the Playwright setup project",
    );
  });

  test("viewer loads test cases without a usable create control", async ({
    asViewer,
  }) => {
    await asViewer.goto("/cases");
    await expect(asViewer).toHaveURL(/\/cases/);
    await expect(
      asViewer.getByRole("heading", { name: "Test cases" }),
    ).toBeVisible();
    await expectCreateCaseBlocked(asViewer);

    const res = await asViewer.request.post("/api/cases", {
      data: {
        key: `RBAC-VIEW-${Date.now()}`,
        title: "Viewer must not create this case",
      },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({
      error: "Missing permission: cases.create",
    });
  });

  test("member can open cases and runs", async ({ asMember }) => {
    await openCasesAndRuns(asMember);
  });

  test("custom role can open cases and runs without an invite control", async ({
    asCustom,
  }) => {
    await openCasesAndRuns(asCustom);

    await asCustom.goto("/settings?section=access#members");
    await expect(
      asCustom.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      asCustom.getByRole("heading", { name: "Harbor members" }),
    ).toBeVisible();
    await expect(
      asCustom.getByRole("heading", { name: "Invite by email" }),
    ).toHaveCount(0);
    await expect(
      asCustom.getByRole("button", { name: "Create invite" }),
    ).toHaveCount(0);
  });
});

async function openCasesAndRuns(page: Page) {
  const nav = page.getByRole("navigation", { name: "Primary" });
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Test runs" })).toBeVisible();
  await nav.getByRole("link", { name: "Test runs" }).click();
  await expect(page.getByRole("heading", { name: "Test runs" })).toBeVisible();
  await nav.getByRole("link", { name: "Test cases" }).click();
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
}

async function expectCreateCaseBlocked(page: Page) {
  const create = page.getByRole("button", { name: "New case" });
  if ((await create.count()) === 0) {
    await expect(create).toHaveCount(0);
    return;
  }
  await expect(create).toBeDisabled();
}
