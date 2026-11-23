import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const output = path.resolve("test-results/acceptance-final.json");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const inventory = JSON.parse(readFileSync("tasks/validation/inventory.json", "utf8"));
const migrationTip = journal.entries.at(-1).tag;
const results: { suite: string; manifest: string; status: string }[] = [];
mkdirSync(path.dirname(output), { recursive: true });
async function main() {
for (const [index, suite] of ["sanity", "sanity", "sanity", "release"].entries()) {
  if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== commit) throw new Error("Final acceptance requires an unchanged, clean commit");
  const before = new Set(readdirSync("test-results"));
  console.log(`Final acceptance ${index + 1}/4: ${suite} on ${commit}`);
  const status = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/validation/run.ts", suite], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  const directories = readdirSync("test-results").filter((entry) => entry.startsWith("validation-") && !before.has(entry));
  if (directories.length !== 1) throw new Error("Expected exactly one immutable invocation manifest");
  const manifest = path.join("test-results", directories[0], "summary.json");
  const summary = JSON.parse(readFileSync(manifest, "utf8"));
  const passed = status === 0 && summary.status === "passed" && summary.commit === commit && !summary.dirty && summary.retries === 0 && !git("status", "--porcelain") && git("rev-parse", "HEAD") === commit;
  results.push({ suite, manifest, status: passed ? "passed" : "failed" });
  writeFileSync(output, JSON.stringify({ commit, status: passed && results.length === 4 ? "passed" : passed ? "running" : "failed", results }, null, 2) + "\n");
  const rows = results.flatMap((result) => {
    const run = JSON.parse(readFileSync(result.manifest, "utf8"));
    return run.results.map((phase: { command: string; status: string; durationMs: number; tests?: { passed: number; failed: number; skipped: number; flaky: number } }) =>
      `| ${result.suite} | ${phase.command.replaceAll("|", "\\|")} | ${phase.status} | ${(phase.durationMs / 1000).toFixed(2)} | ${phase.tests ? `${phase.tests.passed} passed / ${phase.tests.failed} failed / ${phase.tests.skipped} skipped / ${phase.tests.flaky} flaky` : "asserted command"} |`);
  });
  writeFileSync(path.resolve("test-results/acceptance-final.md"), `# Topology final acceptance\n\nCommit: ${commit}. Repository required clean and unchanged. Retries disabled. Status: **${passed && results.length === 4 ? "PASSED" : passed ? "RUNNING" : "FAILED"}**.\n\n${results.map((result) => `- ${result.suite}: ${result.status}; [immutable manifest](${path.resolve(result.manifest)})`).join("\n")}\n\n| Suite | Phase | Status | Seconds | Outcomes |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Critique and qualification limits\n\nThe isolated production suite checks persisted outcomes, authorization failures, actual server recovery, exports, visual comparisons and measured budgets. Handler integrations use their declared session mocks; browser/HTTP tests prove selected actual session and transport paths. Raw logs, screenshots, traces, Lighthouse and performance samples are adjacent to each manifest. Earlier failed attempts remain preserved.\n\nThe candidate inventory contains ${inventory.cases.length} release cases, ${inventory.routes.length} page/API methods, ${inventory.packages.length} packages and ${inventory.promises.length} README entries. The migration journal ends at \`${migrationTip}\`. Review the named assertions and reconcile every applicable row in the launch ledger.\n\nThis receipt covers disposable automation. The launch packet records production-like Compose and HTTPS, restore on a separate host, physical devices, assistive technologies, usability, live integrations, precise package artifacts, and final decision evidence. See tasks/validation/README.md.\n`);
  if (!passed) { process.exitCode = 1; break; }
}
if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== commit) throw new Error("Repository changed during final acceptance");

}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
