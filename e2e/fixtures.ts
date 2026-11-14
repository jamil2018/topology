import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import {
  E2E_CUSTOM_ROLE,
  E2E_DEMO_USER,
  E2E_PRIMARY_PROJECT_NAME,
  E2E_PROJECTS,
  E2E_STORAGE_STATE,
  E2E_TOKENS,
  E2E_USERS,
} from "../src/db/seed-e2e-catalog";

/**
 * Opt-in harness. Existing specs keep importing from `@playwright/test`.
 *
 * API calls use `Authorization: Bearer <token>` against the Playwright baseURL:
 *   const ctx = await api(TOKENS.read); // `api` fixture
 *   const ctx = await createApiContext(TOKENS.read, baseURL);
 *   await request.newContext({
 *     baseURL,
 *     extraHTTPHeaders: { Authorization: `Bearer ${TOKENS.read}` },
 *   });
 * Dispose contexts returned by `createApiContext`. The `api` fixture disposes
 * the contexts it opens.
 */

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] as const;

export const USERS = {
  admin: {
    email: E2E_DEMO_USER.email,
    password: E2E_DEMO_USER.password,
  },
  member: {
    email: E2E_USERS.member.email,
    password: E2E_USERS.member.password,
  },
  viewer: {
    email: E2E_USERS.viewer.email,
    password: E2E_USERS.viewer.password,
  },
  custom: {
    email: E2E_USERS.custom.email,
    password: E2E_USERS.custom.password,
  },
  other: {
    email: E2E_USERS.other.email,
    password: E2E_USERS.other.password,
  },
} as const;

export const TOKENS = {
  read: E2E_TOKENS.read.token,
  ciWrite: E2E_TOKENS.ciWrite.token,
  agent: E2E_TOKENS.agent.token,
  revoked: E2E_TOKENS.revoked.token,
} as const;

export const STORAGE_STATE = E2E_STORAGE_STATE;

export const PROJECTS = {
  primary: E2E_PRIMARY_PROJECT_NAME,
  harborBeta: E2E_PROJECTS.harborBeta.name,
  foreign: E2E_PROJECTS.foreign.name,
} as const;

export const CASE_KEYS = {
  harborBeta: E2E_PROJECTS.harborBeta.caseKey,
  foreign: E2E_PROJECTS.foreign.caseKey,
} as const;

export const CUSTOM_ROLE = {
  name: E2E_CUSTOM_ROLE.name,
  actions: E2E_CUSTOM_ROLE.actions,
} as const;

export function makeAxeBuilder(page: Page) {
  return new AxeBuilder({ page }).withTags([...AXE_TAGS]);
}

export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function createApiContext(
  token: string,
  baseURL: string,
): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: bearerHeader(token),
  });
}

type ApiFactory = (token: string) => Promise<APIRequestContext>;

type HarnessFixtures = {
  makeAxeBuilder: (page: Page) => AxeBuilder;
  api: ApiFactory;
  asAdmin: Page;
  asMember: Page;
  asViewer: Page;
  asCustom: Page;
};

async function openStoredPage(
  browser: Browser,
  storageState: string,
  use: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await use(page);
  await context.close();
}

export const test = base.extend<HarnessFixtures>({
  makeAxeBuilder: async ({}, use) => {
    await use(makeAxeBuilder);
  },
  api: async ({ playwright, baseURL }, use) => {
    const opened: APIRequestContext[] = [];
    await use(async (token: string) => {
      const ctx = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: bearerHeader(token),
      });
      opened.push(ctx);
      return ctx;
    });
    await Promise.all(opened.map((ctx) => ctx.dispose()));
  },
  asAdmin: async ({ browser }, use) => {
    await openStoredPage(browser, STORAGE_STATE.admin, use);
  },
  asMember: async ({ browser }, use) => {
    await openStoredPage(browser, STORAGE_STATE.member, use);
  },
  asViewer: async ({ browser }, use) => {
    await openStoredPage(browser, STORAGE_STATE.viewer, use);
  },
  asCustom: async ({ browser }, use) => {
    await openStoredPage(browser, STORAGE_STATE.custom, use);
  },
});

export { expect };
