import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { readAttachmentFile } from "@/lib/attachments";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readAttachmentFile(row.storageKey);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": row.contentType,
        "Content-Disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}
