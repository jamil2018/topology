import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXECUTION_PROTOCOL_VERSION,
  parseExecutionReport,
} from "@topology/domain";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/execution",
);

describe("cli run upload (domain path)", () => {
  it("parses the sample execution fixture", async () => {
    const raw = JSON.parse(
      await readFile(path.join(fixtures, "sample-report.json"), "utf8"),
    ) as unknown;
    const result = parseExecutionReport(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.version).toBe(EXECUTION_PROTOCOL_VERSION);
    expect(result.report.run?.branch).toBe("main");
    expect(result.report.results).toHaveLength(3);
    expect(result.report.results.map((r) => r.status)).toEqual([
      "passed",
      "failed",
      "skipped",
    ]);
    expect(result.report.results[1]?.intentKey).toBe("AUTH-021");
    expect(result.report.results[1]?.artifacts).toHaveLength(2);
  });

  it("rejects an empty results array like the CLI upload guard", () => {
    const result = parseExecutionReport({ version: 1, results: [] });
    expect(result.ok).toBe(false);
  });
});
