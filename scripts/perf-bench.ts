/**
 * Benchmark smoke for list/flake/milestone queries against an existing DB.
 * Not part of default CI (`npm test` / `npm run test:unit`).
 *
 * Uses the `perf-fixture` workspace when present, otherwise PERF_WORKSPACE_ID
 * or the first workspace in the database.
 *
 *   npm run db:perf-bench
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { workspaces } from "../src/db/schema";
import { getFlakeHints } from "../src/lib/queries/flake";
import { listCasesPage } from "../src/lib/queries/list-cases";
import { listRunsPage } from "../src/lib/queries/list-runs";
import { listMilestonesWithReadiness } from "../src/lib/queries/milestones";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label.padEnd(42)} ${ms.toFixed(1)} ms`);
  return result;
}

async function resolveWorkspaceId(): Promise<string> {
  if (process.env.PERF_WORKSPACE_ID) return process.env.PERF_WORKSPACE_ID;
  const named = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, "perf-fixture"),
  });
  if (named) return named.id;
  const any = await db.query.workspaces.findFirst();
  if (!any) throw new Error("No workspace found. Run npm run db:perf-fixture.");
  return any.id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const workspaceId = await resolveWorkspaceId();
  console.log(`Benchmarking workspace ${workspaceId}`);

  // Ten warm-ups followed by 100 independent, measured page queries.
  const fixture = await listCasesPage(workspaceId, { page: 1, limit: 50, sort: "key" });
  if (process.env.TOPOLOGY_VALIDATION === "1" && fixture.total !== 50_000) {
    throw new Error(`Performance gate requires exactly 50,000 cases; found ${fixture.total}`);
  }
  for (let i = 0; i < 10; i++) await listCasesPage(workspaceId, { page: 1, limit: 50, sort: "key" });
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const started = performance.now();
    const page = await listCasesPage(workspaceId, { page: 1 + i % 10, limit: 50, sort: "key" });
    samples.push(performance.now() - started);
    if (page.items.length > 50) throw new Error("Cases list exceeded requested page size");
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const evidence = { scope: "database listCasesPage query (HTTP latency is a separate qualification)", cases: fixture.total,
    warmups: 10, samples, p95Ms, budgetMs: 500, cpu: cpus()[0]?.model, memoryBytes: totalmem(), node: process.version };
  if (process.env.PERF_OUTPUT) writeFileSync(process.env.PERF_OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (p95Ms >= 500) throw new Error(`Cases list p95 ${p95Ms.toFixed(1)} ms exceeds 500 ms budget`);

  const page1 = await time("listCasesPage page=1 limit=10", () =>
    listCasesPage(workspaceId, { page: 1, limit: 10, sort: "key" }),
  );
  await time("listCasesPage page=2 limit=10", () =>
    listCasesPage(workspaceId, { page: 2, limit: 10, sort: "key" }),
  );
  if (page1.nextCursor) {
    await time("listCasesPage cursor", () =>
      listCasesPage(workspaceId, {
        cursor: page1.nextCursor,
        limit: 10,
        sort: "key",
      }),
    );
  }
  await time("listCasesPage search+status", () =>
    listCasesPage(workspaceId, {
      page: 1,
      limit: 10,
      search: "perf",
      statusFilter: "ready",
    }),
  );
  await time("listRunsPage page=1 limit=10", () =>
    listRunsPage(workspaceId, { page: 1, limit: 10, sort: "updated" }),
  );
  await time("getFlakeHints limit=20", () => getFlakeHints(workspaceId, 20));
  await time("listMilestonesWithReadiness", () =>
    listMilestonesWithReadiness(workspaceId),
  );

  console.log(`cases total (from page 1 count): ${page1.total}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
