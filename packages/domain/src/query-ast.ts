/**
 * Quality Query AST (Phase 6 domain core).
 *
 * Structured queries over the quality graph. Domain owns the AST shape and
 * validation; SQL compilation lives in the app layer (Drizzle).
 */

export const queryEntities = [
  "intents",
  "requirements",
  "implementations",
  "executions",
] as const;

export type QueryEntity = (typeof queryEntities)[number];

export const queryFilterOps = ["eq", "neq", "in", "exists"] as const;

export type QueryFilterOp = (typeof queryFilterOps)[number];

/** Scalar literal used in equality / membership filters. */
export type QueryScalar = string | number | boolean | null;

export type QueryEqFilter = {
  op: "eq";
  field: string;
  value: QueryScalar;
};

export type QueryNeqFilter = {
  op: "neq";
  field: string;
  value: QueryScalar;
};

export type QueryInFilter = {
  op: "in";
  field: string;
  values: QueryScalar[];
};

/** `exists: true` → field is present / non-null; `false` → absent / null. */
export type QueryExistsFilter = {
  op: "exists";
  field: string;
  exists: boolean;
};

export type QueryFilter =
  | QueryEqFilter
  | QueryNeqFilter
  | QueryInFilter
  | QueryExistsFilter;

export const querySortDirections = ["asc", "desc"] as const;

export type QuerySortDirection = (typeof querySortDirections)[number];

export type QuerySort = {
  field: string;
  direction: QuerySortDirection;
};

/**
 * Canonical query tree. Filters are AND-combined (no OR in v1).
 * Empty `filters` / `sort` means unrestricted / default order.
 */
export type QualityQuery = {
  entity: QueryEntity;
  filters: QueryFilter[];
  sort: QuerySort[];
};

const ENTITY_SET = new Set<string>(queryEntities);
const SORT_DIR_SET = new Set<string>(querySortDirections);

/** Field path: `component`, `criticality`, `last_execution.release`, … */
const FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export type QueryValidationIssue = {
  path: string;
  message: string;
};

export type QueryValidationResult =
  | { ok: true; query: QualityQuery }
  | { ok: false; issues: QueryValidationIssue[] };

function isQueryScalar(value: unknown): value is QueryScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function validateField(
  field: unknown,
  path: string,
  issues: QueryValidationIssue[],
): field is string {
  if (typeof field !== "string" || field.length === 0) {
    issues.push({ path, message: "field must be a non-empty string" });
    return false;
  }
  if (!FIELD_RE.test(field)) {
    issues.push({
      path,
      message:
        "field must be an identifier path (e.g. criticality or last_execution.release)",
    });
    return false;
  }
  return true;
}

/**
 * Validate a QualityQuery (or unknown JSON) without compiling to SQL.
 * Used by the DSL parser and by callers that accept AST JSON directly.
 */
export function validateQualityQuery(input: unknown): QueryValidationResult {
  const issues: QueryValidationIssue[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: "", message: "query must be an object" }],
    };
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.entity !== "string" || !ENTITY_SET.has(raw.entity)) {
    issues.push({
      path: "entity",
      message: `entity must be one of: ${queryEntities.join(", ")}`,
    });
  }

  if (!Array.isArray(raw.filters)) {
    issues.push({ path: "filters", message: "filters must be an array" });
  } else {
    raw.filters.forEach((filter, i) => {
      const base = `filters[${i}]`;
      if (filter === null || typeof filter !== "object" || Array.isArray(filter)) {
        issues.push({ path: base, message: "filter must be an object" });
        return;
      }
      const f = filter as Record<string, unknown>;
      const op = f.op;
      if (op !== "eq" && op !== "neq" && op !== "in" && op !== "exists") {
        issues.push({
          path: `${base}.op`,
          message: `op must be one of: ${queryFilterOps.join(", ")}`,
        });
        return;
      }
      validateField(f.field, `${base}.field`, issues);

      if (op === "eq" || op === "neq") {
        if (!isQueryScalar(f.value)) {
          issues.push({
            path: `${base}.value`,
            message: "value must be string, number, boolean, or null",
          });
        } else if (typeof f.value === "number" && !Number.isFinite(f.value)) {
          issues.push({
            path: `${base}.value`,
            message: "numeric value must be finite",
          });
        }
      } else if (op === "in") {
        if (!Array.isArray(f.values)) {
          issues.push({
            path: `${base}.values`,
            message: "values must be an array",
          });
        } else if (f.values.length === 0) {
          issues.push({
            path: `${base}.values`,
            message: "values must be non-empty",
          });
        } else {
          f.values.forEach((v, j) => {
            if (!isQueryScalar(v)) {
              issues.push({
                path: `${base}.values[${j}]`,
                message: "value must be string, number, boolean, or null",
              });
            } else if (typeof v === "number" && !Number.isFinite(v)) {
              issues.push({
                path: `${base}.values[${j}]`,
                message: "numeric value must be finite",
              });
            }
          });
        }
      } else if (typeof f.exists !== "boolean") {
        issues.push({
          path: `${base}.exists`,
          message: "exists must be a boolean",
        });
      }
    });
  }

  if (!Array.isArray(raw.sort)) {
    issues.push({ path: "sort", message: "sort must be an array" });
  } else {
    raw.sort.forEach((entry, i) => {
      const base = `sort[${i}]`;
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        issues.push({ path: base, message: "sort entry must be an object" });
        return;
      }
      const s = entry as Record<string, unknown>;
      validateField(s.field, `${base}.field`, issues);
      if (typeof s.direction !== "string" || !SORT_DIR_SET.has(s.direction)) {
        issues.push({
          path: `${base}.direction`,
          message: `direction must be one of: ${querySortDirections.join(", ")}`,
        });
      }
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    query: {
      entity: raw.entity as QueryEntity,
      filters: raw.filters as QueryFilter[],
      sort: raw.sort as QuerySort[],
    },
  };
}

/** Narrow helper: returns true when `input` is a valid QualityQuery. */
export function isQualityQuery(input: unknown): input is QualityQuery {
  return validateQualityQuery(input).ok;
}
