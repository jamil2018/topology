import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import { parseCasesCsv, serializeCasesCsv } from "@/lib/csv";
import { listCases } from "@/lib/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await listCases();
  const csv = serializeCasesCsv(
    data.map((c) => ({
      key: c.key,
      title: c.title,
      description: c.description,
      preconditions: c.preconditions,
      steps: c.steps,
      expectedResult: c.expectedResult,
      priority: c.priority,
      status: c.status,
      folderName: c.folder?.name,
      tags: c.tags,
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="topology-cases.csv"',
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let raw = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    raw = await file.text();
  } else {
    const body = await request.json();
    raw = typeof body?.csv === "string" ? body.csv : "";
  }

  const { rows, errors } = parseCasesCsv(raw);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows", details: errors },
      { status: 400 },
    );
  }

  const existingFolders = await db.select().from(folders);
  const folderByName = new Map(
    existingFolders.map((f) => [f.name.toLowerCase(), f]),
  );

  const created = [];
  const skipped: string[] = [];

  for (const row of rows) {
    let folderId: string | null = null;
    if (row.folder) {
      const key = row.folder.toLowerCase();
      let folder = folderByName.get(key);
      if (!folder) {
        const [inserted] = await db
          .insert(folders)
          .values({ name: row.folder })
          .returning();
        folder = inserted;
        folderByName.set(key, inserted);
      }
      folderId = folder.id;
    }

    const tags = row.tags
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const existing = await db.query.cases.findFirst({
        where: eq(cases.key, row.key),
      });
      if (existing) {
        skipped.push(row.key);
        continue;
      }

      const [c] = await db
        .insert(cases)
        .values({
          key: row.key,
          title: row.title,
          description: row.description,
          preconditions: row.preconditions,
          steps: row.steps,
          expectedResult: row.expectedResult,
          priority: row.priority,
          status: row.status,
          folderId,
          tags,
          createdById: session.user.id,
        })
        .returning();
      created.push(c);
    } catch {
      skipped.push(row.key);
    }
  }

  return NextResponse.json({
    created: created.length,
    skipped,
    errors,
    cases: created,
  });
}
