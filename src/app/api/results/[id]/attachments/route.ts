import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { attachments, runResults } from "@/db/schema";
import { ATTACHMENT_MAX_BYTES, inferAttachmentKind, isAttachmentKind, storeAttachmentFile } from "@/lib/attachments";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

function sizeLimit() {
  return NextResponse.json(
    { error: "File exceeds 10 MB limit" },
    { status: 413 },
  );
}

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
  if (invalidId(resultId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
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
      kind: a.kind,
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
  if (invalidId(resultId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const declared = Number(request.headers.get("content-length") ?? "");
  // Multipart framing sits on top of the file. Only reject here when the
  // request is clearly over the file cap; proxy truncation is caught below.
  if (
    Number.isFinite(declared) &&
    declared > ATTACHMENT_MAX_BYTES + 64 * 1024
  ) {
    return sizeLimit();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return sizeLimit();
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return sizeLimit();
  }

  try {
    const stored = await storeAttachmentFile(file);
    const kindField = form.get("kind");
    const kind =
      typeof kindField === "string" && isAttachmentKind(kindField)
        ? kindField
        : inferAttachmentKind(stored.filename, stored.contentType);
    const [row] = await db
      .insert(attachments)
      .values({
        resultId,
        kind,
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
          kind: row.kind,
          url: `/api/attachments/${row.id}`,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (/exceeds/i.test(message)) return sizeLimit();
    if (/Failed query|PostgresError|password_hash/i.test(message)) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
