import type { Page } from "@playwright/test";
import { DEFAULT_NAV_HREFS, isQualityGraphHref } from "../../src/lib/nav-diet";
import { expect, makeAxeBuilder, test } from "../fixtures";

/** Primary nav only. Quality-graph destinations stay out until that opt-in is on. */
const PRIMARY_HREFS = DEFAULT_NAV_HREFS.filter((href) => !isQualityGraphHref(href));

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

function routeName(href: string): string {
  return href === "/" ? "hub" : href.replace(/^\//, "");
}

function formatTarget(target: unknown): string {
  if (Array.isArray(target)) return target.map((part) => formatTarget(part)).join(" >> ");
  return String(target);
}

function formatViolation(violation: {
  id: string;
  impact?: string | null;
  nodes: Array<{ target: unknown }>;
}): string {
  const targets = violation.nodes.map((node) => formatTarget(node.target)).join("; ");
  return `${violation.impact ?? "unknown"} ${violation.id}: ${targets}`;
}

async function expectNoSeriousOrCriticalViolations(page: Page) {
  const results = await makeAxeBuilder(page).analyze();
  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ""),
  );
  const noted = results.violations.filter(
    (violation) => violation.impact === "minor" || violation.impact === "moderate",
  );
  if (noted.length > 0) {
    test.info().annotations.push({
      type: "axe-minor-moderate",
      description: noted.map((violation) => formatViolation(violation)).join("\n"),
    });
  }
  expect(
    blocking,
    blocking.map((violation) => formatViolation(violation)).join("\n") ||
      "serious or critical axe violations",
  ).toEqual([]);
}

for (const href of PRIMARY_HREFS) {
  test(`${routeName(href)} page has no serious axe violations @a11y`, async ({ page }) => {
    await page.goto(href);
    await expect(page.locator("main")).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
}

test.describe("logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page has no serious axe violations @a11y", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
