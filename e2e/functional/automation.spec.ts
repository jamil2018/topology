import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  dedupeNormalizedResults,
  normalizeJUnitCases,
  parseJUnitXml,
} from "../../packages/domain/src/junit";
import { test, expect, TOKENS } from "../fixtures";

async function submitJunit(
  api: (token: string) => Promise<import("@playwright/test").APIRequestContext>,
  fileName: string,
  runName: string,
) {
  const raw = await readFile(
    path.join(process.cwd(), "fixtures", "junit", fileName),
    "utf8",
  );
  const results = dedupeNormalizedResults(
    normalizeJUnitCases(parseJUnitXml(raw).cases),
  );
  const ctx = await api(TOKENS.ciWrite);
  const res = await ctx.post("/api/ci/junit", {
    data: { name: runName, source: "cli", results },
  });
  const text = await res.text();
  expect(res.ok(), text).toBeTruthy();
  return JSON.parse(text) as {
    run: { id: string; name: string };
    summary: { total: number; passed: number; failed: number };
  };
}

test("automation lists a run after JUnit ingest", async ({ page, api }) => {
  await page.goto("/automation");
  await expect(
    page.getByRole("heading", { name: "Automation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Automation runs" }),
  ).toBeVisible();

  const name = `E2E junit smoke ${Date.now()}`;
  const body = await submitJunit(api, "smoke.xml", name);
  expect(body.summary).toMatchObject({ total: 3, passed: 2, failed: 1 });
  expect(body.run.name).toBe(name);

  await page.reload();
  await expect(page.getByRole("link", { name })).toBeVisible({
    timeout: 15_000,
  });
});

test("false-green JUnit ingest reports the hidden failures", async ({ api }) => {
  const name = `E2E junit false-green ${Date.now()}`;
  const body = await submitJunit(api, "false-green.xml", name);
  expect(body.summary).toMatchObject({ total: 3, passed: 1, failed: 2 });
});
