import { describe, expect, it } from "vitest";
import {
  EXECUTION_PROTOCOL_VERSION,
  parseExecutionReport,
  parseExecutionReportOrThrow,
} from "./execution-protocol";

const validReport = {
  version: 1,
  run: {
    commitSha: "abc123",
    branch: "main",
    environment: { browser: "chromium", os: "linux" },
  },
  results: [
    {
      status: "failed",
      durationMs: 4200,
      environment: { browser: "chromium", os: "linux" },
      intentKey: "AUTH-021",
      implementationId: "11111111-1111-1111-1111-111111111111",
      artifacts: [
        {
          kind: "screenshot",
          name: "lockout.png",
          path: "artifacts/lockout.png",
        },
        { kind: "trace", path: "artifacts/trace.zip" },
      ],
      errorMessage: "Expected lockout banner",
    },
  ],
};

describe("parseExecutionReport", () => {
  it("accepts a fixture report with env, artifacts, and identity", () => {
    const result = parseExecutionReport(validReport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.version).toBe(EXECUTION_PROTOCOL_VERSION);
    expect(result.report.results).toHaveLength(1);
    const row = result.report.results[0]!;
    expect(row.status).toBe("failed");
    expect(row.durationMs).toBe(4200);
    expect(row.environment).toEqual({ browser: "chromium", os: "linux" });
    expect(row.intentKey).toBe("AUTH-021");
    expect(row.implementationId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(row.artifacts).toEqual([
      {
        kind: "screenshot",
        name: "lockout.png",
        path: "artifacts/lockout.png",
      },
      { kind: "trace", path: "artifacts/trace.zip" },
    ]);
  });

  it("defaults version and empty artifacts", () => {
    const result = parseExecutionReport({
      results: [{ status: "passed", intentKey: "AUTH-021" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.version).toBe(1);
    expect(result.report.results[0]!.artifacts).toEqual([]);
  });

  it("accepts externalKey as sole identity", () => {
    const result = parseExecutionReport({
      results: [{ status: "skipped", externalKey: "AUTO-login" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing results", () => {
    const result = parseExecutionReport({ version: 1, results: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.includes("results"))).toBe(true);
  });

  it("rejects results without identity", () => {
    const result = parseExecutionReport({
      results: [{ status: "passed", durationMs: 10 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) =>
        e.message.includes("implementationId"),
      ),
    ).toBe(true);
  });

  it("rejects unknown artifact kinds and empty artifacts", () => {
    expect(
      parseExecutionReport({
        results: [
          {
            status: "failed",
            intentKey: "X",
            artifacts: [{ kind: "heapdump" }],
          },
        ],
      }).ok,
    ).toBe(false);

    expect(
      parseExecutionReport({
        results: [
          {
            status: "failed",
            intentKey: "X",
            artifacts: [{ kind: "log" }],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects negative duration and wrong version", () => {
    expect(
      parseExecutionReport({
        results: [{ status: "passed", intentKey: "X", durationMs: -1 }],
      }).ok,
    ).toBe(false);

    expect(
      parseExecutionReport({
        version: 99,
        results: [{ status: "passed", intentKey: "X" }],
      }).ok,
    ).toBe(false);
  });

  it("parseExecutionReportOrThrow returns data or throws", () => {
    expect(parseExecutionReportOrThrow(validReport).results[0]!.status).toBe(
      "failed",
    );
    expect(() => parseExecutionReportOrThrow({ results: [] })).toThrow(
      /Invalid execution report/,
    );
  });
});
