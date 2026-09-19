import { describe, expect, it } from "vitest";
import {
  compareSnapshotDimensions,
  droppedDimensionDeltas,
} from "./coverage-snapshots";

const baseDim = (pct: number | null) => ({
  covered: pct ?? 0,
  total: 10,
  pct,
});

describe("compareSnapshotDimensions", () => {
  const before = {
    requirement: baseDim(80),
    risk: baseDim(50),
    automation: baseDim(70),
    execution: baseDim(60),
  };

  it("flags drops beyond epsilon", () => {
    const after = {
      requirement: baseDim(80),
      risk: baseDim(50),
      automation: baseDim(65),
      execution: baseDim(60),
    };
    const deltas = compareSnapshotDimensions(before, after, 0.5);
    const dropped = droppedDimensionDeltas(deltas);
    expect(dropped.map((d) => d.key)).toEqual(["automation"]);
    expect(deltas.find((d) => d.key === "requirement")?.dropped).toBe(false);
  });

  it("treats equal pct as not dropped", () => {
    const deltas = compareSnapshotDimensions(before, before);
    expect(droppedDimensionDeltas(deltas)).toHaveLength(0);
  });

  it("handles null pct dimensions", () => {
    const empty = {
      requirement: baseDim(null),
      risk: baseDim(null),
      automation: baseDim(null),
      execution: baseDim(null),
    };
    const deltas = compareSnapshotDimensions(empty, before);
    expect(deltas.every((d) => !d.dropped)).toBe(true);
  });
});
