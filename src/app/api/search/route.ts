import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders, runs } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

/** Lightweight search for the command palette. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ cases: [], runs: [], folders: [] });
  }
  if (q.length > 200 || q.includes("\0")) {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  let caseRows;
  let runRows;
  let folderRows;
  try {
    [caseRows, runRows, folderRows] = await Promise.all([
      db
        .select({
          id: cases.id,
          key: cases.key,
          title: cases.title,
        })
        .from(cases)
        .where(
          and(
            eq(cases.workspaceId, workspaceId),
            or(ilike(cases.key, pattern), ilike(cases.title, pattern)),
          ),
        )
        .orderBy(desc(cases.updatedAt))
        .limit(8),
      db
        .select({
          id: runs.id,
          name: runs.name,
          status: runs.status,
        })
        .from(runs)
        .where(
          and(eq(runs.workspaceId, workspaceId), ilike(runs.name, pattern)),
        )
        .orderBy(desc(runs.updatedAt))
        .limit(6),
      db
        .select({
          id: folders.id,
          name: folders.name,
        })
        .from(folders)
        .where(
          and(
            eq(folders.workspaceId, workspaceId),
            ilike(folders.name, pattern),
          ),
        )
        .orderBy(folders.name)
        .limit(6),
    ]);
  } catch (err) {
    console.error("Search query failed", err);
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  return NextResponse.json({
    cases: caseRows,
    runs: runRows,
    folders: folderRows,
  });
}
