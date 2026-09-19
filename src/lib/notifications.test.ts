import { describe, expect, it } from "vitest";
import { parseMentionTokens } from "./notifications";

describe("parseMentionTokens", () => {
  it("extracts emails and user ids", () => {
    const body =
      "Hey @demo@topology.local and @aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee — review?";
    const { emails, userIds } = parseMentionTokens(body);
    expect(emails).toEqual(["demo@topology.local"]);
    expect(userIds).toEqual(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
  });

  it("returns empty when no mentions", () => {
    expect(parseMentionTokens("no mentions here")).toEqual({
      emails: [],
      userIds: [],
    });
  });
});
