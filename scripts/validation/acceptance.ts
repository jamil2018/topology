import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const output = path.resolve("test-results/acceptance-final.json");
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
  writeFileSync(path.resolve("test-results/acceptance-final.md"), `# Topology final acceptance\n\nCommit: ${commit}. Repository required clean and unchanged. Retries disabled. Status: **${passed && results.length === 4 ? "PASSED" : passed ? "RUNNING" : "FAILED"}**.\n\n${results.map((result) => `- ${result.suite}: ${result.status}; [immutable manifest](${path.resolve(result.manifest)})`).join("\n")}\n\n| Suite | Phase | Status | Seconds | Outcomes |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Critique and qualification limits\n\nThe isolated production suite checks persisted outcomes, authorization failures, actual server recovery, exports, visual comparisons and measured budgets. Handler integrations use their declared session mocks; browser/HTTP tests prove selected actual session and transport paths. Raw logs, screenshots, traces, Lighthouse and performance samples are adjacent to each manifest. Earlier failed attempts remain preserved.\n\nAll 226 release contracts, 202 page/API-method entries, nine packages and README promises have an assertion scope or explicit manual recipe in tasks/validation/inventory.json. A passing aggregate suite does not certify every unasserted step: whole-case manual status remains unqualified where noted. See tasks/validation/feature-families.md and findings.md.\n\nUnqualified: real OAuth/provider writes/AI (authorized sandbox applications and scoped credentials required; test:live qualifies configured reads only); VoiceOver on macOS/NVDA on Windows and native 200%/400% zoom (human operator required); actual HTTPS/HSTS, full deployment Compose/proxy and disaster recovery on another host (disposable TLS deployment required); external package-consumer and Office/Numbers/Sheets compatibility (separate consumer projects/apps required); physical devices/native Safari (actual hardware required). PDF non-Latin font compatibility needs manual assessment. Seven development-only dependency advisories remain (Vitest/tinypool/mocker and drizzle-kit/esbuild); production audit has zero known advisories. Breaking development dependency upgrades were not bundled.\n\nWebKit same-origin cancellation errors during pending document replacement are retained and narrowly classified per upstream Playwright #43120; all other page errors fail. Linux browser rendering is not native Safari certification. Local host/runtime/container resources are in each manifest; scale budgets qualify this measured environment. Webhook retries are bounded best-effort in-process, not a durable queue; unsigned empty-secret compatibility is explicit.\n\nOptional UX improvement: a denser long-title catalog display could reduce row height; current wrapping remains readable/editable in the inspected references. Human discoverability and ergonomics remain unqualified.\n\nNo deployment, publication, push or merge was performed. Developer database was not reset. Apply migration 0006 before running the updated app.\n`);
  if (!passed) { process.exitCode = 1; break; }
}
if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== commit) throw new Error("Repository changed during final acceptance");

}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
