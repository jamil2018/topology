import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { authenticateApiToken } from "@/lib/api-auth";
import { readAttachmentFile } from "@/lib/attachments";
import { requireProjectAccess } from "@/lib/project";
import { downloadHeaders, storageKeyStaysInRoot } from "../safe-download";

type Params = { params: Promise<{ id: string }> };

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

export async function GET(request: Request, { params }: Params) {
  let projectId: string;
  if (request.headers.has("authorization")) {
    const token = await authenticateApiToken(request);
    if (!token.ok) return NextResponse.json({ error: token.error }, { status: token.status });
    if (!token.scopes.includes("agent-read")) {
      return NextResponse.json({ error: "Token scope insufficient", code: "CAPABILITY_REQUIRED" }, { status: 403 });
    }
    projectId = token.workspaceId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireProjectAccess(session.user.id, { request });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    projectId = access.ctx.project.id;
  }

  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
    with: { result: { with: { run: true } } },
  });
  if (!row || row.result?.run?.workspaceId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!storageKeyStaysInRoot(row.storageKey)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readAttachmentFile(row.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: downloadHeaders(row.filename, row.contentType, buffer.length),
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
