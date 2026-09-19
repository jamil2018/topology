import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "@topology/domain";
import {
  buildExecutionNotes,
  buildExecutionTitle,
  environmentNameForReport,
  extractTopologyRunId,
  formatEnvironmentSuffix,
  inferEnvironmentKind,
  mapExecutionStatus,
  serializeEnvironmentJson,
} from "./execution-ingest";

function result(partial: Partial<ExecutionResult>): ExecutionResult {
  return {
    status: "passed",
    artifacts: [],
    intentKey: "AUTH-001",
    ...partial,
  };
}

describe("mapExecutionStatus", () => {
  it("maps protocol error onto failed (DB enum has no error)", () => {
    expect(mapExecutionStatus("error")).toBe("failed");
    expect(mapExecutionStatus("passed")).toBe("passed");
    expect(mapExecutionStatus("failed")).toBe("failed");
    expect(mapExecutionStatus("skipped")).toBe("skipped");
  });
});

describe("formatEnvironmentSuffix", () => {
  it("joins browser and os", () => {
    expect(
      formatEnvironmentSuffix({ browser: "chromium", os: "linux" }),
    ).toBe("chromium/linux");
    expect(formatEnvironmentSuffix({ browser: "firefox" })).toBe("firefox");
    expect(formatEnvironmentSuffix(undefined)).toBeNull();
  });
});

describe("serializeEnvironmentJson", () => {
  it("stores browser/os as JSON", () => {
    expect(
      serializeEnvironmentJson({ browser: "chromium", os: "linux" }),
    ).toBe(JSON.stringify({ browser: "chromium", os: "linux" }));
    expect(serializeEnvironmentJson(undefined)).toBeNull();
    expect(serializeEnvironmentJson({})).toBeNull();
  });
});

describe("inferEnvironmentKind", () => {
  it("classifies common labels", () => {
    expect(inferEnvironmentKind("local")).toBe("local");
    expect(inferEnvironmentKind("ci:chromium/linux")).toBe("ci");
    expect(inferEnvironmentKind("staging")).toBe("staging");
    expect(inferEnvironmentKind("prod-us")).toBe("prod");
  });
});

describe("environmentNameForReport", () => {
  it("includes browser/os when present", () => {
    expect(
      environmentNameForReport({ browser: "chromium", os: "linux" }, "ci"),
    ).toBe("ci:chromium/linux");
    expect(environmentNameForReport(undefined, "ci")).toBe("ci");
  });
});

describe("buildExecutionTitle", () => {
  it("appends env suffix for display", () => {
    expect(
      buildExecutionTitle(
        result({ title: "Login with valid credentials" }),
        { browser: "chromium", os: "linux" },
      ),
    ).toBe("Login with valid credentials [chromium/linux]");
  });

  it("does not duplicate an existing suffix", () => {
    expect(
      buildExecutionTitle(
        result({
          title: "Login [chromium/linux]",
          environment: { browser: "chromium", os: "linux" },
        }),
      ),
    ).toBe("Login [chromium/linux]");
  });
});

describe("buildExecutionNotes", () => {
  it("stashes error, env, and artifact paths", () => {
    const notes = buildExecutionNotes(
      result({
        status: "failed",
        errorMessage: "Expected lockout banner",
        stack: "Error: Expected lockout banner\n    at spec.ts:1",
        environment: { browser: "chromium", os: "linux" },
        artifacts: [
          { kind: "screenshot", name: "lockout.png", path: "artifacts/lockout.png" },
          { kind: "trace", path: "artifacts/trace.zip" },
        ],
      }),
    );
    expect(notes).toContain("Expected lockout banner");
    expect(notes).toContain("env: chromium/linux");
    expect(notes).toContain("lockout.png");
    expect(notes).toContain("artifacts/trace.zip");
  });
});

describe("extractTopologyRunId", () => {
  it("strips runId so strict protocol parse can succeed", () => {
    const { runId, reportPayload } = extractTopologyRunId({
      runId: "11111111-1111-1111-1111-111111111111",
      version: 1,
      results: [{ status: "passed", intentKey: "AUTH-001" }],
    });
    expect(runId).toBe("11111111-1111-1111-1111-111111111111");
    expect(reportPayload).toEqual({
      version: 1,
      results: [{ status: "passed", intentKey: "AUTH-001" }],
    });
  });
});
