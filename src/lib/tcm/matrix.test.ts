import { describe, expect, it } from "vitest";
import {
  fanOutMatrix,
  matrixCellLabel,
  parseMatrixJson,
  serializeMatrixJson,
} from "./matrix";

describe("fanOutMatrix", () => {
  it("returns a single default cell when every axis is empty", () => {
    expect(fanOutMatrix({})).toEqual([
      { browser: null, os: null, environmentId: null },
    ]);
  });

  it("fans out the cartesian product and dedupes axis values", () => {
    const cells = fanOutMatrix({
      browsers: [" Chrome ", "Firefox", "Chrome"],
      operatingSystems: ["macOS", ""],
      environmentIds: ["env-1", "env-2"],
    });
    expect(cells).toHaveLength(4);
    expect(cells).toEqual([
      { browser: "Chrome", os: "macOS", environmentId: "env-1" },
      { browser: "Chrome", os: "macOS", environmentId: "env-2" },
      { browser: "Firefox", os: "macOS", environmentId: "env-1" },
      { browser: "Firefox", os: "macOS", environmentId: "env-2" },
    ]);
  });

  it("treats a missing axis as a single null slot", () => {
    expect(
      fanOutMatrix({ browsers: ["Safari"], environmentIds: ["stg"] }),
    ).toEqual([
      { browser: "Safari", os: null, environmentId: "stg" },
    ]);
  });
});

describe("matrix labels + json", () => {
  it("labels cells and round-trips JSON", () => {
    expect(matrixCellLabel({ browser: "Chrome", os: "Linux", environmentId: "x" })).toBe(
      "Chrome · Linux",
    );
    expect(
      matrixCellLabel({ browser: null, os: null, environmentId: "x" }),
    ).toBe("default");
    const json = serializeMatrixJson({
      browsers: ["Chrome"],
      operatingSystems: ["macOS"],
      environmentIds: ["e1"],
    });
    expect(parseMatrixJson(json)).toEqual({
      browsers: ["Chrome"],
      operatingSystems: ["macOS"],
      environmentIds: ["e1"],
    });
    expect(parseMatrixJson("not-json").browsers).toEqual([]);
  });
});
