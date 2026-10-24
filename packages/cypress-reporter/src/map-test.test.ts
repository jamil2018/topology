import { describe, expect, it } from "vitest";
import { EXECUTION_PROTOCOL_VERSION, parseExecutionReport } from "@topology/domain";
import { intentKeyFromTitle, mapCypressStatus, mapCypressTest } from "./map-test";
import { buildCypressReport, collectCypressResults } from "./plugin";

describe("mapCypressStatus", () => {
  it("maps Cypress states onto the execution protocol", () => {
    expect(mapCypressStatus("passed")).toBe("passed");
    expect(mapCypressStatus("failed")).toBe("failed");
    expect(mapCypressStatus("pending")).toBe("skipped");
    expect(mapCypressStatus("")).toBe("error");
  });
});

describe("mapCypressTest", () => {
  it("uses the leaf title for intent keys", () => {
    const mapped = mapCypressTest(
      {
        title: ["auth", "AUTH-001: login"],
        state: "passed",
        duration: 40,
      },
      { relative: "cypress/e2e/auth.cy.ts" },
    );
    expect(mapped.intentKey).toBe("AUTH-001");
    expect(mapped.externalKey).toBe(
      "cypress/e2e/auth.cy.ts::auth › AUTH-001: login",
    );
    expect(intentKeyFromTitle("plain")).toBeUndefined();
  });
});

describe("collectCypressResults", () => {
  it("builds a valid execution report", () => {
    const results = collectCypressResults({
      runs: [
        {
          spec: { relative: "cypress/e2e/pay.cy.ts" },
          tests: [
            { title: ["checkout"], state: "passed", duration: 10 },
            {
              title: ["checkout", "fails"],
              state: "failed",
              duration: 5,
              displayError: "timed out",
            },
          ],
          screenshots: [{ name: "fails.png", path: "cypress/screenshots/fails.png" }],
        },
      ],
    });
    const report = buildCypressReport(results);
    const parsed = parseExecutionReport(report);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.version).toBe(EXECUTION_PROTOCOL_VERSION);
    expect(parsed.report.results).toHaveLength(2);
    expect(parsed.report.results[1]?.errorMessage).toBe("timed out");
    expect(parsed.report.results[1]?.artifacts).toHaveLength(1);
  });
});
