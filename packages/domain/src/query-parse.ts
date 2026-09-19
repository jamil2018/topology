/**
 * Tiny Quality QL text DSL → {@link QualityQuery} AST.
 *
 * Grammar (v1, whitespace-insensitive except inside strings):
 *
 * ```
 * query      := entity [ "where" filter ] [ "order" "by" sort_list ]
 * entity     := "intents" | "requirements" | "implementations" | "executions"
 * filter     := condition ( "and" condition )*
 * condition  := field ("=" | "!=") value
 *             | field "in" "(" value ( "," value )* ")"
 *             | [ "not" ] "exists" field
 *             | field [ "not" ] "exists"
 * field      := IDENT ( "." IDENT )*
 * value      := STRING | NUMBER | BOOL | NULL | BARE
 * sort_list  := sort ( "," sort )*
 * sort       := field [ "asc" | "desc" ]   # default asc
 * ```
 *
 * STRING is double- or single-quoted with `\"` / `\'` / `\\` escapes.
 * BARE is an unquoted token (e.g. payments, P0, 4.7) kept as a string unless
 * it parses as a number / bool / null.
 *
 * Examples:
 * - `intents where component = "payments" and criticality = "P0"`
 * - `intents where component = payments and criticality = P0 order by key desc`
 * - `requirements where key in ("REQ-1", "REQ-2")`
 * - `executions where not exists release`
 * - `implementations where type = playwright and framework exists`
 */

import {
  queryEntities,
  validateQualityQuery,
  type QualityQuery,
  type QueryEntity,
  type QueryFilter,
  type QueryScalar,
  type QuerySort,
  type QueryValidationIssue,
} from "./query-ast";

export type QueryParseResult =
  | { ok: true; query: QualityQuery }
  | { ok: false; error: string; issues?: QueryValidationIssue[] };

type Token =
  | { kind: "ident"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "op"; value: "=" | "!=" }
  | { kind: "punct"; value: "(" | ")" | "," | "." }
  | { kind: "eof" };

const KEYWORDS = new Set([
  "where",
  "and",
  "order",
  "by",
  "asc",
  "desc",
  "in",
  "exists",
  "not",
  "true",
  "false",
  "null",
]);

const ENTITY_SET = new Set<string>(queryEntities);

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const peek = () => input[i] ?? "";
  const advance = () => input[i++] ?? "";

  while (i < input.length) {
    const c = peek();

    if (/\s/.test(c)) {
      advance();
      continue;
    }

    if (c === "=") {
      advance();
      tokens.push({ kind: "op", value: "=" });
      continue;
    }

    if (c === "!" && input[i + 1] === "=") {
      i += 2;
      tokens.push({ kind: "op", value: "!=" });
      continue;
    }

    if (c === "(" || c === ")" || c === "," || c === ".") {
      advance();
      tokens.push({ kind: "punct", value: c });
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = advance();
      let value = "";
      while (i < input.length) {
        const ch = advance();
        if (ch === quote) break;
        if (ch === "\\") {
          const esc = advance();
          if (esc === "") {
            throw new ParseError("unterminated string escape");
          }
          value += esc;
        } else {
          value += ch;
        }
      }
      if (input[i - 1] !== quote) {
        throw new ParseError("unterminated string literal");
      }
      tokens.push({ kind: "string", value });
      continue;
    }

    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      let raw = advance();
      while (/[0-9.]/.test(peek())) {
        raw += advance();
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new ParseError(`invalid number: ${raw}`);
      }
      tokens.push({ kind: "number", value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let raw = advance();
      while (/[a-zA-Z0-9_]/.test(peek())) {
        raw += advance();
      }
      tokens.push({ kind: "ident", value: raw });
      continue;
    }

    throw new ParseError(`unexpected character: ${c}`);
  }

  tokens.push({ kind: "eof" });
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private current(): Token {
    return this.tokens[this.pos] ?? { kind: "eof" };
  }

  private advance(): Token {
    const t = this.current();
    if (t.kind !== "eof") this.pos += 1;
    return t;
  }

  private expectIdent(value?: string): string {
    const t = this.current();
    if (t.kind !== "ident") {
      throw new ParseError(
        value
          ? `expected '${value}'`
          : "expected identifier",
      );
    }
    if (value !== undefined && t.value.toLowerCase() !== value.toLowerCase()) {
      throw new ParseError(`expected '${value}', got '${t.value}'`);
    }
    this.advance();
    return t.value;
  }

  private matchIdent(...values: string[]): string | null {
    const t = this.current();
    if (t.kind !== "ident") return null;
    const lower = t.value.toLowerCase();
    if (!values.some((v) => v.toLowerCase() === lower)) return null;
    this.advance();
    return t.value;
  }

  private matchOp(value: "=" | "!="): boolean {
    const t = this.current();
    if (t.kind === "op" && t.value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchPunct(value: "(" | ")" | "," | "."): boolean {
    const t = this.current();
    if (t.kind === "punct" && t.value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectPunct(value: "(" | ")" | "," | "."): void {
    if (!this.matchPunct(value)) {
      throw new ParseError(`expected '${value}'`);
    }
  }

  parse(): QualityQuery {
    const entityRaw = this.expectIdent();
    const entityLower = entityRaw.toLowerCase();
    if (!ENTITY_SET.has(entityLower)) {
      throw new ParseError(
        `unknown entity '${entityRaw}'; expected one of: ${queryEntities.join(", ")}`,
      );
    }
    const entity = entityLower as QueryEntity;

    const filters: QueryFilter[] = [];
    if (this.matchIdent("where")) {
      filters.push(this.parseCondition());
      while (this.matchIdent("and")) {
        filters.push(this.parseCondition());
      }
    }

    const sort: QuerySort[] = [];
    if (this.matchIdent("order")) {
      this.expectIdent("by");
      sort.push(this.parseSort());
      while (this.matchPunct(",")) {
        sort.push(this.parseSort());
      }
    }

    if (this.current().kind !== "eof") {
      throw new ParseError(
        `unexpected token near '${tokenPreview(this.current())}'`,
      );
    }

    return { entity, filters, sort };
  }

  private parseCondition(): QueryFilter {
    // Leading: not exists field | exists field
    if (this.matchIdent("not")) {
      this.expectIdent("exists");
      const field = this.parseField();
      return { op: "exists", field, exists: false };
    }
    if (this.matchIdent("exists")) {
      const field = this.parseField();
      return { op: "exists", field, exists: true };
    }

    const field = this.parseField();

    // field not exists | field exists
    if (this.matchIdent("not")) {
      this.expectIdent("exists");
      return { op: "exists", field, exists: false };
    }
    if (this.matchIdent("exists")) {
      return { op: "exists", field, exists: true };
    }

    if (this.matchIdent("in")) {
      this.expectPunct("(");
      const values: QueryScalar[] = [this.parseValue()];
      while (this.matchPunct(",")) {
        values.push(this.parseValue());
      }
      this.expectPunct(")");
      return { op: "in", field, values };
    }

    if (this.matchOp("=")) {
      return { op: "eq", field, value: this.parseValue() };
    }
    if (this.matchOp("!=")) {
      return { op: "neq", field, value: this.parseValue() };
    }

    throw new ParseError(
      `expected =, !=, in, or exists after field '${field}'`,
    );
  }

  private parseField(): string {
    const first = this.expectIdent();
    if (KEYWORDS.has(first.toLowerCase())) {
      throw new ParseError(`'${first}' is not a valid field name`);
    }
    const parts = [first];
    while (this.matchPunct(".")) {
      const next = this.expectIdent();
      if (KEYWORDS.has(next.toLowerCase())) {
        throw new ParseError(`'${next}' is not a valid field segment`);
      }
      parts.push(next);
    }
    return parts.join(".");
  }

  private parseValue(): QueryScalar {
    const t = this.current();
    if (t.kind === "string") {
      this.advance();
      return t.value;
    }
    if (t.kind === "number") {
      this.advance();
      return t.value;
    }
    if (t.kind === "ident") {
      const lower = t.value.toLowerCase();
      this.advance();
      if (lower === "true") return true;
      if (lower === "false") return false;
      if (lower === "null") return null;
      // Bare token: keep as string (payments, P0, …)
      return t.value;
    }
    throw new ParseError("expected a value");
  }

  private parseSort(): QuerySort {
    const field = this.parseField();
    let direction: "asc" | "desc" = "asc";
    if (this.matchIdent("asc")) {
      direction = "asc";
    } else if (this.matchIdent("desc")) {
      direction = "desc";
    }
    return { field, direction };
  }
}

function tokenPreview(t: Token): string {
  if (t.kind === "eof") return "<eof>";
  if (t.kind === "op" || t.kind === "punct") return t.value;
  if (t.kind === "number") return String(t.value);
  return t.value;
}

/**
 * Parse a Quality QL string into a validated {@link QualityQuery}.
 */
export function parseQualityQuery(input: string): QueryParseResult {
  if (typeof input !== "string") {
    return { ok: false, error: "query must be a string" };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "query must be non-empty" };
  }

  try {
    const tokens = tokenize(trimmed);
    const ast = new Parser(tokens).parse();
    const validated = validateQualityQuery(ast);
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.issues.map((i) => i.message).join("; "),
        issues: validated.issues,
      };
    }
    return { ok: true, query: validated.query };
  } catch (err) {
    const message =
      err instanceof ParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "parse failed";
    return { ok: false, error: message };
  }
}

/** Parse or throw — useful for CLI / callers that prefer exceptions. */
export function parseQualityQueryOrThrow(input: string): QualityQuery {
  const result = parseQualityQuery(input);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.query;
}
