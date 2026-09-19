import { describe, expect, it } from "vitest";
import {
  emptyRepresentation,
  fromGherkin,
  fromNaturalLanguage,
  fromStepTable,
  fromTraditionalSteps,
  isEmptyRepresentation,
  normalizeRepresentation,
  parseRepresentation,
  toGherkin,
  toNaturalLanguage,
  toStepTable,
  toTraditionalSteps,
  type StructuredRepresentation,
} from "./representation";

const authLockout: StructuredRepresentation = {
  given: ["the user has an account", "the user is logged out"],
  when: ["the user submits an invalid password 5 times"],
  then: ["the account is locked", "a lockout message is shown"],
};

describe("normalizeRepresentation", () => {
  it("fills missing arrays and trims empty clauses", () => {
    expect(normalizeRepresentation(undefined)).toEqual(emptyRepresentation());
    expect(
      normalizeRepresentation({
        given: ["  a  ", "", "b"],
        when: undefined,
      }),
    ).toEqual({ given: ["a", "b"], when: [], then: [] });
  });
});

describe("steps table projection", () => {
  it("round-trips structured ↔ step table", () => {
    const table = toStepTable(authLockout);
    expect(table).toEqual([
      { order: 1, kind: "given", text: "the user has an account" },
      { order: 2, kind: "given", text: "the user is logged out" },
      {
        order: 3,
        kind: "when",
        text: "the user submits an invalid password 5 times",
      },
      { order: 4, kind: "then", text: "the account is locked" },
      { order: 5, kind: "then", text: "a lockout message is shown" },
    ]);
    expect(fromStepTable(table)).toEqual(authLockout);
  });

  it("sorts by order when rebuilding", () => {
    expect(
      fromStepTable([
        { order: 2, kind: "then", text: "ok" },
        { order: 1, kind: "when", text: "act" },
      ]),
    ).toEqual({ given: [], when: ["act"], then: ["ok"] });
  });
});

describe("Gherkin projection", () => {
  it("emits Given/When/Then/And lines", () => {
    expect(toGherkin(authLockout)).toBe(
      [
        "Given the user has an account",
        "And the user is logged out",
        "When the user submits an invalid password 5 times",
        "Then the account is locked",
        "And a lockout message is shown",
      ].join("\n"),
    );
  });

  it("wraps a scenario title with indentation", () => {
    expect(toGherkin({ given: ["x"], when: ["y"], then: ["z"] }, { scenario: "Lockout" })).toBe(
      [
        "Scenario: Lockout",
        "  Given x",
        "  When y",
        "  Then z",
      ].join("\n"),
    );
  });

  it("parses Feature/Scenario wrappers and And/But continuations", () => {
    const text = `
Feature: Auth
  Scenario: Lockout
    Given the user has an account
    And the user is logged out
    When the user submits an invalid password 5 times
    Then the account is locked
    But a lockout message is shown
`;
    expect(fromGherkin(text)).toEqual(authLockout);
  });

  it("returns null when no keywords are present", () => {
    expect(fromGherkin("just some notes")).toBeNull();
    expect(fromGherkin("")).toBeNull();
  });
});

describe("natural language projection", () => {
  it("joins clauses into a paragraph", () => {
    expect(toNaturalLanguage(authLockout)).toBe(
      "Given the user has an account and the user is logged out. When the user submits an invalid password 5 times. Then the account is locked and a lockout message is shown.",
    );
  });

  it("uses Oxford comma for three or more items", () => {
    expect(
      toNaturalLanguage({
        given: ["a", "b", "c"],
        when: [],
        then: [],
      }),
    ).toBe("Given a, b, and c.");
  });

  it("parses marker-delimited text", () => {
    expect(
      fromNaturalLanguage(
        "Given the user is logged out. When they fail login 5 times. Then the account is locked.",
      ),
    ).toEqual({
      given: ["the user is logged out"],
      when: ["they fail login 5 times"],
      then: ["the account is locked"],
    });
  });

  it("returns null without markers", () => {
    expect(fromNaturalLanguage("no keywords here")).toBeNull();
  });
});

describe("traditional steps projection", () => {
  it("projects Given/When to numbered steps and Then to expectedResult", () => {
    expect(toTraditionalSteps(authLockout)).toEqual({
      steps: [
        "1. [Given] the user has an account",
        "2. [Given] the user is logged out",
        "3. [When] the user submits an invalid password 5 times",
      ].join("\n"),
      expectedResult: "the account is locked\na lockout message is shown",
    });
  });

  it("recovers structure from tagged steps + expectedResult", () => {
    const { steps, expectedResult } = toTraditionalSteps(authLockout);
    expect(fromTraditionalSteps(steps, expectedResult)).toEqual(authLockout);
  });

  it("maps unlabeled numbered lines to when and expectedResult to then", () => {
    expect(
      fromTraditionalSteps("1. open /login\n2. submit bad password", "locked out"),
    ).toEqual({
      given: [],
      when: ["open /login", "submit bad password"],
      then: ["locked out"],
    });
  });
});

describe("parseRepresentation", () => {
  it("prefers Gherkin when keywords exist", () => {
    expect(parseRepresentation("Given a\nWhen b\nThen c")).toEqual({
      given: ["a"],
      when: ["b"],
      then: ["c"],
    });
  });

  it("falls back to traditional when-body for plain lists", () => {
    expect(parseRepresentation("1. do thing\n2. other")).toEqual({
      given: [],
      when: ["do thing", "other"],
      then: [],
    });
  });

  it("reports empty for blank input", () => {
    expect(isEmptyRepresentation(parseRepresentation(""))).toBe(true);
  });
});
