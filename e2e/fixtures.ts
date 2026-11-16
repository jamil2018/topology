import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { leaseDatabase } from "../scripts/validation/database";
import { randomUUID } from "node:crypto";
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
    storageState: { cookies: [], origins: [] },
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
  browserDiagnostics: void;
  isolatedProject: { id: string; name: string; admin: APIRequestContext };
  makeCase: (title?: string) => Promise<{ id: string; key: string; title: string }>;

};

async function openStoredPage(
  browser: Browser,
  storageState: string,
  use: (page: Page) => Promise<void>,
  baseURL?: string,
) {
  const context = await browser.newContext({ storageState, baseURL });
  const page = await context.newPage();
  try { await use(page); } finally { await context.close(); }
}

export const test = base.extend<HarnessFixtures>({
  baseURL: async ({ baseURL, playwright }, use, testInfo) => {
    if (process.env.TOPOLOGY_ISOLATE_BROWSER_TESTS !== "1" || testInfo.project.name === "setup") {
      await use(baseURL); return;
    }
    const lease = await leaseDatabase();
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer();
      socket.on("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const address = socket.address();
        const number = typeof address === "object" && address ? address.port : 0;
        socket.close(() => resolve(number));
      });
    });
    const url = `http://127.0.0.1:${port}`;
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = lease.url;
    const server = spawn(process.execPath, [".next/standalone/server.js"], {
      env: { ...process.env, DATABASE_URL: lease.url, PORT: String(port), HOSTNAME: "127.0.0.1", AUTH_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const probe = await playwright.request.newContext({ baseURL: url, storageState: { cookies: [], origins: [] } });
    let log = "";
    server.stdout!.on("data", (chunk) => { log += chunk.toString(); });
    server.stderr!.on("data", (chunk) => { log += chunk.toString(); });
    try {
      await expect.poll(async () => {
        if (server.exitCode !== null) throw new Error("Isolated production server exited before becoming ready");
        try { return (await probe.get("/api/health")).status(); }
        catch (error) {
          if (!log.includes("Health probe failed:")) log += `\nHealth probe failed: ${String(error)}; cause: ${String((error as Error & { cause?: unknown }).cause)}\n`;
          return 0;
        }
      }, { timeout: 20_000, intervals: [100, 250, 500] }).toBe(200);
      await use(url);
    } finally {
      try {
        await new Promise<void>((resolve) => {
          if (server.exitCode !== null) { resolve(); return; }
          server.once("exit", () => resolve());
          server.kill("SIGTERM");
          const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
          timer.unref();
        });
        await testInfo.attach("isolated-server.log", { body: log, contentType: "text/plain" });
      } finally {
        await probe.dispose();
        process.env.DATABASE_URL = previous;
        await lease.close();
      }
    }
  },
  isolatedProject: async ({ playwright, baseURL, page }, use) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: STORAGE_STATE.admin });
    let id: string | undefined;
    try {
      const name = `Validation ${randomUUID()}`;
      const created = await admin.post("/api/projects", { data: { name, slug: `validation-${randomUUID()}` } });
      expect(created.status()).toBe(201);
      id = (await created.json()).project.id;
      expect((await page.request.post("/api/projects", { data: { action: "select", id } })).status()).toBe(200);
      await use({ id: id!, name, admin });
    } finally {
      try { if (id) expect((await admin.delete(`/api/projects?id=${id}`)).status()).toBe(200); }
      finally { await admin.dispose(); }
    }
  },
  makeCase: async ({ isolatedProject }, use) => {
    await use(async (title = `Validation case ${randomUUID()}`) => {
      const key = `VAL-${randomUUID().slice(0, 8).toUpperCase()}`;
      const response = await isolatedProject.admin.post("/api/cases", { data: { key, title, status: "ready" } });
      expect(response.status()).toBe(201);
      return (await response.json()).case;
    });
  },
  browserDiagnostics: [async ({ page, browserName, baseURL }, use, testInfo) => {
    const messages: { type: string; message: string }[] = [];
    let documentReplacement = false;
    page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentReplacement = true; });
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) documentReplacement = false; });
    page.on("pageerror", (error) => {
      // Upstream WebKit #43120 reports cancelled same-origin requests during
      // document replacement as page errors. Retain them, but distinguish only
      // this exact engine condition while a main-frame navigation is pending.
      const cancellation = browserName === "webkit" && documentReplacement &&
        error.message.endsWith("due to access control checks.") &&
        Boolean(baseURL && error.message.includes(new URL(baseURL).host));
      messages.push({ type: cancellation ? "webkit-navigation-cancellation" : "pageerror", message: error.message });
    });
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) messages.push({ type: message.type(), message: message.text() });
    });
    try { await use(); } finally {
      if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
        await testInfo.attach("failure.png", { body: await page.screenshot({
          mask: [page.locator("input[type=password]"), page.getByLabel("Shareable report URL")],
        }), contentType: "image/png" });
      }
      if (messages.length) await testInfo.attach("browser-errors.json", { body: JSON.stringify(messages, null, 2), contentType: "application/json" });
      const allowed = testInfo.annotations.filter((entry) => entry.type === "expected-page-error").map((entry) => entry.description ?? "");
      expect(messages.filter((entry) => entry.type === "pageerror" && !allowed.some((text) => text && entry.message.includes(text))), "Unexpected browser JavaScript errors").toEqual([]);
    }
  }, { auto: true }],
  makeAxeBuilder: async ({}, use) => {
    await use(makeAxeBuilder);
  },
  api: async ({ playwright, baseURL }, use) => {
    const opened: APIRequestContext[] = [];
    try { await use(async (token: string) => {
      const ctx = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: bearerHeader(token),
        storageState: { cookies: [], origins: [] },
      });
      opened.push(ctx);
      return ctx;
    }); } finally { await Promise.all(opened.map((ctx) => ctx.dispose())); }
  },
  asAdmin: async ({ browser, baseURL }, use) => {
    await openStoredPage(browser, STORAGE_STATE.admin, use, baseURL);
  },
  asMember: async ({ browser, baseURL }, use) => {
    await openStoredPage(browser, STORAGE_STATE.member, use, baseURL);
  },
  asViewer: async ({ browser, baseURL }, use) => {
    await openStoredPage(browser, STORAGE_STATE.viewer, use, baseURL);
  },
  asCustom: async ({ browser, baseURL }, use) => {
    await openStoredPage(browser, STORAGE_STATE.custom, use, baseURL);
  },
});

export { expect };

export type { Page, Locator } from "@playwright/test";
