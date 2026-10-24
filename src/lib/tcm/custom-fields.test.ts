import { describe, expect, it } from "vitest";
import {
  normalizeFieldKey,
  validateFieldDef,
  validateFieldValues,
} from "./custom-fields";

const defs = [
  {
    key: "severity",
    label: "Severity",
    type: "select" as const,
    options: ["low", "high"],
    required: true,
  },
  { key: "estimate", label: "Estimate", type: "number" as const },
  { key: "automated", label: "Automated", type: "boolean" as const },
  { key: "due", label: "Due", type: "date" as const },
  { key: "notes", label: "Notes", type: "text" as const },
];

describe("validateFieldDef", () => {
  it("normalizes keys and requires select options", () => {
    expect(normalizeFieldKey(" Release Train ")).toBe("release_train");
    expect(validateFieldDef({ key: "1bad", label: "X", type: "text" }).ok).toBe(
      false,
    );
    expect(
      validateFieldDef({ key: "env", label: "Env", type: "select", options: [] })
        .ok,
    ).toBe(false);
    const ok = validateFieldDef({
      key: "Env_Name",
      label: "Env",
      type: "select",
      options: ["stg"],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.def.key).toBe("env_name");
  });
});

describe("validateFieldValues", () => {
  it("normalizes valid values and reports typed errors", () => {
    const result = validateFieldValues(defs, {
      severity: "high",
      estimate: "3",
      automated: "true",
      due: "2026-10-24",
      notes: "  ship  ",
    });
    expect(result.ok).toBe(true);
    expect(result.normalized).toEqual({
      severity: "high",
      estimate: 3,
      automated: true,
      due: "2026-10-24",
      notes: "ship",
    });
  });

  it("rejects missing required, bad select, number, date", () => {
    const result = validateFieldValues(defs, {
      estimate: "nope",
      due: "24-10-2026",
      automated: "yes",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.key).sort()).toEqual(
      ["automated", "due", "estimate", "severity"].sort(),
    );
  });
});
