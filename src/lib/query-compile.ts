/**
 * Compile a QualityQuery AST into a safe, inspectable plan and execute it
 * with Drizzle (parameterized predicates — no string-concat of user values).
 */

import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  not,
  notExists,
  or,
  sql,
  type Column,
  type SQL,
} from "drizzle-orm";
import type {
  QualityQuery,
  QueryEntity,
  QueryFilter,
  QueryScalar,
  QuerySort,
} from "@topology/domain";
import { db } from "@/db";
import {
  components,
  qualityEdges,
  requirements,
  risks,
  runResults,
  runs,
  testImplementations,
  testIntents,
} from "@/db/schema";

const DEFAULT_LIMIT = 200;

/** Drizzle column reference used in predicates (typed loosely for cross-table helpers). */
type Col = Column;

export type CompiledColumnFilter = {
  kind: "column";
  table: string;
  column: string;
  op: "eq" | "neq" | "in" | "exists";
  value?: QueryScalar | QueryScalar[];
  exists?: boolean;
};

export type CompiledEdgeFilter = {
  kind: "edge";
  /** Graph node type of the primary row (singular). */
  fromType: "intent" | "requirement" | "implementation";
  toType: "component" | "risk" | "requirement" | "intent";
  relation: "belongs_to" | "mitigates" | "covers";
  /** Match related entity by key (and title for components). */
  match: "key";
  /** Edge direction relative to the primary entity. */
  direction: "outgoing" | "incoming";
  op: "eq" | "neq" | "in" | "exists";
  value?: QueryScalar | QueryScalar[];
  exists?: boolean;
};

export type CompiledVirtualFilter = {
  kind: "virtual";
  name: "automated";
  op: "eq" | "neq";
  value: boolean;
};

/** Join-column filter (executions → runs). */
export type CompiledJoinFilter = {
  kind: "join";
  table: "runs";
  column: string;
  op: "eq" | "neq" | "in" | "exists";
  value?: QueryScalar | QueryScalar[];
  exists?: boolean;
};

export type CompiledFilter =
  | CompiledColumnFilter
  | CompiledEdgeFilter
  | CompiledVirtualFilter
  | CompiledJoinFilter;

export type CompiledSort = {
  table: string;
  column: string;
  direction: "asc" | "desc";
};

export type QueryPlan = {
  entity: QueryEntity;
  filters: CompiledFilter[];
  sort: CompiledSort[];
  limit: number;
};

export type CompileIssue = { path: string; message: string };

export type CompileResult =
  | { ok: true; plan: QueryPlan }
  | { ok: false; error: string; issues: CompileIssue[] };

type ColumnSpec = { table: string; column: string };

/** Allowed direct columns per entity (field name → column). */
const INTENT_COLUMNS: Record<string, ColumnSpec> = {
  id: { table: "test_intents", column: "id" },
  key: { table: "test_intents", column: "key" },
  title: { table: "test_intents", column: "title" },
  behavior: { table: "test_intents", column: "behavior" },
  criticality: { table: "test_intents", column: "criticality" },
  status: { table: "test_intents", column: "status" },
  folderId: { table: "test_intents", column: "folder_id" },
  assigneeId: { table: "test_intents", column: "assignee_id" },
};

const REQUIREMENT_COLUMNS: Record<string, ColumnSpec> = {
  id: { table: "requirements", column: "id" },
  key: { table: "requirements", column: "key" },
  title: { table: "requirements", column: "title" },
  description: { table: "requirements", column: "description" },
  criticality: { table: "requirements", column: "criticality" },
};

const IMPLEMENTATION_COLUMNS: Record<string, ColumnSpec> = {
  id: { table: "test_implementations", column: "id" },
  intentId: { table: "test_implementations", column: "intent_id" },
  type: { table: "test_implementations", column: "type" },
  caseId: { table: "test_implementations", column: "case_id" },
  sourcePath: { table: "test_implementations", column: "source_path" },
  externalKey: { table: "test_implementations", column: "external_key" },
  framework: { table: "test_implementations", column: "framework" },
};

const EXECUTION_COLUMNS: Record<string, ColumnSpec> = {
  id: { table: "run_results", column: "id" },
  runId: { table: "run_results", column: "run_id" },
  caseId: { table: "run_results", column: "case_id" },
  implementationId: { table: "run_results", column: "implementation_id" },
  status: { table: "run_results", column: "status" },
  externalKey: { table: "run_results", column: "external_key" },
  classname: { table: "run_results", column: "classname" },
  title: { table: "run_results", column: "title" },
  durationMs: { table: "run_results", column: "duration_ms" },
};

const EXECUTION_JOIN_COLUMNS: Record<string, ColumnSpec> = {
  branch: { table: "runs", column: "branch" },
  commitSha: { table: "runs", column: "commit_sha" },
  environment: { table: "runs", column: "environment" },
};

function columnsFor(entity: QueryEntity): Record<string, ColumnSpec> {
  switch (entity) {
    case "intents":
      return INTENT_COLUMNS;
    case "requirements":
      return REQUIREMENT_COLUMNS;
    case "implementations":
      return IMPLEMENTATION_COLUMNS;
    case "executions":
      return EXECUTION_COLUMNS;
  }
}

function compileFilter(
  entity: QueryEntity,
  filter: QueryFilter,
  index: number,
  issues: CompileIssue[],
): CompiledFilter | null {
  const path = `filters[${index}]`;
  const field = filter.field;

  // Virtual: intents.automated
  if (entity === "intents" && field === "automated") {
    if (filter.op === "exists") {
      issues.push({
        path: `${path}.op`,
        message: "automated does not support exists; use = true/false",
      });
      return null;
    }
    if (filter.op === "in") {
      issues.push({
        path: `${path}.op`,
        message: "automated does not support in",
      });
      return null;
    }
    if (typeof filter.value !== "boolean") {
      issues.push({
        path: `${path}.value`,
        message: "automated requires a boolean value",
      });
      return null;
    }
    return {
      kind: "virtual",
      name: "automated",
      op: filter.op,
      value: filter.value,
    };
  }

  // Edge: component / risk / requirement (intents)
  if (entity === "intents" && field === "component") {
    return compileEdgeFilter(filter, path, issues, {
      fromType: "intent",
      toType: "component",
      relation: "belongs_to",
      direction: "outgoing",
    });
  }
  if (entity === "intents" && field === "risk") {
    return compileEdgeFilter(filter, path, issues, {
      fromType: "intent",
      toType: "risk",
      relation: "mitigates",
      direction: "outgoing",
    });
  }
  if (entity === "intents" && field === "requirement") {
    return compileEdgeFilter(filter, path, issues, {
      fromType: "intent",
      toType: "requirement",
      relation: "covers",
      direction: "incoming",
    });
  }

  // Edge: component on requirements (optional belongs_to if present)
  if (entity === "requirements" && field === "component") {
    return compileEdgeFilter(filter, path, issues, {
      fromType: "requirement",
      toType: "component",
      relation: "belongs_to",
      direction: "outgoing",
    });
  }

  // Executions: join fields on runs
  if (entity === "executions" && field in EXECUTION_JOIN_COLUMNS) {
    const col = EXECUTION_JOIN_COLUMNS[field]!;
    return compileJoinOrColumn("join", col, filter, path, issues);
  }

  const cols = columnsFor(entity);
  if (field in cols) {
    return compileJoinOrColumn("column", cols[field]!, filter, path, issues);
  }

  issues.push({
    path: `${path}.field`,
    message: `unknown field '${field}' for entity '${entity}'`,
  });
  return null;
}

function compileEdgeFilter(
  filter: QueryFilter,
  path: string,
  issues: CompileIssue[],
  edge: Pick<
    CompiledEdgeFilter,
    "fromType" | "toType" | "relation" | "direction"
  >,
): CompiledEdgeFilter | null {
  if (filter.op === "exists") {
    return {
      kind: "edge",
      ...edge,
      match: "key",
      op: "exists",
      exists: filter.exists,
    };
  }
  if (filter.op === "in") {
    if (!filter.values.every((v) => typeof v === "string" || typeof v === "number")) {
      issues.push({
        path: `${path}.values`,
        message: "edge match values must be strings or numbers",
      });
      return null;
    }
    return {
      kind: "edge",
      ...edge,
      match: "key",
      op: "in",
      value: filter.values,
    };
  }
  if (filter.value !== null && typeof filter.value === "boolean") {
    issues.push({
      path: `${path}.value`,
      message: "edge match value must be a string or number (entity key)",
    });
    return null;
  }
  return {
    kind: "edge",
    ...edge,
    match: "key",
    op: filter.op,
    value: filter.value,
  };
}

function compileJoinOrColumn(
  kind: "column" | "join",
  col: ColumnSpec,
  filter: QueryFilter,
  path: string,
  issues: CompileIssue[],
): CompiledColumnFilter | CompiledJoinFilter | null {
  void path;
  void issues;
  if (filter.op === "exists") {
    if (kind === "column") {
      return {
        kind: "column",
        table: col.table,
        column: col.column,
        op: "exists",
        exists: filter.exists,
      };
    }
    return {
      kind: "join",
      table: "runs",
      column: col.column,
      op: "exists",
      exists: filter.exists,
    };
  }
  if (filter.op === "in") {
    if (kind === "column") {
      return {
        kind: "column",
        table: col.table,
        column: col.column,
        op: "in",
        value: filter.values,
      };
    }
    return {
      kind: "join",
      table: "runs",
      column: col.column,
      op: "in",
      value: filter.values,
    };
  }
  if (kind === "column") {
    return {
      kind: "column",
      table: col.table,
      column: col.column,
      op: filter.op,
      value: filter.value,
    };
  }
  return {
    kind: "join",
    table: "runs",
    column: col.column,
    op: filter.op,
    value: filter.value,
  };
}

function compileSort(
  entity: QueryEntity,
  sort: QuerySort,
  index: number,
  issues: CompileIssue[],
): CompiledSort | null {
  const path = `sort[${index}]`;
  const cols = columnsFor(entity);
  const joinCols = entity === "executions" ? EXECUTION_JOIN_COLUMNS : {};
  const spec = cols[sort.field] ?? joinCols[sort.field];
  if (!spec) {
    issues.push({
      path: `${path}.field`,
      message: `unknown sort field '${sort.field}' for entity '${entity}'`,
    });
    return null;
  }
  return {
    table: spec.table,
    column: spec.column,
    direction: sort.direction,
  };
}

/**
 * Validate known fields and produce an inspectable query plan.
 * Does not touch the database.
 */
export function compileQualityQuery(
  query: QualityQuery,
  options?: { limit?: number },
): CompileResult {
  const issues: CompileIssue[] = [];
  const filters: CompiledFilter[] = [];

  query.filters.forEach((f, i) => {
    const compiled = compileFilter(query.entity, f, i, issues);
    if (compiled) filters.push(compiled);
  });

  const sort: CompiledSort[] = [];
  query.sort.forEach((s, i) => {
    const compiled = compileSort(query.entity, s, i, issues);
    if (compiled) sort.push(compiled);
  });

  if (issues.length > 0) {
    return {
      ok: false,
      error: issues.map((i) => i.message).join("; "),
      issues,
    };
  }

  const limit = options?.limit ?? DEFAULT_LIMIT;
  return {
    ok: true,
    plan: {
      entity: query.entity,
      filters,
      sort,
      limit: Math.min(Math.max(1, limit), 1000),
    },
  };
}

// ——— Execution (Drizzle) ———

function intentCol(name: string): Col {
  const map: Record<string, Col> = {
    id: testIntents.id,
    key: testIntents.key,
    title: testIntents.title,
    behavior: testIntents.behavior,
    criticality: testIntents.criticality,
    status: testIntents.status,
    folder_id: testIntents.folderId,
    assignee_id: testIntents.assigneeId,
  };
  return map[name]!;
}

function requirementCol(name: string): Col {
  const map: Record<string, Col> = {
    id: requirements.id,
    key: requirements.key,
    title: requirements.title,
    description: requirements.description,
    criticality: requirements.criticality,
  };
  return map[name]!;
}

function implementationCol(name: string): Col {
  const map: Record<string, Col> = {
    id: testImplementations.id,
    intent_id: testImplementations.intentId,
    type: testImplementations.type,
    case_id: testImplementations.caseId,
    source_path: testImplementations.sourcePath,
    external_key: testImplementations.externalKey,
    framework: testImplementations.framework,
  };
  return map[name]!;
}

function executionCol(name: string): Col {
  const map: Record<string, Col> = {
    id: runResults.id,
    run_id: runResults.runId,
    case_id: runResults.caseId,
    implementation_id: runResults.implementationId,
    status: runResults.status,
    external_key: runResults.externalKey,
    classname: runResults.classname,
    title: runResults.title,
    duration_ms: runResults.durationMs,
  };
  return map[name]!;
}

function runCol(name: string): Col {
  const map: Record<string, Col> = {
    branch: runs.branch,
    commit_sha: runs.commitSha,
    environment: runs.environment,
  };
  return map[name]!;
}

function resolveColumn(
  entity: QueryEntity,
  table: string,
  column: string,
): Col {
  if (table === "runs") return runCol(column);
  switch (entity) {
    case "intents":
      return intentCol(column);
    case "requirements":
      return requirementCol(column);
    case "implementations":
      return implementationCol(column);
    case "executions":
      return executionCol(column);
  }
}

function scalarAsString(value: QueryScalar): string {
  if (value === null) return "";
  return String(value);
}

function columnPredicate(
  col: Col,
  op: "eq" | "neq" | "in" | "exists",
  value?: QueryScalar | QueryScalar[],
  existsFlag?: boolean,
): SQL | undefined {
  if (op === "exists") {
    return existsFlag ? isNotNull(col) : isNull(col);
  }
  if (op === "in") {
    const values = value as QueryScalar[];
    const nonNull = values.filter((v) => v !== null) as (
      | string
      | number
      | boolean
    )[];
    if (nonNull.length === 0) {
      return sql`false`;
    }
    return inArray(col, nonNull);
  }
  if (value === null) {
    return op === "eq" ? isNull(col) : isNotNull(col);
  }
  return op === "eq" ? eq(col, value) : ne(col, value);
}

function keyMatchSql(
  keyCol: Col,
  titleCol: Col | null,
  value: QueryScalar,
): SQL {
  const raw = scalarAsString(value);
  const lower = raw.toLowerCase();
  if (titleCol) {
    return sql`(lower(${keyCol}) = ${lower} OR lower(${titleCol}) = ${lower})`;
  }
  return sql`lower(${keyCol}) = ${lower}`;
}

function keyInMatchSql(
  keyCol: Col,
  titleCol: Col | null,
  values: QueryScalar[],
): SQL {
  const parts = values.map((v) => keyMatchSql(keyCol, titleCol, v));
  if (parts.length === 1) return parts[0]!;
  return or(...parts)!;
}

function relatedTable(toType: CompiledEdgeFilter["toType"]) {
  switch (toType) {
    case "component":
      return components;
    case "risk":
      return risks;
    case "requirement":
      return requirements;
    case "intent":
      return testIntents;
  }
}

function edgeExistsSubquery(
  workspaceId: string,
  primaryIdCol: Col,
  filter: CompiledEdgeFilter,
  match?: { op: "eq" | "neq" | "in"; value: QueryScalar | QueryScalar[] },
): SQL {
  const related = relatedTable(filter.toType);
  const relatedKey = related.key;
  const relatedTitle = related.title;

  const matchPred =
    match === undefined
      ? undefined
      : match.op === "in"
        ? keyInMatchSql(
            relatedKey,
            relatedTitle,
            match.value as QueryScalar[],
          )
        : keyMatchSql(
            relatedKey,
            relatedTitle,
            match.value as QueryScalar,
          );

  // neq → NOT EXISTS edge matching that key (no link to that entity)
  const useNotExists = match?.op === "neq";

  if (filter.direction === "outgoing") {
    const conditions: SQL[] = [
      eq(qualityEdges.workspaceId, workspaceId),
      eq(qualityEdges.fromType, filter.fromType),
      eq(qualityEdges.fromId, primaryIdCol),
      eq(qualityEdges.toType, filter.toType),
      eq(qualityEdges.relation, filter.relation),
      eq(related.workspaceId, workspaceId),
    ];
    if (matchPred) conditions.push(matchPred);

    const subquery = db
      .select({ one: sql`1` })
      .from(qualityEdges)
      .innerJoin(related, eq(related.id, qualityEdges.toId))
      .where(and(...conditions));

    return useNotExists ? notExists(subquery) : exists(subquery);
  }

  // incoming: related → primary (e.g. requirement covers intent)
  const incoming: SQL[] = [
    eq(qualityEdges.workspaceId, workspaceId),
    eq(qualityEdges.toType, filter.fromType),
    eq(qualityEdges.toId, primaryIdCol),
    eq(qualityEdges.fromType, filter.toType),
    eq(qualityEdges.relation, filter.relation),
    eq(related.workspaceId, workspaceId),
  ];
  if (matchPred) incoming.push(matchPred);

  const subquery = db
    .select({ one: sql`1` })
    .from(qualityEdges)
    .innerJoin(related, eq(related.id, qualityEdges.fromId))
    .where(and(...incoming));

  return useNotExists ? notExists(subquery) : exists(subquery);
}

function planFilterToSql(
  workspaceId: string,
  entity: QueryEntity,
  primaryIdCol: Col,
  filter: CompiledFilter,
): SQL | undefined {
  if (filter.kind === "column") {
    const col = resolveColumn(entity, filter.table, filter.column);
    return columnPredicate(col, filter.op, filter.value, filter.exists);
  }

  if (filter.kind === "join") {
    const col = runCol(filter.column);
    return columnPredicate(col, filter.op, filter.value, filter.exists);
  }

  if (filter.kind === "virtual" && filter.name === "automated") {
    const wantAutomated =
      filter.op === "eq" ? filter.value : !filter.value;
    const sub = exists(
      db
        .select({ one: sql`1` })
        .from(testImplementations)
        .where(
          and(
            eq(testImplementations.workspaceId, workspaceId),
            eq(testImplementations.intentId, primaryIdCol),
            ne(testImplementations.type, "manual"),
          ),
        ),
    );
    return wantAutomated ? sub : not(sub);
  }

  if (filter.kind === "edge") {
    if (filter.op === "exists") {
      const sub = edgeExistsSubquery(workspaceId, primaryIdCol, filter);
      return filter.exists ? sub : not(sub);
    }
    if (filter.op === "in") {
      return edgeExistsSubquery(workspaceId, primaryIdCol, filter, {
        op: "in",
        value: filter.value as QueryScalar[],
      });
    }
    return edgeExistsSubquery(workspaceId, primaryIdCol, filter, {
      op: filter.op,
      value: filter.value as QueryScalar,
    });
  }

  return undefined;
}

function orderExprs(
  entity: QueryEntity,
  sort: CompiledSort[],
): SQL[] {
  if (sort.length === 0) {
    switch (entity) {
      case "intents":
        return [asc(testIntents.key)];
      case "requirements":
        return [asc(requirements.key)];
      case "implementations":
        return [desc(testImplementations.updatedAt)];
      case "executions":
        return [desc(runResults.createdAt)];
    }
  }
  return sort.map((s) => {
    const col = resolveColumn(entity, s.table, s.column);
    return s.direction === "desc" ? desc(col) : asc(col);
  });
}

export type QueryExecuteResult = {
  entity: QueryEntity;
  plan: QueryPlan;
  rows: Record<string, unknown>[];
};

/**
 * Compile (if needed) and execute a quality query scoped to a workspace.
 */
export async function executeQualityQuery(
  workspaceId: string,
  query: QualityQuery,
  options?: { limit?: number },
): Promise<
  | { ok: true; result: QueryExecuteResult }
  | { ok: false; error: string; issues: CompileIssue[] }
> {
  const compiled = compileQualityQuery(query, options);
  if (!compiled.ok) return compiled;

  const { plan } = compiled;
  const rows = await runPlan(workspaceId, plan);
  return {
    ok: true,
    result: { entity: plan.entity, plan, rows },
  };
}

async function runPlan(
  workspaceId: string,
  plan: QueryPlan,
): Promise<Record<string, unknown>[]> {
  const { entity, filters, sort, limit } = plan;

  if (entity === "intents") {
    const preds: SQL[] = [eq(testIntents.workspaceId, workspaceId)];
    for (const f of filters) {
      const p = planFilterToSql(workspaceId, entity, testIntents.id, f);
      if (p) preds.push(p);
    }
    const rows = await db
      .select()
      .from(testIntents)
      .where(and(...preds))
      .orderBy(...orderExprs(entity, sort))
      .limit(limit);
    return rows as unknown as Record<string, unknown>[];
  }

  if (entity === "requirements") {
    const preds: SQL[] = [eq(requirements.workspaceId, workspaceId)];
    for (const f of filters) {
      const p = planFilterToSql(workspaceId, entity, requirements.id, f);
      if (p) preds.push(p);
    }
    const rows = await db
      .select()
      .from(requirements)
      .where(and(...preds))
      .orderBy(...orderExprs(entity, sort))
      .limit(limit);
    return rows as unknown as Record<string, unknown>[];
  }

  if (entity === "implementations") {
    const preds: SQL[] = [eq(testImplementations.workspaceId, workspaceId)];
    for (const f of filters) {
      const p = planFilterToSql(
        workspaceId,
        entity,
        testImplementations.id,
        f,
      );
      if (p) preds.push(p);
    }
    const rows = await db
      .select()
      .from(testImplementations)
      .where(and(...preds))
      .orderBy(...orderExprs(entity, sort))
      .limit(limit);
    return rows as unknown as Record<string, unknown>[];
  }

  // executions ≈ run_results joined to runs for workspace scope + join filters
  const preds: SQL[] = [eq(runs.workspaceId, workspaceId)];
  for (const f of filters) {
    const p = planFilterToSql(workspaceId, entity, runResults.id, f);
    if (p) preds.push(p);
  }
  const rows = await db
    .select({
      id: runResults.id,
      runId: runResults.runId,
      caseId: runResults.caseId,
      implementationId: runResults.implementationId,
      status: runResults.status,
      externalKey: runResults.externalKey,
      classname: runResults.classname,
      title: runResults.title,
      notes: runResults.notes,
      durationMs: runResults.durationMs,
      createdAt: runResults.createdAt,
      executedAt: runResults.executedAt,
      branch: runs.branch,
      commitSha: runs.commitSha,
      environment: runs.environment,
      runName: runs.name,
    })
    .from(runResults)
    .innerJoin(runs, eq(runs.id, runResults.runId))
    .where(and(...preds))
    .orderBy(...orderExprs(entity, sort))
    .limit(limit);
  return rows as unknown as Record<string, unknown>[];
}

/** Known field names per entity — useful for docs / errors. */
export function knownFieldsFor(entity: QueryEntity): string[] {
  const cols = Object.keys(columnsFor(entity));
  if (entity === "intents") {
    return [...cols, "component", "risk", "requirement", "automated"];
  }
  if (entity === "requirements") {
    return [...cols, "component"];
  }
  if (entity === "executions") {
    return [...cols, ...Object.keys(EXECUTION_JOIN_COLUMNS)];
  }
  return cols;
}
