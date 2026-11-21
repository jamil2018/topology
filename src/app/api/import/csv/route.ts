import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  customFieldDefs,
  customFieldValues,
} from "@/db/schema";
import { parseCasesCsv, serializeCasesCsv } from "@/lib/csv";
import { persistCsvCases } from "@/lib/import/csv-import";
import {
  getMembershipForProject,
  readPreferredProjectId,
  requireProjectAccess,
} from "@/lib/project";
import { recordAuditEvent } from "@/lib/audit";
import { listCases } from "@/lib/queries";

/**
 * `requireProjectAccess` uses `pickAccessibleProject` in `src/lib/project.ts`,
 * which is shared and falls back to the first accessible project when the
 * preferred id is not a membership. This route rejects that case itself so
 * import/export cannot silently read or write another project.
 */
async function rejectUnknownProject(userId: string, request: Request) {
  const preferred = await readPreferredProjectId(request);
  if (!preferred) return null;
  if (!z.string().uuid().safeParse(preferred).success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  const membership = await getMembershipForProject(userId, preferred);
  if (!membership?.workspace) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return null;
}

function parseDryRunFlag(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unknownProject = await rejectUnknownProject(session.user.id, request);
  if (unknownProject) return unknownProject;

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspaceId = access.ctx.project.id;
  const [data, fieldDefs] = await Promise.all([
    listCases(workspaceId),
    db.query.customFieldDefs.findMany({
      where: and(
        eq(customFieldDefs.workspaceId, workspaceId),
        eq(customFieldDefs.entity, "case"),
      ),
      orderBy: [asc(customFieldDefs.position), asc(customFieldDefs.key)],
    }),
  ]);
  const customFieldKeys = fieldDefs.map((d) => d.key);
  const valuesByCase = new Map<string, Record<string, string>>();
  if (fieldDefs.length > 0 && data.length > 0) {
    const valueRows = await db.query.customFieldValues.findMany({
      where: and(
        eq(customFieldValues.entityType, "case"),
        inArray(
          customFieldValues.entityId,
          data.map((c) => c.id),
        ),
        inArray(
          customFieldValues.fieldId,
          fieldDefs.map((d) => d.id),
        ),
      ),
    });
    const defById = new Map(fieldDefs.map((d) => [d.id, d]));
    for (const row of valueRows) {
      const def = defById.get(row.fieldId);
      if (!def) continue;
      let parsed: unknown = row.valueJson;
      try {
        parsed = JSON.parse(row.valueJson);
      } catch {
        /* keep raw */
      }
      const bucket = valuesByCase.get(row.entityId) ?? {};
      bucket[def.key] =
        typeof parsed === "string" ||
        typeof parsed === "number" ||
        typeof parsed === "boolean"
          ? String(parsed)
          : row.valueJson;
      valuesByCase.set(row.entityId, bucket);
    }
  }
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
      tags: c.tags ?? [],
      customFields: valuesByCase.get(c.id),
    })),
    { customFieldKeys },
  );

  await recordAuditEvent({
    action: "export.cases",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId: access.ctx.project.id,
    targetType: "cases",
    request,
    metadata: { count: data.length },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="topology-cases.csv"',
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unknownProject = await rejectUnknownProject(session.user.id, request);
  if (unknownProject) return unknownProject;

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const contentType = request.headers.get("content-type") ?? "";
  let raw = "";
  let dryRun = false;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Upload exceeds the size limit or could not be parsed" },
        { status: 413 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    raw = await file.text();
    dryRun = parseDryRunFlag(form.get("dryRun"));
  } else {
    let body: { csv?: unknown; dryRun?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    raw = typeof body?.csv === "string" ? body.csv : "";
    dryRun = parseDryRunFlag(body?.dryRun);
  }

  const fieldDefs = await db.query.customFieldDefs.findMany({
    where: and(
      eq(customFieldDefs.workspaceId, workspaceId),
      eq(customFieldDefs.entity, "case"),
    ),
  });
  const customFieldKeys = fieldDefs.map((d) => d.key);
  const { rows, errors } = parseCasesCsv(raw, { customFieldKeys });
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows", details: errors, dryRun },
      { status: 400 },
    );
  }

  const result = await persistCsvCases({
    workspaceId,
    actorId: session.user.id,
    rows,
    dryRun,
  });

  if (!dryRun) {
    await recordAuditEvent({
      action: "import.cases",
      actorId: session.user.id,
      actorEmail: session.user.email,
      workspaceId,
      targetType: "cases",
      request,
      metadata: {
        created: result.created.length,
        skipped: result.skipped.length,
        folderIds: result.folderIds,
      },
    });
  }

  return NextResponse.json({
    dryRun,
    created: result.created.length,
    skipped: result.skipped,
    wouldCreate: result.wouldCreate,
    wouldSkip: result.wouldSkip,
    errors,
    sample: result.sample,
    customFieldKeys,
    folderIds: result.folderIds,
    primaryFolderId: result.primaryFolderId,
    cases: dryRun ? [] : result.created,
  });
}
