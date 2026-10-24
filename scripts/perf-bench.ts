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
