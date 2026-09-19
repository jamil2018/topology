/**
 * Canonical Test Intent representation: structured { given, when, then }.
 * Projections (steps table, Gherkin, natural language, traditional case text)
 * are derived; parsers recover structure when keywords are present.
 */

export type ClauseKind = "given" | "when" | "then";

export type StructuredRepresentation = {
  given: string[];
  when: string[];
  then: string[];
};

/** Row in the Traditional / steps-table projection. */
export type RepresentationStep = {
  order: number;
  kind: ClauseKind;
  text: string;
};

export type TraditionalProjection = {
  /** Numbered action lines (cases.steps style). */
  steps: string;
  /** Expected outcome (cases.expected_result style). */
  expectedResult: string;
};

const CLAUSE_KINDS: ClauseKind[] = ["given", "when", "then"];

const GHERKIN_KEYWORD =
  /^(Given|When|Then|And|But)\s+(.+)$/i;

function trimClause(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function nonEmpty(clauses: string[]): string[] {
  return clauses.map(trimClause).filter(Boolean);
}

/** Empty structured representation. */
export function emptyRepresentation(): StructuredRepresentation {
  return { given: [], when: [], then: [] };
}

/** Normalize partial input into a full structured representation. */
export function normalizeRepresentation(
  input: Partial<StructuredRepresentation> | null | undefined,
): StructuredRepresentation {
  if (!input) return emptyRepresentation();
  return {
    given: nonEmpty(input.given ?? []),
    when: nonEmpty(input.when ?? []),
    then: nonEmpty(input.then ?? []),
  };
}

export function isEmptyRepresentation(rep: StructuredRepresentation): boolean {
  return (
    rep.given.length === 0 &&
    rep.when.length === 0 &&
    rep.then.length === 0
  );
}

/** Project structured model → ordered steps table. */
export function toStepTable(
  rep: StructuredRepresentation,
): RepresentationStep[] {
  const n = normalizeRepresentation(rep);
  const rows: RepresentationStep[] = [];
  let order = 1;
  for (const kind of CLAUSE_KINDS) {
    for (const text of n[kind]) {
      rows.push({ order, kind, text });
      order += 1;
    }
  }
  return rows;
}

/** Rebuild structured model from a steps table. */
export function fromStepTable(
  steps: RepresentationStep[],
): StructuredRepresentation {
  const out = emptyRepresentation();
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  for (const step of sorted) {
    if (!CLAUSE_KINDS.includes(step.kind)) continue;
    const text = trimClause(step.text);
    if (!text) continue;
    out[step.kind].push(text);
  }
  return out;
}

/**
 * Project to Gherkin scenario body (Given/When/Then/And lines).
 * Optional scenario title wraps as `Scenario: …`.
 */
export function toGherkin(
  rep: StructuredRepresentation,
  options?: { scenario?: string },
): string {
  const n = normalizeRepresentation(rep);
  const lines: string[] = [];
  if (options?.scenario?.trim()) {
    lines.push(`Scenario: ${options.scenario.trim()}`);
  }

  const emit = (kind: ClauseKind, clauses: string[]) => {
    clauses.forEach((text, i) => {
      const keyword =
        i === 0
          ? kind.charAt(0).toUpperCase() + kind.slice(1)
          : "And";
      const indent = options?.scenario?.trim() ? "  " : "";
      lines.push(`${indent}${keyword} ${text}`);
    });
  };

  emit("given", n.given);
  emit("when", n.when);
  emit("then", n.then);
  return lines.join("\n");
}

/**
 * Parse Gherkin (or keyword-prefixed lines) into structured form.
 * Returns null when no Given/When/Then clauses are found.
 */
export function fromGherkin(text: string): StructuredRepresentation | null {
  if (!text?.trim()) return null;

  const out = emptyRepresentation();
  let current: ClauseKind | null = null;
  let found = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^(Feature|Scenario(?: Outline)?|Background|Examples|Rule)\b/i.test(line)) {
      continue;
    }

    const match = GHERKIN_KEYWORD.exec(line);
    if (!match) continue;

    const keyword = match[1]!.toLowerCase();
    const body = trimClause(match[2]!);
    if (!body) continue;

    if (keyword === "given") current = "given";
    else if (keyword === "when") current = "when";
    else if (keyword === "then") current = "then";
    else if (keyword === "and" || keyword === "but") {
      if (!current) continue;
    }

    if (!current) continue;
    out[current].push(body);
    found = true;
  }

  return found ? out : null;
}

/**
 * Project to a short natural-language paragraph.
 * Example: "Given A and B. When C. Then D."
 */
export function toNaturalLanguage(rep: StructuredRepresentation): string {
  const n = normalizeRepresentation(rep);
  const parts: string[] = [];

  const joinList = (items: string[]): string => {
    if (items.length === 1) return items[0]!;
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  };

  if (n.given.length) parts.push(`Given ${joinList(n.given)}`);
  if (n.when.length) parts.push(`When ${joinList(n.when)}`);
  if (n.then.length) parts.push(`Then ${joinList(n.then)}`);
  return parts.length ? `${parts.join(". ")}.` : "";
}

/**
 * Best-effort parse of natural language with Given/When/Then markers.
 * Returns null when markers are absent.
 */
export function fromNaturalLanguage(
  text: string,
): StructuredRepresentation | null {
  if (!text?.trim()) return null;

  const normalized = text.replace(/\s+/g, " ").trim();
  const markers: { kind: ClauseKind; index: number }[] = [];
  const re = /\b(Given|When|Then)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    markers.push({
      kind: m[1]!.toLowerCase() as ClauseKind,
      index: m.index,
    });
  }
  if (markers.length === 0) return null;

  const out = emptyRepresentation();
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.index + markers[i]!.kind.length;
    const end = i + 1 < markers.length ? markers[i + 1]!.index : normalized.length;
    const body = trimClause(
      normalized.slice(start, end).replace(/^[.\s,:;-]+/, "").replace(/[.\s]+$/, ""),
    );
    if (!body) continue;
    // Split "A and B" only for multi-clause lists joined by " and " when
    // the prior segment was the same kind — keep as single clause otherwise.
    out[markers[i]!.kind].push(body);
  }

  return isEmptyRepresentation(out) ? null : out;
}

/**
 * Traditional case projection: numbered steps + expected result from Then.
 * Given/When become steps; Then becomes expectedResult.
 */
export function toTraditionalSteps(
  rep: StructuredRepresentation,
): TraditionalProjection {
  const n = normalizeRepresentation(rep);
  const actionLines: string[] = [];
  for (const text of n.given) {
    actionLines.push(`[Given] ${text}`);
  }
  for (const text of n.when) {
    actionLines.push(`[When] ${text}`);
  }
  const steps = actionLines
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");
  const expectedResult = n.then.join("\n");
  return { steps, expectedResult };
}

/**
 * Recover structure from traditional steps + expected result.
 * Recognizes `[Given]` / `[When]` / `[Then]` prefixes and Gherkin keywords;
 * unlabeled numbered lines become `when`; expectedResult fills `then` when empty.
 */
export function fromTraditionalSteps(
  steps: string,
  expectedResult = "",
): StructuredRepresentation {
  const out = emptyRepresentation();
  let current: ClauseKind = "when";

  for (const rawLine of steps.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^\d+[.)]\s*/, "");

    const bracket = /^\[(Given|When|Then)\]\s*(.*)$/i.exec(line);
    if (bracket) {
      current = bracket[1]!.toLowerCase() as ClauseKind;
      const body = trimClause(bracket[2]!);
      if (body) out[current].push(body);
      continue;
    }

    const gherkin = GHERKIN_KEYWORD.exec(line);
    if (gherkin) {
      const keyword = gherkin[1]!.toLowerCase();
      const body = trimClause(gherkin[2]!);
      if (keyword === "given" || keyword === "when" || keyword === "then") {
        current = keyword;
      }
      if (body && current) out[current].push(body);
      continue;
    }

    const body = trimClause(line);
    if (body) out[current].push(body);
  }

  if (out.then.length === 0 && expectedResult.trim()) {
    for (const raw of expectedResult.split(/\r?\n/)) {
      const body = trimClause(raw.replace(/^\d+[.)]\s*/, ""));
      if (body) out.then.push(body);
    }
  }

  return out;
}

/**
 * Try Gherkin → natural language → treat as traditional when-body.
 * Always returns a structured object (may be empty).
 */
export function parseRepresentation(text: string): StructuredRepresentation {
  const gherkin = fromGherkin(text);
  if (gherkin && !isEmptyRepresentation(gherkin)) return gherkin;

  const nl = fromNaturalLanguage(text);
  if (nl && !isEmptyRepresentation(nl)) return nl;

  return fromTraditionalSteps(text, "");
}
