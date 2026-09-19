import { describe, expect, it } from "vitest";
import {
  isQualityQuery,
  validateQualityQuery,
  type QualityQuery,
} from "./query-ast";
import { parseQualityQuery, parseQualityQueryOrThrow } from "./query-parse";

describe("validateQualityQuery", () => {
  const valid: QualityQuery = {
    entity: "intents",
    filters: [
      { op: "eq", field: "component", value: "payments" },
      { op: "neq", field: "criticality", value: "P3" },
      { op: "in", field: "status", values: ["ready", "draft"] },
      { op: "exists", field: "assigneeId", exists: true },
    ],
    sort: [{ field: "key", direction: "asc" }],
  };

  it("accepts a well-formed AST", () => {
    const result = validateQualityQuery(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query).toEqual(valid);
    }
    expect(isQualityQuery(valid)).toBe(true);
  });

  it("rejects unknown entity", () => {
    const result = validateQualityQuery({
      ...valid,
      entity: "cases",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "entity")).toBe(true);
    }
  });

  it("rejects empty in-list and bad field paths", () => {
    const result = validateQualityQuery({
      entity: "intents",
      filters: [
        { op: "in", field: "status", values: [] },
        { op: "eq", field: "1bad", value: "x" },
      ],
      sort: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("values"))).toBe(true);
      expect(result.issues.some((i) => i.path.includes("field"))).toBe(true);
    }
  });

  it("rejects non-object input", () => {
    expect(validateQualityQuery(null).ok).toBe(false);
    expect(validateQualityQuery("intents").ok).toBe(false);
    expect(isQualityQuery({})).toBe(false);
  });
});

describe("parseQualityQuery", () => {
  it('parses: intents where component = "payments" and criticality = "P0"', () => {
    const result = parseQualityQuery(
      'intents where component = "payments" and criticality = "P0"',
    );
    expect(result).toEqual({
      ok: true,
      query: {
        entity: "intents",
        filters: [
          { op: "eq", field: "component", value: "payments" },
          { op: "eq", field: "criticality", value: "P0" },
        ],
        sort: [],
      },
    });
  });

  it("parses bare tokens and nested field neq", () => {
    const query = parseQualityQueryOrThrow(
      "intents where component = payments and criticality = P0 and last_execution.release != 4.7",
    );
    expect(query).toEqual({
      entity: "intents",
      filters: [
        { op: "eq", field: "component", value: "payments" },
        { op: "eq", field: "criticality", value: "P0" },
        { op: "neq", field: "last_execution.release", value: 4.7 },
      ],
      sort: [],
    });
  });

  it("parses in-lists, exists, and order by", () => {
    const query = parseQualityQueryOrThrow(
      'requirements where key in ("REQ-1", "REQ-2") and owner exists order by key desc, title',
    );
    expect(query).toEqual({
      entity: "requirements",
      filters: [
        { op: "in", field: "key", values: ["REQ-1", "REQ-2"] },
        { op: "exists", field: "owner", exists: true },
      ],
      sort: [
        { field: "key", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
    });
  });

  it("parses not exists (prefix and postfix)", () => {
    expect(
      parseQualityQueryOrThrow("executions where not exists release"),
    ).toEqual({
      entity: "executions",
      filters: [{ op: "exists", field: "release", exists: false }],
      sort: [],
    });

    expect(
      parseQualityQueryOrThrow(
        "implementations where type = playwright and framework not exists",
      ),
    ).toEqual({
      entity: "implementations",
      filters: [
        { op: "eq", field: "type", value: "playwright" },
        { op: "exists", field: "framework", exists: false },
      ],
      sort: [],
    });
  });

  it("parses entity-only query", () => {
    expect(parseQualityQueryOrThrow("executions")).toEqual({
      entity: "executions",
      filters: [],
      sort: [],
    });
  });

  it("parses bool and null scalars", () => {
    const query = parseQualityQueryOrThrow(
      "intents where automated = true and assigneeId != null",
    );
    expect(query.filters).toEqual([
      { op: "eq", field: "automated", value: true },
      { op: "neq", field: "assigneeId", value: null },
    ]);
  });

  it("rejects unknown entity and empty input", () => {
    expect(parseQualityQuery("cases where key = x").ok).toBe(false);
    expect(parseQualityQuery("").ok).toBe(false);
    expect(parseQualityQuery("   ").ok).toBe(false);
  });

  it("rejects trailing junk and bad operators", () => {
    expect(parseQualityQuery("intents where").ok).toBe(false);
    expect(parseQualityQuery("intents where criticality").ok).toBe(false);
    expect(parseQualityQuery("intents foo").ok).toBe(false);
  });
});
