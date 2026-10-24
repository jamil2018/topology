import { describe, expect, it } from "vitest";
import {
  applyMapping,
  buildMappingPreview,
  normalizePriority,
  normalizeStatus,
  suggestMapping,
} from "./mapping";
import type { SourceTable } from "./types";

const table: SourceTable = {
  provider: "testrail",
  format: "csv",
  fields: ["Case ID", "Name", "Section", "Priority"],
  rows: [
    {
      "Case ID": "C99",
      Name: "Mapped title",
      Section: "Smoke",
      Priority: "Critical",
    },
    { "Case ID": "", Name: "", Section: "", Priority: "" },
  ],
};

describe("suggestMapping", () => {
  it("matches vendor headers onto Topology fields", () => {
    expect(suggestMapping(table.fields)).toMatchObject({
      key: "Case ID",
      title: "Name",
      folder: "Section",
      priority: "Priority",
    });
  });
});

describe("applyMapping", () => {
  it("honors an overridden mapping and reports invalid rows", () => {
    const mapping = {
      key: "Case ID",
      title: "Name",
      folder: "Section",
      priority: "Priority",
    };
    const { rows, errors } = applyMapping(table, mapping);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "C99",
      title: "Mapped title",
      folder: "Smoke",
      priority: "P0",
    });
    expect(errors.some((error) => /title is required/i.test(error))).toBe(true);
  });

  it("generates a provider-prefixed key when the mapped key is blank", () => {
    const { rows } = applyMapping(
      {
        ...table,
        rows: [{ "Case ID": "", Name: "Untitled", Section: "", Priority: "Low" }],
      },
      { title: "Name", key: "Case ID", priority: "Priority" },
    );
    expect(rows[0]?.key).toBe("TR-1");
  });
});

describe("buildMappingPreview", () => {
  it("returns counts and sample rows without requiring a custom mapping", () => {
    const preview = buildMappingPreview(table);
    expect(preview.counts).toEqual({ total: 2, valid: 1, invalid: 1 });
    expect(preview.sampleMappedRows[0]?.title).toBe("Mapped title");
    expect(preview.suggestedMapping.title).toBe("Name");
  });
});

describe("normalizePriority / normalizeStatus", () => {
  it("maps vendor labels onto Topology enums", () => {
    expect(normalizePriority("Critical")).toBe("P0");
    expect(normalizePriority("medium")).toBe("P2");
    expect(normalizeStatus("Approved")).toBe("ready");
    expect(normalizeStatus("deprecated")).toBe("deprecated");
  });
});
