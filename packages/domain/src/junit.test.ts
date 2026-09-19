import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  externalKeyForCase,
  mergeShardResults,
  normalizeJUnitCases,
  parseJUnitXml,
  summarizeResults,
} from "./junit";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/junit",
);

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
      errorMessage: "expected 200",
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
      errorMessage: "kaboom",
    });
  });

  it("separates failure message attr from stack body", () => {
    const normalized = normalizeJUnitCases(
      parseJUnitXml(
        `<testsuite><testcase classname="pay" name="checkout" time="0.2"><failure message="iframe timeout">Error: iframe timeout
    at wait (/src/pay.spec.ts:12:3)
</failure></testcase></testsuite>`,
      ).cases,
    );
    expect(normalized[0]?.errorMessage).toBe("iframe timeout");
    expect(normalized[0]?.stack).toContain("at wait");
    expect(normalized[0]?.notes).toContain("iframe timeout");
  });

  it("does not treat </testcase> in output or a nested suite as the end of a failure", async () => {
    const raw = await readFile(path.join(fixtures, "false-green.xml"), "utf8");
    const normalized = normalizeJUnitCases(parseJUnitXml(raw).cases);
    const shouldFail = normalized.find((r) => r.externalKey === "auth::should-fail");
    const kept = normalized.find((r) => r.externalKey === "inner::kept");
    const sibling = normalized.find((r) => r.externalKey === "outer::sibling");

    expect(shouldFail?.status).toBe("failed");
    expect(shouldFail?.notes).toContain("assertion failed");
    expect(kept?.status).toBe("passed");
    expect(sibling?.status).toBe("failed");
    expect(sibling?.notes).toContain("must-not-drop");
    expect(summarizeResults(normalized).passRate).not.toBe(100);
    expect(summarizeResults(normalized)).toMatchObject({
      total: 3,
      passed: 1,
      failed: 2,
    });
  });

  it("ignores comments and CDATA, and does not let skipped hide a failure", () => {
    const commented = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <!-- <testcase classname="ghost" name="commented"><failure message="should-not-ingest"/></testcase> -->
        <testcase classname="real" name="ok" time="0.1"/>
      </testsuite>`).cases,
    );
    expect(commented.map((r) => r.externalKey)).toEqual(["real::ok"]);
    expect(commented[0]?.status).toBe("passed");

    const cdata = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="real" name="ok" time="0.1">
          <system-out><![CDATA[</testcase><testcase classname="injected" name="planted"><failure message="planted-failure"/>]]></system-out>
        </testcase>
      </testsuite>`).cases,
    );
    expect(cdata).toHaveLength(1);
    expect(cdata[0]?.status).toBe("passed");

    const both = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="flaky" name="still" time="0.1">
          <skipped message="flaky"/>
          <failure message="still failed"/>
        </testcase>
      </testsuite>`).cases,
    );
    expect(both[0]).toMatchObject({
      status: "failed",
      notes: "still failed",
    });

    const logFailure = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="auth" name="login" time="0.1">
          <system-out><failure message="false-fail"></system-out>
        </testcase>
      </testsuite>`).cases,
    );
    expect(logFailure[0]?.status).toBe("passed");
  });

  it("returns quickly on a pile of unclosed suite tags", () => {
    const raw = "<testsuite ".repeat(8_000);
    const started = Date.now();
    const report = parseJUnitXml(raw);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(report.cases).toEqual([]);
  });

  it("reads single-quoted attributes", () => {
    const normalized = normalizeJUnitCases(
      parseJUnitXml(
        `<testsuite><testcase classname='AuthSuite' name='login_single' time='0.1'/></testsuite>`,
      ).cases,
    );
    expect(normalized[0]?.externalKey).toBe("AuthSuite::login_single");
    expect(normalized[0]?.status).toBe("passed");
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
