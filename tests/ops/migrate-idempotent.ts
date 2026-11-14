/**
 * Live check that journaled migrations can run twice.
 *
 * Skips unless TOPOLOGY_OPS_E2E=1. The pure migrator checks (journal
 * 0000 through 0005, unstamped reconcile, missing DATABASE_URL) already
 * run in src/db/migrator.test.ts without a database.
 *
 *   TOPOLOGY_OPS_E2E=1 npx tsx --env-file=.env.local --test tests/ops/migrate-idempotent.ts
 *
 * Manual equivalent:
 *   npm run db:migrate
 *   npm run db:migrate
 */
import { test } from "node:test";

const enabled = process.env.TOPOLOGY_OPS_E2E === "1";

test(
  "runMigrations applies twice without error",
  {
    skip: enabled
      ? false
      : "set TOPOLOGY_OPS_E2E=1 and DATABASE_URL to apply migrations twice",
  },
  async () => {
    const { runMigrations } = await import("../../src/db/migrator");
    await runMigrations();
    await runMigrations();
  },
);
