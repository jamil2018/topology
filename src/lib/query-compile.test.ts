import { describe, expect, it } from "vitest";
import {
  parseQualityQueryOrThrow,
  type QualityQuery,
} from "@topology/domain";
import {
  compileQualityQuery,
  knownFieldsFor,
  type QueryPlan,
} from "./query-compile";

function planOf(dsl: string): QueryPlan {
  const query = parseQualityQueryOrThrow(dsl);
  const result = compileQualityQuery(query);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.plan;
}

describe("compileQualityQuery", () => {
  it("compiles PRD-style intents filter: component + criticality", () => {
    const plan = planOf(
      'intents where component = "payments" and criticality = "P0"',
    );
    expect(plan.entity).toBe("intents");
    expect(plan.filters).toEqual([
      {
        kind: "edge",
        fromType: "intent",
        toType: "component",
        relation: "belongs_to",
        direction: "outgoing",
        match: "key",
        op: "eq",
        value: "payments",
      },
      {
        kind: "column",
        table: "test_intents",
        column: "criticality",
        op: "eq",
        value: "P0",
      },
    ]);
  });

  it("compiles requirements key in-list + order by", () => {
    const plan = planOf(
      'requirements where key in ("REQ-1", "REQ-2") order by key desc',
    );
    expect(plan.filters).toEqual([
      {
        kind: "column",
        table: "requirements",
        column: "key",
        op: "in",
        value: ["REQ-1", "REQ-2"],
      },
    ]);
    expect(plan.sort).toEqual([
      { table: "requirements", column: "key", direction: "desc" },
    ]);
  });

  it("compiles implementations type + framework exists", () => {
    const plan = planOf(
      "implementations where type = playwright and framework exists",
    );
    expect(plan.filters).toEqual([
      {
        kind: "column",
        table: "test_implementations",
        column: "type",
        op: "eq",
        value: "playwright",
      },
      {
        kind: "column",
        table: "test_implementations",
        column: "framework",
        op: "exists",
        exists: true,
      },
    ]);
  });

  it("compiles executions status + branch join filter", () => {
    const plan = planOf(
      'executions where status = "failed" and branch = "main"',
    );
    expect(plan.filters).toEqual([
      {
        kind: "column",
        table: "run_results",
        column: "status",
        op: "eq",
        value: "failed",
      },
      {
        kind: "join",
        table: "runs",
        column: "branch",
        op: "eq",
        value: "main",
      },
    ]);
  });

  it("compiles automated virtual filter and component neq", () => {
    const plan = planOf(
      "intents where automated = true and component != payments",
    );
    expect(plan.filters).toEqual([
      { kind: "virtual", name: "automated", op: "eq", value: true },
      {
        kind: "edge",
        fromType: "intent",
        toType: "component",
        relation: "belongs_to",
        direction: "outgoing",
        match: "key",
        op: "neq",
        value: "payments",
      },
    ]);
  });

  it("rejects unknown fields (e.g. owner, last_execution.release)", () => {
    const owner = compileQualityQuery({
      entity: "requirements",
      filters: [{ op: "exists", field: "owner", exists: true }],
      sort: [],
    });
    expect(owner.ok).toBe(false);
    if (!owner.ok) {
      expect(owner.error).toMatch(/unknown field 'owner'/);
    }

    const release = compileQualityQuery(
      parseQualityQueryOrThrow(
        "intents where last_execution.release != 4.7",
      ),
    );
    expect(release.ok).toBe(false);
    if (!release.ok) {
      expect(release.error).toMatch(/unknown field 'last_execution.release'/);
    }
  });

  it("rejects unknown sort fields", () => {
    const result = compileQualityQuery({
      entity: "intents",
      filters: [],
      sort: [{ field: "component", direction: "asc" }],
    } satisfies QualityQuery);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unknown sort field 'component'/);
    }
  });

  it("lists known fields per entity", () => {
    expect(knownFieldsFor("intents")).toContain("component");
    expect(knownFieldsFor("intents")).toContain("automated");
    expect(knownFieldsFor("executions")).toContain("branch");
    expect(knownFieldsFor("implementations")).toContain("framework");
  });
});
