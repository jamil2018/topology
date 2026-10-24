import { describe, expect, it } from "vitest";
import {
  applyParameters,
  applyParametersToSteps,
  expandSharedSteps,
  orderSteps,
  parseFallbackSteps,
  projectStepsToText,
  rollupStepStatuses,
} from "./steps";

describe("orderSteps", () => {
  it("reindexes in array order and trims fields", () => {
    const ordered = orderSteps([
      { position: 9, action: " click ", expected: " ok ", data: " id=1 " },
      { id: "s2", action: "submit", sharedStepId: null },
    ]);
    expect(ordered).toEqual([
      {
        id: null,
        position: 0,
        action: "click",
        expected: "ok",
        data: "id=1",
        sharedStepId: null,
      },
      {
        id: "s2",
        position: 1,
        action: "submit",
        expected: "",
        data: "",
        sharedStepId: null,
      },
    ]);
  });
});

describe("expandSharedSteps", () => {
  it("inlines shared-step items and keeps inline rows", () => {
    const ordered = orderSteps([
      { action: "open app" },
      { action: "", sharedStepId: "login" },
      { action: "assert home" },
    ]);
    const expanded = expandSharedSteps(
      ordered,
      new Map([
        [
          "login",
          [
            { position: 1, action: "type password", expected: "masked" },
            { position: 0, action: "type email", data: "user" },
          ],
        ],
      ]),
    );
    expect(expanded.map((s) => s.action)).toEqual([
      "open app",
      "type email",
      "type password",
      "assert home",
    ]);
    expect(expanded[1]?.sharedStepId).toBe("login");
    expect(expanded[1]?.data).toBe("user");
    expect(expanded.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("keeps a placeholder when the shared block is missing", () => {
    const expanded = expandSharedSteps(
      orderSteps([{ action: "", sharedStepId: "gone" }]),
      new Map(),
    );
    expect(expanded[0]?.action).toContain("gone");
  });
});

describe("applyParameters", () => {
  it("replaces brace and dollar tokens and leaves unknowns", () => {
    expect(
      applyParameters("login as {{ user }} with ${password}", {
        user: "ada",
        password: "s3cret",
      }),
    ).toBe("login as ada with s3cret");
    expect(applyParameters("keep {{missing}}", {})).toBe("keep {{missing}}");
  });
});

describe("applyParametersToSteps + projectStepsToText", () => {
  it("projects numbered action/expected text after substitution", () => {
    const steps = applyParametersToSteps(
      orderSteps([
        { action: "open {{url}}", expected: "title {{title}}", data: "q={{q}}" },
        { action: "submit" },
      ]),
      { url: "/login", title: "Sign in", q: "a" },
    );
    expect(projectStepsToText(steps)).toEqual({
      steps: "1. open /login [q=a]\n2. submit",
      expectedResult: "1. title Sign in\n2. ",
    });
  });
});

describe("parseFallbackSteps", () => {
  it("parses numbered and bullet lines, pairing expected by index", () => {
    const parsed = parseFallbackSteps(
      "1. open /login\n2) submit\n- see hub",
      "lands on hub\n2. dashboard",
    );
    expect(parsed.map((s) => s.action)).toEqual([
      "open /login",
      "submit",
      "see hub",
    ]);
    expect(parsed[0]?.expected).toBe("lands on hub");
    expect(parsed[1]?.expected).toBe("dashboard");
    expect(parsed[2]?.expected).toBe("");
  });

  it("returns empty when both fields are blank", () => {
    expect(parseFallbackSteps("  \n", "")).toEqual([]);
  });
});

describe("rollupStepStatuses", () => {
  it("prefers failed then blocked, and treats mixed untested as untested", () => {
    expect(rollupStepStatuses(["passed", "failed", "passed"])).toBe("failed");
    expect(rollupStepStatuses(["passed", "blocked"])).toBe("blocked");
    expect(rollupStepStatuses(["skipped", "skipped"])).toBe("skipped");
    expect(rollupStepStatuses(["passed", "skipped"])).toBe("passed");
    expect(rollupStepStatuses(["passed", "untested"])).toBe("untested");
    expect(rollupStepStatuses([])).toBe("untested");
  });
});
