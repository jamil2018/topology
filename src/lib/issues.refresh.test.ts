import { describe, expect, it } from "vitest";
import { refreshKeepsLocalFields } from "./issues";

describe("refreshKeepsLocalFields", () => {
  it("does not reopen a local close", () => {
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

  it("does not copy another issue's title when mock keys collide", () => {
    expect(
      refreshKeepsLocalFields({
        localRemoteId: "mock-1",
        localTitle: "Original",
        localStatus: "open",
        remoteId: "mock-1",
        remoteTitle: "BUGHUNT-AGENT-filed-from-other-ws",
        remoteStatus: "open",
        siblingTitles: ["BUGHUNT-AGENT-filed-from-other-ws"],
      }),
    ).toEqual({ keepTitle: true, keepStatus: true });
  });

  it("ignores a fabricated stand-in", () => {
    expect(
      refreshKeepsLocalFields({
        localRemoteId: "mock-1",
        localTitle: "Original",
        localStatus: "done",
        remoteId: "mock-linked-mock-1",
        remoteTitle: "mock-1",
        remoteStatus: "open",
        siblingTitles: [],
      }).keepTitle,
    ).toBe(true);
  });
});
