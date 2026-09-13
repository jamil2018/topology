import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    database = "error";
    dbError = err instanceof Error ? err.message : "database unreachable";
  }

  const ok = database === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      attachmentsDir: process.env.ATTACHMENTS_DIR ?? "./data/attachments",
      uptimeHintMs: Date.now() - started,
      ...(dbError ? { error: dbError } : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
