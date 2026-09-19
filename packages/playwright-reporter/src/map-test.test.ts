import { describe, expect, it, vi } from "vitest";
import {
  defaultExternalKey,
  intentKeyFromTitle,
  mapPlaywrightResult,
  mapStatus,
} from "./map-test";
import { resolveUploadConfig, uploadExecutionReport } from "./upload";
import { EXECUTION_PROTOCOL_VERSION } from "@topology/domain";

describe("intentKeyFromTitle", () => {
  it("parses bracket and colon prefixes", () => {
    expect(intentKeyFromTitle("AUTH-001: login works")).toBe("AUTH-001");
    expect(intentKeyFromTitle("[PAY-010] checkout")).toBe("PAY-010");
  });

  it("returns undefined when no key prefix", () => {
    expect(intentKeyFromTitle("login works")).toBeUndefined();
  });
});

describe("mapPlaywrightResult", () => {
  it("prefers intent annotation over title", () => {
    const mapped = mapPlaywrightResult(
      {
        title: "AUTH-001: login",
        titlePath: ["tests/auth.spec.ts", "AUTH-001: login"],
        location: { file: "/repo/tests/auth.spec.ts", line: 1, column: 1 },
        annotations: [{ type: "intentKey", description: "AUTH-999" }],
      },
      { status: "passed", duration: 120 },
      { projectRoot: "/repo" },
    );

    expect(mapped.intentKey).toBe("AUTH-999");
    expect(mapped.externalKey).toBe("tests/auth.spec.ts::AUTH-001: login");
    expect(mapped.status).toBe("passed");
    expect(mapped.durationMs).toBe(120);
  });

  it("falls back to externalKey from file::title", () => {
    const mapped = mapPlaywrightResult(
      {
        title: "guest checkout",
        titlePath: ["e2e/pay.spec.ts", "suite", "guest checkout"],
        location: { file: "/repo/e2e/pay.spec.ts", line: 10, column: 1 },
      },
      { status: "failed", duration: 50, error: { message: "boom" } },
      { projectRoot: "/repo", intentFromTitle: true },
    );

    expect(mapped.intentKey).toBeUndefined();
    expect(mapped.externalKey).toBe("e2e/pay.spec.ts::suite › guest checkout");
    expect(mapped.errorMessage).toBe("boom");
    expect(
      defaultExternalKey(
        {
          title: "guest checkout",
          titlePath: ["suite", "guest checkout"],
          location: { file: "/repo/e2e/pay.spec.ts", line: 10, column: 1 },
        },
        "/repo",
      ),
    ).toBe("e2e/pay.spec.ts::suite › guest checkout");
  });
});

describe("mapStatus", () => {
  it("maps timedOut/interrupted to error", () => {
    expect(mapStatus("timedOut")).toBe("error");
    expect(mapStatus("interrupted")).toBe("error");
    expect(mapStatus("skipped")).toBe("skipped");
  });
});

describe("uploadExecutionReport", () => {
  it("requires TOPOLOGY_API_TOKEN", () => {
    const resolved = resolveUploadConfig({});
    expect(resolved).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("TOPOLOGY_API_TOKEN"),
      }),
    );
  });

  it("POSTs validated report with bearer token", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await uploadExecutionReport(
      {
        version: EXECUTION_PROTOCOL_VERSION,
        results: [
          {
            status: "passed",
            intentKey: "AUTH-001",
            externalKey: "a::b",
            artifacts: [],
          },
        ],
      },
      {
        baseUrl: "http://topology.test",
        apiToken: "secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://topology.test/api/executions");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
  });
});
