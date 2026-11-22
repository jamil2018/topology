import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  filterMentionMembers,
  insertMention,
} from "./mention-composer";

const members = [
  { id: "1", name: "Ada Lovelace", email: "ada@topology.local" },
  { id: "2", name: "Bob", email: "bob@topology.local" },
  { id: "3", name: null, email: "qa@topology.local" },
];

describe("mention composer helpers", () => {
  it("detects the active @query before the caret", () => {
    expect(activeMentionQuery("Hi @Ad", 6)).toEqual({ start: 3, query: "Ad" });
    expect(activeMentionQuery("Hi @Ad there", 6)).toEqual({
      start: 3,
      query: "Ad",
    });
    expect(activeMentionQuery("no mention", 4)).toBeNull();
  });

  it("filters members by name or email", () => {
    expect(filterMentionMembers(members, "ada").map((m) => m.id)).toEqual([
      "1",
    ]);
    expect(filterMentionMembers(members, "qa").map((m) => m.id)).toEqual([
      "3",
    ]);
  });

  it("inserts an @email token at the active mention", () => {
    const result = insertMention("Hi @Ad", 6, 3, members[0]!);
    expect(result.next).toBe("Hi @ada@topology.local ");
    expect(result.caret).toBe("Hi @ada@topology.local ".length);
  });
});
