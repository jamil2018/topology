import { describe, expect, it } from "vitest";
import {
  localCloseNeedsRetest,
  outboundCloseAction,
  refreshKeepsLocalFields,
} from "./issues";

describe("outboundCloseAction", () => {
  it("closes an open issue when the retest passes", () => {
    expect(outboundCloseAction("passed", "open")).toBe("close");
    expect(outboundCloseAction("passed", "in_progress")).toBe("close");
  });

  it("acks a remotely-done issue when the retest passes", () => {
    expect(outboundCloseAction("passed", "done")).toBe("ack");
  });

  it("skips non-passing results", () => {
    expect(outboundCloseAction("failed", "open")).toBe("skip");
    expect(outboundCloseAction("blocked", "open")).toBe("skip");
  });
});

describe("localCloseNeedsRetest", () => {
  it("queues retest after a local/outbound mark-closed", () => {
    expect(localCloseNeedsRetest("local_mark", true, 0)).toBe(1);
    expect(localCloseNeedsRetest("local_mark", false, 1)).toBe(1);
    expect(localCloseNeedsRetest("local_mark", false, 0)).toBe(0);
  });

  it("clears the retest flag when the retest already passed", () => {
    expect(localCloseNeedsRetest("retest_pass", true, 1)).toBe(0);
    expect(localCloseNeedsRetest("retest_pass", false, 1)).toBe(0);
  });
});

describe("refresh after outbound close", () => {
  it("does not reopen a local close when the remote is still open", () => {
    expect(
      refreshKeepsLocalFields({
        localRemoteId: "mock-1",
        localTitle: "Filed locally",
        localStatus: "done",
        remoteId: "mock-1",
        remoteTitle: "Filed locally",
        remoteStatus: "open",
        siblingTitles: [],
      }),
    ).toEqual({ keepTitle: false, keepStatus: true });
  });

  it("merges a matching remote close onto the local row", () => {
    expect(
      refreshKeepsLocalFields({
        localRemoteId: "gh-1",
        localTitle: "CI fail",
        localStatus: "open",
        remoteId: "gh-1",
        remoteTitle: "CI fail",
        remoteStatus: "done",
        siblingTitles: [],
      }),
    ).toEqual({ keepTitle: false, keepStatus: false });
  });
});
