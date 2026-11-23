import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const [before, after] = process.argv.slice(2);
if (!before || !after) throw new Error("Usage: npm run test:coverage:compare -- <baseline-invocation> <candidate-invocation>");

const read = (filename: string): unknown => JSON.parse(readFileSync(filename, "utf8"));
const runSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/), status: z.literal("passed"),
  mode: z.literal("coverage"), dirty: z.literal(false),
  environment: z.object({ node: z.string(), platform: z.string(), arch: z.string() }),
  coverage: z.object({ repositoryRoot: z.string(), vitest: z.string(), v8: z.string(), python: z.string(), pythonCoverage: z.string() }),
});
const baseline = runSchema.parse(read(path.join(before, "summary.json")));
const candidate = runSchema.parse(read(path.join(after, "summary.json")));
const { repositoryRoot: baselineRoot, ...baselineTools } = baseline.coverage;
const { repositoryRoot: candidateRoot, ...candidateTools } = candidate.coverage;
if (JSON.stringify(baselineTools) !== JSON.stringify(candidateTools) ||
    JSON.stringify(baseline.environment) !== JSON.stringify(candidate.environment)) {
  throw new Error("Compare coverage generated with the same tooling and platform");
}
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("rev-parse", "HEAD") !== candidate.commit) throw new Error("Compare from the frozen candidate checkout");
const files = git("diff", "--name-only", "--diff-filter=ACMR", baseline.commit, candidate.commit, "--", "src", "packages")
  .split("\n").filter((name) => /\.(tsx?|py)$/.test(name) && !/\.test\.tsx?$|\/tests?\/|\.d\.ts$/.test(name));

type Counts = { covered: number; total: number };
type FileCoverage = { lines: Counts; branches: Counts };
const metric = z.object({ covered: z.number(), total: z.number() });
const typedSummary = z.record(z.string(), z.object({ lines: metric, branches: metric }));
const pyCounts = z.object({
  covered_lines: z.number(), num_statements: z.number(), covered_branches: z.number(), num_branches: z.number(),
});
const pySummary = z.object({ files: z.record(z.string(), z.object({ summary: pyCounts })), totals: pyCounts });
function coverageReport(folder: string, root: string, suite: string) {
  const normalize = (file: string) => path.isAbsolute(file) ? path.relative(root, file) : file;
  if (suite === "python") {
    const { files, totals } = pySummary.parse(read(path.join(folder, "coverage", "python.json")));
    function counts(summary: z.infer<typeof pyCounts>): FileCoverage {
      return {
        lines: { covered: summary.covered_lines, total: summary.num_statements },
        branches: { covered: summary.covered_branches, total: summary.num_branches },
      };
    }
    return { total: counts(totals), files: new Map(Object.entries(files).map(([file, value]) => [normalize(file), counts(value.summary)])) };
  }
  const { total, ...files } = typedSummary.parse(read(path.join(folder, "coverage", suite, "coverage-summary.json")));
  return { total, files: new Map(Object.entries(files).map(([file, counts]) => [normalize(file), counts])) };
}

const suites = ["unit", "components", "integration", "python"];
const reports = suites.map((suite) => {
  const previous = coverageReport(before, baselineRoot, suite);
  const current = coverageReport(after, candidateRoot, suite);
  const changed = files.filter((file) => file.endsWith(".py") === (suite === "python")).map((file) => {
    const previousCounts = previous.files.get(file);
    const counts = current.files.get(file);
    const drops = (["lines", "branches"] as const).filter((key) => {
      const old = previousCounts?.[key];
      const next = counts?.[key];
      return old?.total && (!next?.total || next.covered * old.total < old.covered * next.total);
    });
    return { file, previous: previousCounts ?? null, current: counts ?? null, drops };
  });
  return { suite, previous: previous.total, current: current.total, changed };
});
const regressions = reports.flatMap(({ suite, changed }) =>
  changed.filter(({ drops, current }) => drops.length || !current).map((row) => ({ suite, ...row })));
const result = { baseline: baseline.commit, candidate: candidate.commit, tools: candidateTools, reports, regressions };
const output = path.join(after, "coverage", "comparison.json");
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(`${regressions.length} touched file/suite coverage gaps requiring review. ${output}`);
if (regressions.length) process.exitCode = 1;
