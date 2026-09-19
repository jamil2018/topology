import { describe, expect, it } from "vitest";
import {
  compareSnapshotDimensions,
  droppedDimensionDeltas,
} from "./coverage-snapshots";
import { WEBHOOK_EVENTS, webhookUrlError } from "./webhooks";

describe("webhookUrlError", () => {
  it("rejects non-http schemes and local or private targets", () => {
    expect(webhookUrlError("javascript:alert(1)")).toBeTruthy();
    expect(webhookUrlError("file:///etc/passwd")).toBeTruthy();
    expect(webhookUrlError("http://127.0.0.1:9/hook")).toBeTruthy();
    expect(webhookUrlError("http://localhost/hook")).toBeTruthy();
    expect(webhookUrlError("http://[::1]/hook")).toBeTruthy();
    expect(webhookUrlError("http://169.254.169.254/latest")).toBeTruthy();
    expect(webhookUrlError("http://10.1.2.3/hook")).toBeTruthy();
    expect(webhookUrlError("http://172.16.0.5/hook")).toBeTruthy();
    expect(webhookUrlError("http://192.168.1.20/hook")).toBeTruthy();
    expect(webhookUrlError("http://[::ffff:127.0.0.1]/hook")).toBeTruthy();
  });

  it("allows public http(s) URLs", () => {
    expect(webhookUrlError("https://example.com/hooks/topology")).toBeNull();
    expect(webhookUrlError("http://172.32.0.1/hook")).toBeNull();
    expect(webhookUrlError("https://8.8.8.8/hook")).toBeNull();
  });
});

describe("WEBHOOK_EVENTS", () => {
  it("includes Phase 8 collaboration events", () => {
    expect(WEBHOOK_EVENTS).toEqual(
      expect.arrayContaining([
        "run.completed",
        "issue.created",
        "intent.stale",
        "coverage.dropped",
        "proposal.created",
      ]),
    );
  });
});

describe("Phase 8 webhook hooks", () => {
  it("coverage.dropped fires when compare finds a dimension drop", () => {
    const before = {
      requirement: { covered: 8, total: 10, pct: 80 },
      risk: { covered: 5, total: 10, pct: 50 },
      automation: { covered: 7, total: 10, pct: 70 },
      execution: { covered: 6, total: 10, pct: 60 },
    };
    const after = {
      ...before,
      automation: { covered: 5, total: 10, pct: 50 },
    };
    const dropped = droppedDimensionDeltas(
      compareSnapshotDimensions(before, after),
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.key).toBe("automation");
    expect(WEBHOOK_EVENTS).toContain("coverage.dropped");
  });
});
