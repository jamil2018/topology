import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { candidateSchema, integrations, packageNames, qualificationIssue, rowSchema, signatures } from "./launch-contract";

const [command, directory] = process.argv.slice(2);
if (!["init", "check"].includes(command) || !directory) {
  throw new Error("Usage: npm run test:launch -- <init|check> <packet-directory>");
}
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const root = path.resolve(directory);
const read = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const write = (file: string, contents: unknown, create = false) =>
  writeFileSync(path.join(root, file), JSON.stringify(contents, null, 2) + "\n", { flag: create ? "wx" : "w" });
const digest = (file: string) => "sha256:" + createHash("sha256").update(readFileSync(file)).digest("hex");
const commit = git("rev-parse", "HEAD");
const inventoryFile = "tasks/validation/inventory.json";
const inventoryDigest = digest(inventoryFile);
const journalDigest = digest("drizzle/meta/_journal.json");
const item = z.object({
  id: z.string(), priority: z.string(), expectedBehavior: z.string(),
  automatedChecks: z.array(z.string()), manualChecks: z.string(),
});
const inventory = z.object({
  cases: z.array(item), routes: z.array(item), packages: z.array(item), promises: z.array(item),
}).parse(read(inventoryFile));
const definitions = [...inventory.cases, ...inventory.routes, ...inventory.packages, ...inventory.promises]
  .map((row) => ({ ...row, allowNA: !row.id.startsWith("LAUNCH-") && row.priority !== "P0" }));
for (const [id, title] of Object.entries(integrations)) {
  definitions.push({
    id: `INTEGRATION:${id}`, priority: "P0", allowNA: false, expectedBehavior: title, automatedChecks: [],
    manualChecks: "Verify positive and negative connector contract using synthetic inputs. Attach an immutable receipt.",
  }, {
    id: `LIVE:${id}`, priority: "P0", allowNA: true, expectedBehavior: title, automatedChecks: [],
    manualChecks: "Verify the working path and key failure in the approved sandbox using each launch-enabled delivery mode.",
  });
}

if (command === "init") {
  mkdirSync(root);
  write("candidate.json", {
    commit, inventoryDigest, journalDigest,
    imageDigest: null, composeDigest: null, proxyDigest: null, stagingOrigin: null,
    browsers: ["Chromium", "Firefox", "WebKit", "macOS Safari", "iPhone Safari", "Android Chrome"],
    packages: {},
    integrations: Object.fromEntries(Object.keys(integrations).map((id) => [id, { enabled: null, promised: null }])),
    signatures: {},
  }, true);
  write("ledger.json", Object.fromEntries(definitions.map(({ id, priority, expectedBehavior, automatedChecks, manualChecks }) => [
    id, { priority, expectedBehavior, automatedChecks, manualChecks, owner: id.startsWith("LIVE:") ? "Integrations" : "QA", status: "NOT RUN" },
  ])), true);
  console.log(`Initialized ${definitions.length} qualification rows for ${commit} in ${root}`);
} else {
  const candidate = candidateSchema.parse(read(path.join(root, "candidate.json")));
  const ledger = z.record(z.string(), rowSchema).parse(read(path.join(root, "ledger.json")));
  const blockers: string[] = [];
  const now = Date.now();
  const local = (file: string) => path.isAbsolute(file) ? file : path.resolve(root, file);
  const evidenceExists = (value: string) => /^https:\/\//i.test(value) ||
    (existsSync(local(value)) && statSync(local(value)).isFile());
  if (candidate.commit !== commit || candidate.inventoryDigest !== inventoryDigest ||
      candidate.journalDigest !== journalDigest || git("status", "--porcelain")) {
    blockers.push("Candidate SHA, inventory, and migration journal must match a clean checkout");
  }
  for (const field of ["imageDigest", "composeDigest", "proxyDigest", "stagingOrigin"] as const) {
    if (!candidate[field]) blockers.push(`Missing candidate ${field}`);
  }
  for (const name of packageNames) {
    const artifact = candidate.packages[name];
    if (!artifact) blockers.push(`Missing package artifact ${name}`);
    else if (!existsSync(local(artifact.artifact)) || !statSync(local(artifact.artifact)).isFile() ||
      digest(local(artifact.artifact)) !== artifact.digest) blockers.push(`Artifact checksum mismatch for ${name}`);
  }
  for (const role of signatures) {
    const attestation = candidate.signatures[role];
    if (!attestation || Date.parse(attestation.signedAt) > now || !attestation.evidence.every(evidenceExists)) {
      blockers.push(`Missing valid ${role} sign-off`);
    }
  }
  const expectedIds = new Set(definitions.map(({ id }) => id));
  if (expectedIds.size !== definitions.length) blockers.push("Duplicate inventory IDs");
  for (const id of Object.keys(ledger)) {
    if (!expectedIds.has(id)) blockers.push(`Unknown ledger row ${id}`);
  }
  for (const [id, definition] of Object.entries(candidate.integrations)) {
    if (!Object.hasOwn(integrations, id)) blockers.push(`Unknown integration ${id}`);
    if (definition.enabled === null || definition.promised === null) blockers.push(`Launch applicability unknown for ${id}`);
    if ((definition.enabled || definition.promised) && (!definition.owner || !definition.sandbox || !definition.deliveryModes)) {
      blockers.push(`Missing owner, sandbox or delivery modes for ${id}`);
    }
  }
  for (const id of Object.keys(integrations)) {
    if (!Object.hasOwn(candidate.integrations, id)) blockers.push(`Missing launch integration ${id}`);
  }
  const stagingChecks = new Set(["LAUNCH-OPS-001", "LAUNCH-OPS-002", "LAUNCH-OPS-003", "LAUNCH-UX-002"]);
  for (const { id, priority, allowNA } of definitions) {
    const row = ledger[id];
    if (!row) { blockers.push(`Missing ledger row ${id}`); continue; }
    const connection = id.startsWith("LIVE:") ? candidate.integrations[id.slice(5)] : undefined;
    const mayBeInapplicable = connection ? connection.enabled === false && connection.promised === false : allowNA && !id.startsWith("LIVE:");
    const issue = qualificationIssue(row, {
      priority, allowNA: mayBeInapplicable, commit, stagingDigest: candidate.imageDigest ?? undefined,
      stagingRequired: stagingChecks.has(id) || (id.startsWith("LIVE:") && !mayBeInapplicable),
      releaseOwner: candidate.signatures["Release owner"]?.signer, now,
    });
    if (id === "LAUNCH-CI-001" && row.status === "PASS" && row.environment !== "ci") {
      blockers.push(`${id} — CI environment required`);
    }
    if (issue) blockers.push(`${id} — ${issue}`);
    else if (row.evidence?.some((value) => !evidenceExists(value))) blockers.push(`${id} — evidence file missing`);
  }
  try {
    const receipt = z.object({
      commit: z.string(), status: z.literal("passed"),
      results: z.array(z.object({ suite: z.string(), manifest: z.string(), status: z.literal("passed") })),
    }).parse(read("test-results/acceptance-final.json"));
    if (receipt.commit !== commit || receipt.results.map(({ suite }) => suite).join(",") !== "sanity,sanity,sanity,release") {
      blockers.push("Acceptance requires three clean sanity passes and a release pass on the candidate");
    } else {
      for (const { suite, manifest } of receipt.results) {
        const invocation = z.object({
          commit: z.literal(commit), mode: z.literal(suite), status: z.literal("passed"), dirty: z.literal(false), retries: z.literal(0),
          results: z.array(z.object({ status: z.literal("passed") })).min(1),
        }).safeParse(read(manifest));
        if (!invocation.success) blockers.push(`Invalid acceptance invocation ${manifest}`);
      }
    }
  } catch {
    blockers.push("Missing or invalid same-commit acceptance receipts");
  }
  const counts = Object.groupBy(Object.values(ledger), ({ status }) => status);
  const decision = blockers.length ? "HOLD" : "GO";
  write("decision.json", { commit, imageDigest: candidate.imageDigest, decision, checkedAt: new Date(now).toISOString(),
    expectedRows: definitions.length, counts: Object.fromEntries(Object.entries(counts).map(([status, rows]) => [status, rows.length])), blockers });
  console.log(`${decision} — ${blockers.length} outstanding checks. Decision: ${path.join(root, "decision.json")}`);
  process.exitCode = blockers.length ? 1 : 0;
}
