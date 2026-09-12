import { describe, expect, it } from "vitest";
import { buildCasesCsvTemplate, parseCasesCsv, serializeCasesCsv } from "@/lib/csv";

describe("parseCasesCsv", () => {
  it("parses a standard cases CSV", () => {
    const csv = `key,title,description,priority,status,folder,tags
TOP-10,Login works,Auth form,P0,ready,Smoke,smoke;auth
TOP-11,Logout works,,P2,draft,Smoke,auth
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "TOP-10",
      title: "Login works",
      priority: "P0",
      folder: "Smoke",
    });
    expect(rows[0].tags).toContain("smoke;auth");
  });

  it("reports missing required fields", () => {
    const csv = `key,title
,Missing key
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("serializeCasesCsv", () => {
  it("round-trips essential fields", () => {
    const csv = serializeCasesCsv([
      {
        key: "TOP-1",
        title: "Hub loads",
        description: "desc",
        preconditions: "pre",
        steps: "1. open",
        expectedResult: "ok",
        priority: "P0",
        status: "ready",
        folderName: "Smoke",
        tags: ["smoke", "ui"],
      },
    ]);
    const { rows } = parseCasesCsv(csv);
    expect(rows[0]?.key).toBe("TOP-1");
    expect(rows[0]?.folder).toBe("Smoke");
  });
});

describe("buildCasesCsvTemplate", () => {
  it("includes header and example rows the importer accepts", () => {
    const csv = buildCasesCsvTemplate();
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(csv.split("\n")[0]).toContain("key,title,description");
    expect(rows[0]?.key).toBe("TOP-20");
    expect(rows[0]?.folder).toBe("Import");
  });
});

