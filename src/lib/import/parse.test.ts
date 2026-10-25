import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportRows, previewImport } from "./parse";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "fixtures/import", name), "utf8");

describe("previewImport", () => {
  it("returns a mapping preview for each vendor fixture", () => {
    const testrail = previewImport("testrail", fixture("testrail.xml"));
    const qase = previewImport("qase", fixture("qase.json"));
    const zephyr = previewImport("zephyr", fixture("zephyr.csv"));
    const xray = previewImport("xray", fixture("xray.csv"));
    expect(testrail.counts.valid).toBe(2);
    expect(qase.sampleMappedRows[0]?.title).toBe("Create a collection");
    expect(zephyr.counts.valid).toBe(2);
    expect(xray.mapping.key).toBe("key");
    expect(xray.sampleMappedRows[0]?.key).toBe("CALC-1");
  });

  it("applies an overridden mapping during dry-run row build", () => {
    const built = buildImportRows("testrail", fixture("testrail.csv"), {
      key: "ID",
      title: "Title",
      folder: "Section Hierarchy",
      steps: "Steps (Step)",
      expectedResult: "Steps (Expected Result)",
      priority: "Priority",
      tags: "References",
    });
    expect(built.rows).toHaveLength(2);
    expect(built.preview.mapping.title).toBe("Title");
  });
});
