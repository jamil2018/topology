import { describe, expect, it } from "vitest";
import { computeJourneyCoverageDimension } from "./quality-graph";

describe("computeJourneyCoverageDimension", () => {
  it("returns N/A when no journeys", () => {
    expect(computeJourneyCoverageDimension([], [], new Set())).toEqual({
      covered: 0,
      total: 0,
      pct: null,
    });
  });

  it("counts journeys linked via covers or part_of", () => {
    const intentIds = new Set(["i1", "i2"]);
    const edges = [
      {
        fromType: "journey",
        fromId: "j1",
        toType: "intent",
        toId: "i1",
        relation: "covers",
      },
      {
        fromType: "intent",
        fromId: "i2",
        toType: "journey",
        toId: "j2",
        relation: "part_of",
      },
      {
        fromType: "journey",
        fromId: "j3",
        toType: "intent",
        toId: "missing",
        relation: "covers",
      },
    ];
    expect(
      computeJourneyCoverageDimension(["j1", "j2", "j3"], edges, intentIds),
    ).toEqual({ covered: 2, total: 3, pct: 67 });
  });
});
