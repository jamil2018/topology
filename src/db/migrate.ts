/**
 * Apply SQL files in drizzle/ in lexical order (idempotent migrations).
 * Prefer `npm run db:push` for schema sync; use this to apply checked-in SQL.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(url, { max: 1 });
  try {
    for (const file of files) {
      const full = path.join(dir, file);
      const body = await readFile(full, "utf8");
      process.stdout.write(`Applying ${file}… `);
      await sql.unsafe(body);
      console.log("ok");
    }
    console.log(`Applied ${files.length} migration file(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
