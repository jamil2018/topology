import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { projectKeyPrefix } from "@/components/cases-model";
import { db } from "@/db";
import {
  caseDatasetRows,
  caseParameters,
  caseSteps,
  cases,
  customFieldDefs,
  customFieldValues,
  folders,
} from "@/db/schema";
import { recordCaseActivity } from "@/lib/case-activity";
import { caseWriteError } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import { replaceCaseSteps } from "@/lib/tcm/case-tcm";

type Params = { params: Promise<{ id: string }> };

const cloneSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
});

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

function copyTitle(title: string) {
  const suffix = " (Copy)";
  const max = 240;
  if (title.length + suffix.length <= max) return `${title}${suffix}`;
  return `${title.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

async function nextWorkspaceCaseKey(
  workspaceId: string,
  prefix: string,
  executor: Pick<typeof db, "select">,
) {
  const pattern = `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[0-9]+$`;
  const [sequence] = await executor
    .select({
      value: sql<string>`coalesce(max(substring(${cases.key} from '[0-9]+$')::numeric), 0)`,
    })
    .from(cases)
    .where(
      and(eq(cases.workspaceId, workspaceId), sql`${cases.key} ~ ${pattern}`),
    );
  return `${prefix}-${BigInt(sequence?.value ?? "0") + BigInt(1)}`;
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = cloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const source = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)),
  });
  if (!source) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const targetFolderId =
    parsed.data.folderId !== undefined
      ? parsed.data.folderId
      : source.folderId;

  if (targetFolderId) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, targetFolderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  const prefix = projectKeyPrefix(access.ctx.project.slug);

  try {
    const cloned = await db.transaction(async (tx) => {
      const key = await nextWorkspaceCaseKey(workspaceId, prefix, tx);
      const title = copyTitle(source.title);

      const [created] = await tx
        .insert(cases)
        .values({
          workspaceId,
          key,
          title,
          description: source.description,
          preconditions: source.preconditions,
          steps: source.steps,
          expectedResult: source.expectedResult,
          priority: source.priority,
          status: "draft",
          folderId: targetFolderId,
          tags: source.tags ?? [],
          assigneeId: source.assigneeId,
          createdById: session.user.id,
        })
        .returning();

      const steps = await tx.query.caseSteps.findMany({
        where: eq(caseSteps.caseId, source.id),
        orderBy: [asc(caseSteps.position)],
      });
      if (steps.length > 0) {
        await replaceCaseSteps(
          {
            workspaceId,
            caseId: created.id,
            steps: steps.map((step) => ({
              action: step.action,
              expected: step.expected,
              data: step.data,
              sharedStepId: step.sharedStepId,
            })),
          },
          tx,
        );
      }

      const parameters = await tx.query.caseParameters.findMany({
        where: eq(caseParameters.caseId, source.id),
        orderBy: [asc(caseParameters.position)],
      });
      if (parameters.length > 0) {
        await tx.insert(caseParameters).values(
          parameters.map((parameter) => ({
            caseId: created.id,
            name: parameter.name,
            defaultValue: parameter.defaultValue,
            position: parameter.position,
          })),
        );
      }

      const datasets = await tx.query.caseDatasetRows.findMany({
        where: eq(caseDatasetRows.caseId, source.id),
        orderBy: [asc(caseDatasetRows.position)],
      });
      if (datasets.length > 0) {
        await tx.insert(caseDatasetRows).values(
          datasets.map((row) => ({
            caseId: created.id,
            position: row.position,
            valuesJson: row.valuesJson,
          })),
        );
      }

      const defs = await tx.query.customFieldDefs.findMany({
        where: and(
          eq(customFieldDefs.workspaceId, workspaceId),
          eq(customFieldDefs.entity, "case"),
        ),
      });
      if (defs.length > 0) {
        const values = await tx.query.customFieldValues.findMany({
          where: and(
            eq(customFieldValues.entityType, "case"),
            eq(customFieldValues.entityId, source.id),
            inArray(
              customFieldValues.fieldId,
              defs.map((def) => def.id),
            ),
          ),
        });
        if (values.length > 0) {
          await tx.insert(customFieldValues).values(
            values.map((value) => ({
              fieldId: value.fieldId,
              entityType: "case",
              entityId: created.id,
              valueJson: value.valueJson,
            })),
          );
        }
      }

      const { ensureIntentForCase } = await import("@/lib/quality-graph");
      const { intentId } = await ensureIntentForCase(created, tx);
      await recordCaseActivity(
        {
          caseId: created.id,
          actorId: session.user.id,
          action: "created",
          summary: `Duplicated from ${source.key} as ${created.key}`,
          fromValue: source.key,
          toValue: created.key,
          field: "key",
        },
        tx,
      );

      const current = await tx.query.cases.findFirst({
        where: eq(cases.id, created.id),
        with: { folder: true, intent: true },
      });
      return { ...current!, intentId };
    });

    return NextResponse.json(
      {
        case: {
          id: cloned.id,
          key: cloned.key,
          title: cloned.title,
          description: cloned.description,
          preconditions: cloned.preconditions,
          steps: cloned.steps,
          expectedResult: cloned.expectedResult,
          priority: cloned.priority,
          status: cloned.status,
          tags: cloned.tags ?? [],
          folderId: cloned.folderId,
          intentId: cloned.intentId,
          intent: cloned.intent
            ? {
                id: cloned.intent.id,
                key: cloned.intent.key,
                title: cloned.intent.title,
              }
            : null,
          folder: cloned.folder
            ? { id: cloned.folder.id, name: cloned.folder.name }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const mapped = caseWriteError(err);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json(
      { error: "Failed to duplicate case" },
      { status: 500 },
    );
  }
}
