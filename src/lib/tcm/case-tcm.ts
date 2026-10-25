import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import {
  caseDatasetRows,
  caseParameters,
  caseSteps,
  caseVersions,
  cases,
  customFieldDefs,
  customFieldValues,
  sharedSteps,
} from "@/db/schema";
import { recordCaseActivity } from "@/lib/case-activity";
import {
  applyParametersToSteps,
  expandSharedSteps,
  orderSteps,
  parseFallbackSteps,
  projectStepsToText,
  type OrderedStep,
  type StepInput,
} from "@/lib/tcm/steps";
import { fanOutIterations } from "@/lib/tcm/iterations";
import {
  parseCaseSnapshot,
  restoreCasePatch,
  type CaseVersionSnapshot,
} from "@/lib/tcm/versions";
import { validateFieldValues, type CustomFieldDef } from "@/lib/tcm/custom-fields";

export type CaseTcmPayload = {
  structuredSteps: OrderedStep[];
  parameters: Array<{
    id: string;
    name: string;
    defaultValue: string;
    position: number;
  }>;
  datasets: Array<{
    id: string;
    position: number;
    values: Record<string, string>;
  }>;
  customFields: Record<string, unknown>;
};

function parseValuesJson(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value == null ? "" : String(value);
    }
    return values;
  } catch {
    return {};
  }
}

export async function loadCaseTcm(
  workspaceId: string,
  caseId: string,
): Promise<CaseTcmPayload> {
  const [steps, parameters, datasets, defs] = await Promise.all([
    db.query.caseSteps.findMany({
      where: eq(caseSteps.caseId, caseId),
      orderBy: [asc(caseSteps.position)],
    }),
    db.query.caseParameters.findMany({
      where: eq(caseParameters.caseId, caseId),
      orderBy: [asc(caseParameters.position)],
    }),
    db.query.caseDatasetRows.findMany({
      where: eq(caseDatasetRows.caseId, caseId),
      orderBy: [asc(caseDatasetRows.position)],
    }),
    db.query.customFieldDefs.findMany({
      where: and(
        eq(customFieldDefs.workspaceId, workspaceId),
        eq(customFieldDefs.entity, "case"),
      ),
      orderBy: [asc(customFieldDefs.position)],
    }),
  ]);

  const values =
    defs.length === 0
      ? []
      : await db.query.customFieldValues.findMany({
          where: and(
            eq(customFieldValues.entityType, "case"),
            eq(customFieldValues.entityId, caseId),
            inArray(
              customFieldValues.fieldId,
              defs.map((d) => d.id),
            ),
          ),
        });
  const valueByField = new Map(values.map((v) => [v.fieldId, v.valueJson]));
  const customFields: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = valueByField.get(def.id);
    if (raw == null) continue;
    try {
      customFields[def.key] = JSON.parse(raw);
    } catch {
      customFields[def.key] = raw;
    }
  }

  return {
    structuredSteps: steps.map((s) => ({
      id: s.id,
      position: s.position,
      action: s.action,
      expected: s.expected,
      data: s.data,
      sharedStepId: s.sharedStepId,
    })),
    parameters: parameters.map((p) => ({
      id: p.id,
      name: p.name,
      defaultValue: p.defaultValue,
      position: p.position,
    })),
    datasets: datasets.map((row) => ({
      id: row.id,
      position: row.position,
      values: parseValuesJson(row.valuesJson),
    })),
    customFields,
  };
}

export async function replaceCaseSteps(input: {
  workspaceId: string;
  caseId: string;
  steps: readonly StepInput[];
}): Promise<OrderedStep[]> {
  const ordered = orderSteps(input.steps);
  await db.delete(caseSteps).where(eq(caseSteps.caseId, input.caseId));
  if (ordered.length > 0) {
    await db.insert(caseSteps).values(
      ordered.map((step) => ({
        caseId: input.caseId,
        workspaceId: input.workspaceId,
        position: step.position,
        action: step.action,
        expected: step.expected,
        data: step.data,
        sharedStepId: step.sharedStepId,
      })),
    );
  }
  const projected = projectStepsToText(ordered);
  await db
    .update(cases)
    .set({
      steps: projected.steps,
      expectedResult: projected.expectedResult,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.id, input.caseId), eq(cases.workspaceId, input.workspaceId)));
  const saved = await db.query.caseSteps.findMany({
    where: eq(caseSteps.caseId, input.caseId),
    orderBy: [asc(caseSteps.position)],
  });
  return saved.map((s) => ({
    id: s.id,
    position: s.position,
    action: s.action,
    expected: s.expected,
    data: s.data,
    sharedStepId: s.sharedStepId,
  }));
}

export async function replaceCaseParameters(input: {
  caseId: string;
  parameters: readonly { name: string; defaultValue?: string }[];
  datasets?: readonly { values: Record<string, string> }[];
}) {
  await db.delete(caseParameters).where(eq(caseParameters.caseId, input.caseId));
  const params = input.parameters
    .map((p) => ({ name: p.name.trim(), defaultValue: (p.defaultValue ?? "").trim() }))
    .filter((p) => p.name);
  if (params.length > 0) {
    await db.insert(caseParameters).values(
      params.map((p, position) => ({
        caseId: input.caseId,
        name: p.name,
        defaultValue: p.defaultValue,
        position,
      })),
    );
  }
  if (input.datasets) {
    await db.delete(caseDatasetRows).where(eq(caseDatasetRows.caseId, input.caseId));
    const rows = input.datasets.filter((row) => Object.keys(row.values ?? {}).length > 0);
    if (rows.length > 0) {
      await db.insert(caseDatasetRows).values(
        rows.map((row, position) => ({
          caseId: input.caseId,
          position,
          valuesJson: JSON.stringify(row.values),
        })),
      );
    }
  }
}

export async function upsertCustomFieldValues(input: {
  workspaceId: string;
  entityType: "case" | "result";
  entityId: string;
  values: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const defs = await db.query.customFieldDefs.findMany({
    where: and(
      eq(customFieldDefs.workspaceId, input.workspaceId),
      eq(customFieldDefs.entity, input.entityType),
    ),
  });
  const mapped: CustomFieldDef[] = defs.map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.optionsJson ? (JSON.parse(d.optionsJson) as string[]) : [],
    required: d.required,
  }));
  const checked = validateFieldValues(mapped, input.values);
  if (!checked.ok) {
    return { ok: false, error: checked.errors[0]?.message ?? "Invalid custom fields" };
  }
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, value] of Object.entries(checked.normalized)) {
    const def = defByKey.get(key);
    if (!def) continue;
    await db
      .insert(customFieldValues)
      .values({
        fieldId: def.id,
        entityType: input.entityType,
        entityId: input.entityId,
        valueJson: JSON.stringify(value),
      })
      .onConflictDoUpdate({
        target: [
          customFieldValues.fieldId,
          customFieldValues.entityType,
          customFieldValues.entityId,
        ],
        set: { valueJson: JSON.stringify(value) },
      });
  }
  return { ok: true };
}

export async function buildCaseVersionSnapshot(
  workspaceId: string,
  caseId: string,
): Promise<CaseVersionSnapshot | null> {
  const row = await db.query.cases.findFirst({
    where: and(eq(cases.id, caseId), eq(cases.workspaceId, workspaceId)),
  });
  if (!row) return null;
  const tcm = await loadCaseTcm(workspaceId, caseId);
  return {
    title: row.title,
    description: row.description,
    preconditions: row.preconditions,
    steps: row.steps,
    expectedResult: row.expectedResult,
    priority: row.priority,
    status: row.status,
    tags: row.tags ?? [],
    folderId: row.folderId,
    structuredSteps: tcm.structuredSteps,
    parameters: tcm.parameters.map((p) => ({
      name: p.name,
      defaultValue: p.defaultValue,
      position: p.position,
    })),
    datasets: tcm.datasets.map((d) => ({
      position: d.position,
      values: d.values,
    })),
    customFields: tcm.customFields,
  };
}

export async function snapshotCaseVersion(input: {
  workspaceId: string;
  caseId: string;
  actorId?: string | null;
  summary?: string;
}): Promise<typeof caseVersions.$inferSelect | null> {
  const snapshot = await buildCaseVersionSnapshot(input.workspaceId, input.caseId);
  if (!snapshot) return null;
  const [latest] = await db
    .select({ version: max(caseVersions.version) })
    .from(caseVersions)
    .where(eq(caseVersions.caseId, input.caseId));
  const version = (latest?.version ?? 0) + 1;
  const activity = await recordCaseActivity({
    caseId: input.caseId,
    actorId: input.actorId,
    action: "versioned",
    field: "version",
    fromValue: version === 1 ? null : version - 1,
    toValue: version,
    summary: input.summary ?? `Snapshot v${version}`,
  });
  const [row] = await db
    .insert(caseVersions)
    .values({
      caseId: input.caseId,
      workspaceId: input.workspaceId,
      version,
      snapshotJson: JSON.stringify(snapshot),
      activityId: activity.id,
      createdById: input.actorId ?? null,
    })
    .returning();
  return row;
}

export async function restoreCaseVersion(input: {
  workspaceId: string;
  caseId: string;
  versionId: string;
  actorId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const version = await db.query.caseVersions.findFirst({
    where: and(
      eq(caseVersions.id, input.versionId),
      eq(caseVersions.caseId, input.caseId),
      eq(caseVersions.workspaceId, input.workspaceId),
    ),
  });
  if (!version) return { ok: false, error: "Version not found", status: 404 };
  const snapshot = parseCaseSnapshot(version.snapshotJson);
  const patch = restoreCasePatch(snapshot);
  await db
    .update(cases)
    .set({
      title: patch.title,
      description: patch.description,
      preconditions: patch.preconditions,
      steps: patch.steps,
      expectedResult: patch.expectedResult,
      priority: patch.priority as "P0" | "P1" | "P2" | "P3",
      status: patch.status as "draft" | "ready" | "blocked" | "deprecated",
      tags: patch.tags,
      folderId: patch.folderId,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.id, input.caseId), eq(cases.workspaceId, input.workspaceId)));
  await replaceCaseSteps({
    workspaceId: input.workspaceId,
    caseId: input.caseId,
    steps: snapshot.structuredSteps,
  });
  await replaceCaseParameters({
    caseId: input.caseId,
    parameters: snapshot.parameters,
    datasets: snapshot.datasets,
  });
  if (Object.keys(snapshot.customFields).length > 0) {
    await upsertCustomFieldValues({
      workspaceId: input.workspaceId,
      entityType: "case",
      entityId: input.caseId,
      values: snapshot.customFields,
    });
  }
  await snapshotCaseVersion({
    workspaceId: input.workspaceId,
    caseId: input.caseId,
    actorId: input.actorId,
    summary: `Restored v${version.version}`,
  });
  return { ok: true };
}

export async function executableStepsForCase(input: {
  workspaceId: string;
  caseId: string;
  values?: Record<string, string>;
}): Promise<OrderedStep[]> {
  const row = await db.query.cases.findFirst({
    where: and(eq(cases.id, input.caseId), eq(cases.workspaceId, input.workspaceId)),
  });
  if (!row) return [];
  const stored = await db.query.caseSteps.findMany({
    where: eq(caseSteps.caseId, input.caseId),
    orderBy: [asc(caseSteps.position)],
  });
  const ordered: OrderedStep[] =
    stored.length > 0
      ? stored.map((s) => ({
          id: s.id,
          position: s.position,
          action: s.action,
          expected: s.expected,
          data: s.data,
          sharedStepId: s.sharedStepId,
        }))
      : parseFallbackSteps(row.steps, row.expectedResult);

  const sharedIds = [
    ...new Set(ordered.map((s) => s.sharedStepId).filter(Boolean) as string[]),
  ];
  const sharedById = new Map<string, { action: string; expected: string; data: string; position: number }[]>();
  if (sharedIds.length > 0) {
    const blocks = await db.query.sharedSteps.findMany({
      where: and(
        eq(sharedSteps.workspaceId, input.workspaceId),
        inArray(sharedSteps.id, sharedIds),
      ),
      with: { items: true },
    });
    for (const block of blocks) {
      sharedById.set(
        block.id,
        [...block.items]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            position: item.position,
            action: item.action,
            expected: item.expected,
            data: item.data,
          })),
      );
    }
  }
  const expanded = expandSharedSteps(ordered, sharedById);
  return applyParametersToSteps(expanded, input.values ?? {});
}

export async function loadCaseIterations(caseId: string) {
  const [parameters, datasets] = await Promise.all([
    db.query.caseParameters.findMany({
      where: eq(caseParameters.caseId, caseId),
    }),
    db.query.caseDatasetRows.findMany({
      where: eq(caseDatasetRows.caseId, caseId),
      orderBy: [asc(caseDatasetRows.position)],
    }),
  ]);
  const defaults: Record<string, string> = {};
  for (const p of parameters) defaults[p.name] = p.defaultValue;
  const iterations = fanOutIterations(
    datasets.map((row) => ({
      position: row.position,
      values: { ...defaults, ...parseValuesJson(row.valuesJson) },
    })),
  );
  if (iterations.length === 1 && Object.keys(iterations[0]!.values).length === 0) {
    return [{ index: 0, values: defaults, label: "" }];
  }
  return iterations.map((it) => ({
    ...it,
    values: { ...defaults, ...it.values },
  }));
}

export async function listCaseVersions(caseId: string) {
  return db.query.caseVersions.findMany({
    where: eq(caseVersions.caseId, caseId),
    orderBy: [desc(caseVersions.version)],
  });
}
