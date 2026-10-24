import { describe, expect, it } from "vitest";
import { EXECUTION_PROTOCOL_VERSION, parseExecutionReport } from "@topology/domain";
import { intentKeyFromTitle, mapJestAssertion, mapJestStatus } from "./map-test";
import { TopologyJestReporter } from "./reporter";

describe("mapJestStatus", () => {
  it("maps Jest statuses onto the execution protocol", () => {
    expect(mapJestStatus("passed")).toBe("passed");
    expect(mapJestStatus("failed")).toBe("failed");
    expect(mapJestStatus("pending")).toBe("skipped");
    expect(mapJestStatus("unknown")).toBe("error");
  });
});

describe("mapJestAssertion", () => {
  it("prefers a title intent key and keeps file::title as externalKey", () => {
    const mapped = mapJestAssertion(
      {
        title: "AUTH-001: login works",
        ancestorTitles: ["auth"],
        status: "passed",
        duration: 12,
      },
      "src/auth.test.ts",
    );
    expect(mapped.intentKey).toBe("AUTH-001");
    expect(mapped.externalKey).toBe("src/auth.test.ts::auth › AUTH-001: login works");
    expect(mapped.status).toBe("passed");
    expect(intentKeyFromTitle("no key")).toBeUndefined();
  });
});

describe("TopologyJestReporter", () => {
  it("builds a valid execution report from aggregated Jest results", () => {
    const reporter = new TopologyJestReporter(undefined, { dryRun: true });
    const results = reporter.collect({
      testResults: [
        {
          testFilePath: "src/login.test.ts",
          testResults: [
            { title: "AUTH-001: signs in", status: "passed", duration: 8 },
            {
              title: "shows error",
              status: "failed",
              duration: 3,
              failureMessages: ["boom"],
            },
          ],
        },
      ],
    });
    const report = reporter.buildReport(results);
    const parsed = parseExecutionReport(report);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.version).toBe(EXECUTION_PROTOCOL_VERSION);
    expect(parsed.report.results).toHaveLength(2);
    expect(parsed.report.results[1]?.errorMessage).toBe("boom");
  });
});
