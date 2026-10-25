import { describe, expect, it } from "vitest";
import { parseLiveEvent } from "./live-event";

describe("parseLiveEvent", () => {
  it("accepts run and triage payloads", () => {
    expect(
      parseLiveEvent(
        JSON.stringify({
          workspaceId: "ws",
          topic: "run",
          entityId: "run-1",
          resultId: "r1",
          status: "passed",
          at: 1,
        }),
      ),
    ).toMatchObject({
      topic: "run",
      entityId: "run-1",
      status: "passed",
    });
    expect(
      parseLiveEvent(
        JSON.stringify({ workspaceId: "ws", topic: "triage", entityId: "t1" }),
      ),
    ).toMatchObject({ topic: "triage", entityId: "t1" });
  });

  it("rejects malformed payloads", () => {
    expect(parseLiveEvent("nope")).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ topic: "run" }))).toBeNull();
  });
});
