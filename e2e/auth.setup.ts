import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import {
  E2E_DEMO_USER,
  E2E_STORAGE_STATE,
  E2E_USERS,
} from "../src/db/seed-e2e-catalog";

mkdirSync(path.join(process.cwd(), "e2e", ".auth"), { recursive: true });

const accounts = [
  {
    role: "admin",
    email: E2E_DEMO_USER.email,
    password: E2E_DEMO_USER.password,
    file: E2E_STORAGE_STATE.admin,
  },
  {
    role: "member",
    email: E2E_USERS.member.email,
    password: E2E_USERS.member.password,
    file: E2E_STORAGE_STATE.member,
  },
  {
    role: "viewer",
    email: E2E_USERS.viewer.email,
    password: E2E_USERS.viewer.password,
    file: E2E_STORAGE_STATE.viewer,
  },
  {
    role: "custom",
    email: E2E_USERS.custom.email,
    password: E2E_USERS.custom.password,
    file: E2E_STORAGE_STATE.custom,
  },
] as const;

for (const account of accounts) {
  setup(`authenticate ${account.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: /Sign in with email/i }).click();
    await expect(page).toHaveURL(new URL("/", page.url()).href, {timeout:20_000});
    await expect(page.locator("main h1").first()).toBeVisible({
      timeout: 20_000,
    });
    await page.context().storageState({ path: account.file });
  });
}
