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
    console.error("[health] database check failed:", dbError);
  }

  const ok = database === "ok";
  const isProd = process.env.NODE_ENV === "production";

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      attachmentsDriver: process.env.ATTACHMENTS_DRIVER ?? "local",
      uptimeHintMs: Date.now() - started,
      // Dev/test only: filesystem paths and raw DB errors stay off public prod responses.
      ...(!isProd
        ? {
            attachmentsDir: process.env.ATTACHMENTS_DIR ?? "./data/attachments",
            ...(dbError ? { error: dbError } : {}),
          }
        : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
