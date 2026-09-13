import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { attachments, runResults } from "@/db/schema";
import { storeAttachmentFile } from "@/lib/attachments";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

async function loadScopedResult(resultId: string, workspaceId: string) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, resultId),
    with: { run: true },
  });
  if (!result || result.run?.workspaceId !== workspaceId) return null;
  return result;
}

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: resultId } = await params;
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const rows = await db.query.attachments.findMany({
    where: eq(attachments.resultId, resultId),
    orderBy: [desc(attachments.createdAt)],
  });

  return NextResponse.json({
    attachments: rows.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt,
      url: `/api/attachments/${a.id}`,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: resultId } = await params;
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const stored = await storeAttachmentFile(file);
    const [row] = await db
      .insert(attachments)
      .values({
        resultId,
        filename: stored.filename,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        uploadedById: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        attachment: {
          id: row.id,
          filename: row.filename,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          url: `/api/attachments/${row.id}`,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
