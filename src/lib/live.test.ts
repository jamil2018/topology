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

  it("parses comment and attachment live payloads", () => {
    expect(
      parseLiveEvent(
        JSON.stringify({
          workspaceId: "ws",
          topic: "run",
          entityId: "run-1",
          resultId: "r1",
          kind: "comment",
          comment: {
            id: "c1",
            body: "hi @user@example.com",
            createdAt: "2026-01-01T00:00:00.000Z",
            user: { id: "u1", name: "Ada", email: "ada@example.com" },
          },
          at: 1,
        }),
      ),
    ).toMatchObject({
      kind: "comment",
      comment: { id: "c1", body: "hi @user@example.com" },
    });
    expect(
      parseLiveEvent(
        JSON.stringify({
          workspaceId: "ws",
          topic: "run",
          entityId: "run-1",
          resultId: "r1",
          kind: "attachment",
          attachment: {
            id: "a1",
            filename: "shot.png",
            contentType: "image/png",
            sizeBytes: 12,
            url: "/api/attachments/a1",
          },
          at: 1,
        }),
      ),
    ).toMatchObject({
      kind: "attachment",
      attachment: { id: "a1", filename: "shot.png" },
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseLiveEvent("nope")).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ topic: "run" }))).toBeNull();
  });
});
