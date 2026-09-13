import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mergeShardResults,
  normalizeJUnitCases,
  parseJUnitXml,
  summarizeResults,
} from "@topology/domain";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/junit",
);

async function load(file: string) {
  const raw = await readFile(path.join(fixtures, file), "utf8");
  return normalizeJUnitCases(parseJUnitXml(raw).cases);
}

describe("cli junit merge-local (domain path)", () => {
  it("merges the smoke fixture as a single shard", async () => {
    const results = await load("smoke.xml");
    const summary = summarizeResults(results);
    expect(summary).toMatchObject({
      total: 3,
      passed: 2,
      failed: 1,
      passRate: 67,
    });
  });

  it("overwrites earlier shard outcomes like the CLI merge-local command", async () => {
    const shardA = normalizeJUnitCases(
      parseJUnitXml(`<testsuite>
        <testcase classname="hub" name="loads" time="0.1"><failure message="flake"/></testcase>
        <testcase classname="auth" name="login" time="0.1"/>
      </testsuite>`).cases,
    );
    const shardB = await load("smoke.xml");
    const merged = mergeShardResults([shardA, shardB]);
    expect(merged.find((r) => r.externalKey === "hub::loads")?.status).toBe(
      "passed",
    );
    expect(
      merged.find((r) => r.externalKey === "runs::record_result")?.status,
    ).toBe("failed");
  });
});
