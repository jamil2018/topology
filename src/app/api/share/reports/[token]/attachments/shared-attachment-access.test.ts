import { describe, expect, it } from "vitest";
import { attachmentBelongsToSharedRun } from "./shared-attachment-access";

const payload = {
  targetId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  workspaceId: "11111111-2222-4333-8444-555555555555",
};

describe("attachmentBelongsToSharedRun", () => {
  it("allows attachments on the shared run in the same workspace", () => {
    expect(
      attachmentBelongsToSharedRun(
        {
          result: {
            run: {
              id: payload.targetId,
              workspaceId: payload.workspaceId,
            },
          },
        },
        payload,
      ),
    ).toBe(true);
  });

  it("rejects missing rows, foreign runs, and cross-workspace attachments", () => {
    expect(attachmentBelongsToSharedRun(null, payload)).toBe(false);
    expect(attachmentBelongsToSharedRun({ result: null }, payload)).toBe(false);
    expect(
      attachmentBelongsToSharedRun(
        {
          result: {
            run: {
              id: "99999999-bbbb-cccc-dddd-eeeeeeeeeeee",
              workspaceId: payload.workspaceId,
            },
          },
        },
        payload,
      ),
    ).toBe(false);
    expect(
      attachmentBelongsToSharedRun(
        {
          result: {
            run: {
              id: payload.targetId,
              workspaceId: "99999999-2222-4333-8444-555555555555",
            },
          },
        },
        payload,
      ),
    ).toBe(false);
  });
});
