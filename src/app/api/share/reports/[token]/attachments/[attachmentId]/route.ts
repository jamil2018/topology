import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { readAttachmentFile } from "@/lib/attachments";
import { isReportShareActive } from "@/lib/tcm/report-share";
import { verifyShareToken } from "@/lib/tcm/share-token";
import {
  downloadHeaders,
  storageKeyStaysInRoot,
} from "@/app/api/attachments/safe-download";
import { attachmentBelongsToSharedRun } from "../shared-attachment-access";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ token: string; attachmentId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { token, attachmentId } = await params;
  const verified = verifyShareToken(decodeURIComponent(token));
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 403 });
  }
  if (verified.payload.kind !== "run") {
    return NextResponse.json({ error: "Not a run report" }, { status: 400 });
  }
  if (!(await isReportShareActive(verified.payload))) {
    return NextResponse.json({ error: "Share link revoked" }, { status: 403 });
  }

  if (!z.string().uuid().safeParse(attachmentId).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
    with: { result: { with: { run: true } } },
  });

  if (!attachmentBelongsToSharedRun(row, verified.payload)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!row || !storageKeyStaysInRoot(row.storageKey)) {
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
