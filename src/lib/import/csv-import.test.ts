import { describe, expect, it } from "vitest";
import { parseCasesCsv } from "@/lib/csv";
import { buildCsvImportSample } from "@/lib/import/csv-preview";

describe("buildCsvImportSample", () => {
  it("surfaces custom fields and structured step counts from numbered steps", () => {
    const csv = `key,title,steps,expectedResult,folder,cf:owner
TOP-1,Login,"1. Open app
2. Sign in","1. App loads
2. Home visible",Smoke,qa
`;
    const { rows, errors } = parseCasesCsv(csv, {
      customFieldKeys: ["owner"],
    });
    expect(errors).toEqual([]);
    const sample = buildCsvImportSample(rows);
    expect(sample).toHaveLength(1);
    expect(sample[0]).toMatchObject({
      key: "TOP-1",
      title: "Login",
      folder: "Smoke",
      customFields: { owner: "qa" },
      structuredStepCount: 2,
    });
  });

  it("counts zero structured steps when steps are blank", () => {
    const { rows } = parseCasesCsv(`key,title
A,Empty
`);
    expect(buildCsvImportSample(rows)[0]?.structuredStepCount).toBe(0);
  });
});
