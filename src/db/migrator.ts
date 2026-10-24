import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function resolveMigrationsFolder(cwd = process.cwd()) {
  const fromEnv = process.env.DRIZZLE_MIGRATIONS_FOLDER?.trim();
  if (fromEnv) return path.resolve(cwd, fromEnv);
  return path.join(cwd, "drizzle");
}

export function resolveReconcileSqlPath(cwd = process.cwd()) {
  return path.join(cwd, "src/db/reconcile-unstamped.sql");
}

/** Push-created DBs have tables but no journal rows; 0000_baseline cannot replay. */
export function shouldReconcileUnstamped(input: {
  usersTableExists: boolean;
  migrationRowCount: number | null;
}): boolean {
  return input.usersTableExists && (input.migrationRowCount ?? 0) === 0;
}

async function inspectSchema(sql: postgres.Sql) {
  const users = await sql<{ name: string | null }[]>`
    SELECT to_regclass('public.users')::text AS name
  `;
  const journal = await sql<{ name: string | null }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name
  `;
  let migrationRowCount: number | null = null;
  if (journal[0]?.name) {
    const rows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations
    `;
    migrationRowCount = Number(rows[0]?.n ?? 0);
  }
  return {
    usersTableExists: Boolean(users[0]?.name),
    migrationRowCount,
  };
}

async function stampJournal(
  sql: postgres.Sql,
  migrationsFolder: string,
) {
  const files = readMigrationFiles({ migrationsFolder });
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
  for (const migration of files) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      SELECT ${migration.hash}, ${migration.folderMillis}
      WHERE NOT EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${migration.hash}
      )
    `;
  }
}

async function reconcileUnstampedSchema(sql: postgres.Sql) {
  await sql.file(resolveReconcileSqlPath());
}

export async function runMigrations(opts?: {
  databaseUrl?: string;
  migrationsFolder?: string;
}) {
  const url = (opts?.databaseUrl ?? process.env.DATABASE_URL)?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");

  const migrationsFolder =
    opts?.migrationsFolder ?? resolveMigrationsFolder();
  const sql = postgres(url, { max: 1 });
  try {
    const state = await inspectSchema(sql);
    if (shouldReconcileUnstamped(state)) {
      process.stdout.write(
        "Reconciling unstamped schema (drizzle-kit push leftover)… ",
      );
      await reconcileUnstampedSchema(sql);
      await stampJournal(sql, migrationsFolder);
      console.log("ok");
      return;
    }

    process.stdout.write(`Applying migrations from ${migrationsFolder}… `);
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder });
    console.log("ok");
  } finally {
    await sql.end({ timeout: 5 });
  }
}
