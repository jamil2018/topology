import { describe, expect, it } from "vitest";
import {
  externalKeyForCase,
  mergeShardResults,
  normalizeJUnitCases,
  parseJUnitXml,
  summarizeResults,
} from "./junit";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Smoke" tests="3" failures="1" errors="0" skipped="1" time="1.5">
    <testcase classname="auth" name="login" time="0.4"/>
    <testcase classname="auth" name="logout" time="0.2">
      <failure message="expected 200"/>
    </testcase>
    <testcase classname="nav" name="hub" time="0.1">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;

describe("parseJUnitXml", () => {
  it("parses suites and case statuses", () => {
    const report = parseJUnitXml(sample);
    expect(report.suites).toHaveLength(1);
    expect(report.cases).toHaveLength(3);
    expect(report.cases.map((c) => c.status)).toEqual([
      "passed",
      "failed",
      "skipped",
    ]);
  });

  it("normalizes and summarizes", () => {
    const normalized = normalizeJUnitCases(parseJUnitXml(sample).cases);
    expect(normalized[1]).toMatchObject({
      externalKey: "auth::logout",
      status: "failed",
    });
    expect(summarizeResults(normalized)).toMatchObject({
      passed: 1,
      failed: 1,
      skipped: 1,
      passRate: 50,
    });
  });

  it("handles empty and BOM-prefixed XML", () => {
    expect(parseJUnitXml("").cases).toEqual([]);
    const bom = `\uFEFF${sample}`;
    expect(parseJUnitXml(bom).cases).toHaveLength(3);
  });

  it("parses cases-only XML without a suite wrapper", () => {
    const report = parseJUnitXml(
      `<testcase classname="solo" name="works" time="0.1"/><testcase name="bare" time="0.2"><error message="boom"/></testcase>`,
    );
    expect(report.suites[0]?.name).toBe("imported");
    expect(report.cases).toHaveLength(2);
    expect(report.cases[1]?.status).toBe("error");
  });

  it("maps error status to failed on normalize", () => {
    const normalized = normalizeJUnitCases(
      parseJUnitXml(
        `<testsuite><testcase classname="x" name="y" time="0.1"><error message="kaboom"/></testcase></testsuite>`,
      ).cases,
    );
    expect(normalized[0]).toMatchObject({
      status: "failed",
      notes: "kaboom",
    });
  });

  it("builds external keys from classname/name edges", () => {
    expect(externalKeyForCase({ classname: "a", name: "b" })).toBe("a::b");
    expect(externalKeyForCase({ classname: "", name: "only" })).toBe("only");
    expect(externalKeyForCase({ classname: "cls", name: "" })).toBe("cls");
    expect(externalKeyForCase({ classname: "  ", name: "  " })).toBe("unknown");
  });
});

describe("mergeShardResults", () => {
  it("merges shards by external key with later overwrite", () => {
    const shard1 = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="a" name="one" time="0.1"/>
        <testcase classname="a" name="two" time="0.1"><failure message="boom"/></testcase>
      </testsuite>`).cases,
    );
    const shard2 = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="a" name="two" time="0.2"/>
        <testcase classname="b" name="three" time="0.1"/>
      </testsuite>`).cases,
    );

    const merged = mergeShardResults([shard1, shard2]);
    expect(merged).toHaveLength(3);
    expect(merged.find((r) => r.externalKey === "a::two")?.status).toBe(
      "passed",
    );
    expect(merged.map((r) => r.externalKey).sort()).toEqual([
      "a::one",
      "a::two",
      "b::three",
    ]);
  });

  it("summarizes empty merge as null pass rate", () => {
    expect(summarizeResults([])).toMatchObject({
      total: 0,
      passRate: null,
    });
  });
});
