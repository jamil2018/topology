/**
 * Seeded performance fixture for Phase 5 scale work.
 *
 * Default size is 5,000 cases and 50 runs (50k/500 would make local CI unusable).
 * Override with PERF_CASES / PERF_RUNS. Re-run is idempotent for the
 * `perf-fixture` workspace slug (it wipes that workspace first).
 *
 *   npm run db:perf-fixture
 *   PERF_CASES=50000 PERF_RUNS=500 npm run db:perf-fixture
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { hashToken } from "../src/lib/ci-auth";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { apiTokens, cases, runResults, runs, users, workspaceMembers, workspaces } from "../src/db/schema";

const SLUG = "perf-fixture";
const CASE_COUNT = Math.max(1, Number.parseInt(process.env.PERF_CASES ?? "5000", 10) || 5000);
const RUN_COUNT = Math.max(1, Number.parseInt(process.env.PERF_RUNS ?? "50", 10) || 50);
const BATCH = 500;

async function insertInBatches<T>(
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await write(rows.slice(i, i + BATCH));
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, SLUG),
  });
  if (existing) {
    await db.delete(workspaces).where(eq(workspaces.id, existing.id));
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "Perf fixture", slug: SLUG })
    .returning();

  const statuses = ["draft", "ready", "blocked", "deprecated"] as const;
  const priorities = ["P0", "P1", "P2", "P3"] as const;
  const caseRows = Array.from({ length: CASE_COUNT }, (_, i) => ({
    workspaceId: workspace.id,
    key: `PERF-${String(i + 1).padStart(5, "0")}`,
    title: `Perf case ${i + 1}`,
    description: "Generated scale fixture",
    priority: priorities[i % priorities.length]!,
    status: statuses[i % statuses.length]!,
    tags: i % 7 === 0 ? ["perf", "smoke"] : ["perf"],
  }));

  console.log(`Inserting ${CASE_COUNT} cases into workspace ${workspace.id}…`);
  await insertInBatches(caseRows, (chunk) => db.insert(cases).values(chunk));

  const insertedCases = await db
    .select({ id: cases.id })
    .from(cases)
    .where(eq(cases.workspaceId, workspace.id));

  const runRows = Array.from({ length: RUN_COUNT }, (_, i) => ({
    workspaceId: workspace.id,
    name: `Perf run ${i + 1}`,
    kind: i % 5 === 0 ? ("automation" as const) : ("manual" as const),
    status:
      i % 3 === 0
        ? ("completed" as const)
        : i % 3 === 1
          ? ("in_progress" as const)
          : ("planned" as const),
    environment: i % 2 === 0 ? "local" : "ci",
  }));

  console.log(`Inserting ${RUN_COUNT} runs…`);
  const createdRuns = await db.insert(runs).values(runRows).returning({
    id: runs.id,
  });

  const resultRows = [];
  for (const [runIndex, run] of createdRuns.entries()) {
    const sample = insertedCases.slice(0, Math.min(runIndex === 0 ? 5000 : 200, insertedCases.length));
    for (const [index, c] of sample.entries()) {
      const flip = (index + run.id.charCodeAt(0)) % 4;
      resultRows.push({
        runId: run.id,
        caseId: c.id,
        status:
          flip === 0
            ? ("passed" as const)
            : flip === 1
              ? ("failed" as const)
              : flip === 2
                ? ("passed" as const)
                : ("untested" as const),
      });
    }
  }
  console.log(`Inserting ${resultRows.length} run results…`);
  await insertInBatches(resultRows, (chunk) => db.insert(runResults).values(chunk));

  if (process.env.TOPOLOGY_VALIDATION === "1") {
    const user = await db.query.users.findFirst({ where: eq(users.email, "demo@topology.local") });
    if (!user) throw new Error("Seed the isolated performance database before creating fixtures");
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "admin" });
    await db.insert(apiTokens).values({ workspaceId: workspace.id, userId: user.id, name: "Performance", tokenHash: hashToken("topo_validation_performance_token"), tokenPrefix: "topo_validation", scope: "read,ci-write,agent" });
    await db.update(runs).set({ kind: "manual", status: "in_progress", createdById: user.id }).where(eq(runs.id, createdRuns[0].id));
    if (process.env.PERF_METADATA_OUTPUT) writeFileSync(process.env.PERF_METADATA_OUTPUT, JSON.stringify({ projectId: workspace.id, runId: createdRuns[0].id }));
  }
  console.log(
    `Done. workspace=${workspace.id} slug=${SLUG} cases=${CASE_COUNT} runs=${RUN_COUNT}`,
  );
  console.log("Benchmark with: npm run db:perf-bench");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
