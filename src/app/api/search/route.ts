import { NextResponse } from "next/server";
import { desc, ilike, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders, runs } from "@/db/schema";

/** Lightweight search for the command palette. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ cases: [], runs: [], folders: [] });
  }

  const pattern = `%${q}%`;

  const [caseRows, runRows, folderRows] = await Promise.all([
    db
      .select({
        id: cases.id,
        key: cases.key,
        title: cases.title,
      })
      .from(cases)
      .where(or(ilike(cases.key, pattern), ilike(cases.title, pattern)))
      .orderBy(desc(cases.updatedAt))
      .limit(8),
    db
      .select({
        id: runs.id,
        name: runs.name,
        status: runs.status,
      })
      .from(runs)
      .where(ilike(runs.name, pattern))
      .orderBy(desc(runs.updatedAt))
      .limit(6),
    db
      .select({
        id: folders.id,
        name: folders.name,
      })
      .from(folders)
      .where(ilike(folders.name, pattern))
      .orderBy(folders.name)
      .limit(6),
  ]);

  return NextResponse.json({
    cases: caseRows,
    runs: runRows,
    folders: folderRows,
  });
}
