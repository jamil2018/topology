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

  it("keeps commas and escaped quotes inside a field", () => {
    const csv = `key,title
TOP-1,"say ""hello"", then go"
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.title).toBe('say "hello", then go');
  });

  it("reports missing required fields", () => {
    const csv = `key,title
,Missing key
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("keeps a quoted newline inside one row", () => {
    const csv = `key,title,steps,priority,status
TOP-4,Execute a manual run,"1. Open Runs
2. Start run
3. Record results",P0,ready
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("TOP-4");
    expect(rows[0]?.steps).toBe("1. Open Runs\n2. Start run\n3. Record results");
    expect(rows[0]?.priority).toBe("P0");
  });

  it("imports the following row after a closed quoted newline", () => {
    const csv = `key,title,steps
A,one,"line1
line2"
B,two,plain
`;
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((row) => row.key)).toEqual(["A", "B"]);
    expect(rows[0]?.steps).toBe("line1\nline2");
  });

  it("does not turn a continuation line into a phantom case", () => {
    const csv = `key,title,description,priority,status
SRC,source case,"line1
PHANTOM,created,from-newline,P0,ready
`;
    const { rows } = parseCasesCsv(csv);
    expect(rows.map((row) => row.key)).not.toContain("PHANTOM");
    expect(rows.every((row) => row.title !== "created")).toBe(true);
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

  it("round-trips a quoted newline field", () => {
    const steps = "1. Open Runs\n2. Start run\n3. Record results";
    const csv = serializeCasesCsv([
      {
        key: "TOP-4",
        title: "Execute a manual run",
        description: "Mark pass/fail on cases inside a run.",
        preconditions: "A run with attached cases exists.",
        steps,
        expectedResult: "Run progress updates and statuses persist.",
        priority: "P0",
        status: "ready",
        folderName: "runs",
        tags: ["runs", "manual"],
      },
    ]);
    const { rows, errors } = parseCasesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.steps).toBe(steps);
    expect(rows[0]?.key).toBe("TOP-4");
    expect(rows[0]?.title).toBe("Execute a manual run");
  });

  it("neutralizes formula prefixes, including folder names", () => {
    const csv = serializeCasesCsv([
      {
        key: "TOP-9",
        title: "=1+1",
        description: "  =1+1",
        preconditions: "+2+2",
        steps: "-2+3",
        expectedResult: "@SUM(1+1)",
        priority: "P2",
        status: "draft",
        folderName: "=Reports",
        tags: ["=1+1"],
      },
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'  =1+1");
    expect(csv).toContain("'+2+2");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@SUM(1+1)");
    expect(csv).toContain("'=Reports");
    expect(csv).not.toMatch(/(^|,)[=+\-@]/m);
    expect(csv).not.toMatch(/(^|,)"[=+\-@]/m);
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

