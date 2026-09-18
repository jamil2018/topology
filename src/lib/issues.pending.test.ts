import { describe, expect, it } from "vitest";
import {
  PENDING_PAGE_LIMIT,
  assemblePendingFailures,
  disclosePendingPage,
  selectFailuresWithoutIssue,
} from "./issues";

describe("pending work page", () => {
  it("does not treat a short page as the full untested set", () => {
    const page = disclosePendingPage(
      [{ id: "1" }, { id: "2" }],
      131,
      50,
    );
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(131);
    expect(page.limit).toBe(50);
    expect(page.truncated).toBe(true);
    expect(page.total).not.toBe(page.items.length);
  });

  it("raises the pending page above the old silent cap of 50", () => {
    expect(PENDING_PAGE_LIMIT).toBeGreaterThan(50);
  });
});

describe("failures without a linked issue", () => {
  it("keeps blocked results and does not drop them behind a full failed page", () => {
    const failed = Array.from({ length: 50 }, (_, i) => ({
      id: `failed-${i}`,
      status: "failed",
    }));
    const blocked = [{ id: "blocked-1", status: "blocked" }];
    const passed = [{ id: "passed-1", status: "passed" }];
    const linked = new Set(["failed-0"]);

    expect(
      selectFailuresWithoutIssue([...failed, ...blocked, ...passed], linked).map(
        (row) => row.id,
      ),
    ).toEqual([
      ...failed.slice(1).map((row) => row.id),
      "blocked-1",
    ]);

    const pending = assemblePendingFailures(
      failed,
      80,
      blocked,
      1,
      linked,
      50,
    );
    expect(pending.failuresWithoutIssue.some((row) => row.status === "blocked")).toBe(
      true,
    );
    expect(pending.failuresWithoutIssueTotal).toBe(81);
    expect(pending.failuresWithoutIssueTruncated).toBe(true);
    expect(pending.failuresWithoutIssue).toHaveLength(50);
  });

  it("includes failed and blocked rows whether a person or an agent recorded them", () => {
    const rows = [
      { id: "agent-failed", status: "failed" },
      { id: "agent-blocked", status: "blocked" },
      { id: "skipped", status: "skipped" },
    ];
    expect(selectFailuresWithoutIssue(rows, new Set()).map((row) => row.id)).toEqual([
      "agent-failed",
      "agent-blocked",
    ]);
  });
});
