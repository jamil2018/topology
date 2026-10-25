import { describe, expect, it } from "vitest";
import { orderSteps } from "./steps";
import {
  diffSnapshots,
  emptyCaseSnapshot,
  parseCaseSnapshot,
  restoreCasePatch,
  type CaseVersionSnapshot,
} from "./versions";

function snap(
  overrides: Partial<CaseVersionSnapshot> = {},
): CaseVersionSnapshot {
  return { ...emptyCaseSnapshot(), title: "Login", ...overrides };
}

describe("diffSnapshots", () => {
  it("reports scalar, tag, step, and custom-field changes", () => {
    const from = snap({
      status: "draft",
      tags: ["smoke"],
      structuredSteps: orderSteps([{ action: "open" }]),
      customFields: { owner: "qa" },
    });
    const to = snap({
      status: "ready",
      tags: ["smoke", "p0"],
      structuredSteps: orderSteps([{ action: "open" }, { action: "submit" }]),
      customFields: { owner: "eng" },
    });
    const fields = diffSnapshots(from, to).map((d) => d.field).sort();
    expect(fields).toEqual(
      ["customFields", "status", "structuredSteps", "tags"].sort(),
    );
  });

  it("returns empty when snapshots match", () => {
    const a = snap({ title: "Same", tags: ["a", "b"] });
    expect(diffSnapshots(a, { ...a, tags: ["a", "b"] })).toEqual([]);
  });
});

describe("restoreCasePatch + parseCaseSnapshot", () => {
  it("rebuilds the case row from a snapshot", () => {
    const snapshot = snap({
      title: "Restored",
      steps: "1. open",
      expectedResult: "1. hub",
      priority: "P0",
      status: "ready",
      tags: ["reg"],
      folderId: "11111111-1111-1111-1111-111111111111",
    });
    expect(restoreCasePatch(snapshot)).toMatchObject({
      title: "Restored",
      priority: "P0",
      status: "ready",
      tags: ["reg"],
    });
    const parsed = parseCaseSnapshot(JSON.stringify(snapshot));
    expect(parsed.title).toBe("Restored");
    expect(parseCaseSnapshot("not-json").title).toBe("");
  });
});
