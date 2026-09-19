/**
 * Deterministic change-impact walk: changed paths → path rules → components →
 * quality edges → requirements / intents / implementations.
 */

export type ImpactPathRule = {
  /** Path prefix (e.g. `src/auth/`) or simple glob with stars. */
  pattern: string;
  componentId: string;
};

export type ImpactComponent = {
  id: string;
  key: string;
  title: string;
};

export type ImpactRequirement = {
  id: string;
  key: string;
  title: string;
};

export type ImpactIntent = {
  id: string;
  key: string;
  title: string;
  criticality?: string;
};

export type ImpactImplementation = {
  id: string;
  intentId: string;
  type: string;
  sourcePath: string | null;
};

export type ImpactEdge = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relation: string;
};

export type ImpactInput = {
  changedPaths: string[];
  pathRules: ImpactPathRule[];
  components: ImpactComponent[];
  requirements: ImpactRequirement[];
  intents: ImpactIntent[];
  implementations: ImpactImplementation[];
  edges: ImpactEdge[];
};

export type ImpactGapHint =
  | {
      kind: "component_without_intents";
      id: string;
      key: string;
      title: string;
    }
  | {
      kind: "intent_without_implementations";
      id: string;
      key: string;
      title: string;
    }
  | {
      kind: "manual_only";
      id: string;
      key: string;
      title: string;
    }
  | {
      kind: "affected_requirement_uncovered";
      id: string;
      key: string;
      title: string;
    };

export type ImpactReport = {
  components: ImpactComponent[];
  requirements: ImpactRequirement[];
  intents: ImpactIntent[];
  implementations: ImpactImplementation[];
  gaps: ImpactGapHint[];
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Escape a literal path segment for use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match path against a prefix or simple glob (`*` = one segment, `**` = any depth).
 */
export function pathMatchesRule(path: string, pattern: string): boolean {
  const p = normalizePath(path);
  const raw = normalizePath(pattern);
  if (!raw) return false;

  if (!raw.includes("*") && !raw.includes("?")) {
    if (p === raw) return true;
    if (raw.endsWith("/")) return p.startsWith(raw);
    return p.startsWith(`${raw}/`);
  }

  // Convert simple glob to regex: ** → .*, * → [^/]*, ? → [^/]
  const escaped = escapeRegex(raw)
    .replace(/\\\*\\\*/g, "::DS::")
    .replace(/\\\*/g, "[^/]*")
    .replace(/\\\?/g, "[^/]")
    .replace(/::DS::/g, ".*");
  return new RegExp(`^${escaped}$`).test(p);
}

function pathsOverlap(a: string, b: string): boolean {
  const left = normalizePath(a);
  const right = normalizePath(b);
  if (!left || !right) return false;
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

function neighborIds(
  edges: ImpactEdge[],
  type: string,
  id: string,
  neighborType: string,
  relations?: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (relations && !relations.has(e.relation)) continue;
    if (e.fromType === type && e.fromId === id && e.toType === neighborType) {
      ids.add(e.toId);
    }
    if (e.toType === type && e.toId === id && e.fromType === neighborType) {
      ids.add(e.fromId);
    }
  }
  return ids;
}

function isManualOnly(impls: ImpactImplementation[]): boolean {
  return impls.length > 0 && impls.every((i) => i.type === "manual");
}

/**
 * Walk changed paths through path→component rules and quality edges.
 * Also includes implementations whose sourcePath overlaps a changed path.
 */
export function computeImpact(input: ImpactInput): ImpactReport {
  const componentById = new Map(input.components.map((c) => [c.id, c]));
  const requirementById = new Map(input.requirements.map((r) => [r.id, r]));
  const intentById = new Map(input.intents.map((i) => [i.id, i]));
  const implById = new Map(input.implementations.map((i) => [i.id, i]));

  const changed = input.changedPaths.map(normalizePath).filter(Boolean);

  const componentIds = new Set<string>();
  for (const path of changed) {
    for (const rule of input.pathRules) {
      if (pathMatchesRule(path, rule.pattern)) {
        componentIds.add(rule.componentId);
      }
    }
  }

  const implementationIds = new Set<string>();
  const intentIds = new Set<string>();
  const requirementIds = new Set<string>();

  // Direct sourcePath hits
  for (const impl of input.implementations) {
    if (!impl.sourcePath) continue;
    if (changed.some((p) => pathsOverlap(p, impl.sourcePath!))) {
      implementationIds.add(impl.id);
      intentIds.add(impl.intentId);
    }
  }

  // Component → intent / requirement via edges
  const belongsRelations = new Set(["belongs_to", "covers", "mitigates"]);
  for (const componentId of componentIds) {
    for (const intentId of neighborIds(
      input.edges,
      "component",
      componentId,
      "intent",
      belongsRelations,
    )) {
      intentIds.add(intentId);
    }
    for (const reqId of neighborIds(
      input.edges,
      "component",
      componentId,
      "requirement",
      belongsRelations,
    )) {
      requirementIds.add(reqId);
    }
  }

  // Intent ↔ requirement covers edges (either direction)
  const coverRelations = new Set(["covers"]);
  for (const intentId of [...intentIds]) {
    for (const reqId of neighborIds(
      input.edges,
      "intent",
      intentId,
      "requirement",
      coverRelations,
    )) {
      requirementIds.add(reqId);
    }
  }
  for (const reqId of [...requirementIds]) {
    for (const intentId of neighborIds(
      input.edges,
      "requirement",
      reqId,
      "intent",
      coverRelations,
    )) {
      intentIds.add(intentId);
    }
  }

  // Implementations of affected intents
  for (const impl of input.implementations) {
    if (intentIds.has(impl.intentId)) {
      implementationIds.add(impl.id);
    }
  }

  const components = [...componentIds]
    .map((id) => componentById.get(id))
    .filter((c): c is ImpactComponent => c != null)
    .sort((a, b) => a.key.localeCompare(b.key));

  const requirements = [...requirementIds]
    .map((id) => requirementById.get(id))
    .filter((r): r is ImpactRequirement => r != null)
    .sort((a, b) => a.key.localeCompare(b.key));

  const intents = [...intentIds]
    .map((id) => intentById.get(id))
    .filter((i): i is ImpactIntent => i != null)
    .sort((a, b) => a.key.localeCompare(b.key));

  const implementations = [...implementationIds]
    .map((id) => implById.get(id))
    .filter((i): i is ImpactImplementation => i != null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const implsByIntent = new Map<string, ImpactImplementation[]>();
  for (const impl of input.implementations) {
    const list = implsByIntent.get(impl.intentId) ?? [];
    list.push(impl);
    implsByIntent.set(impl.intentId, list);
  }

  const gaps: ImpactGapHint[] = [];

  for (const component of components) {
    const linked = neighborIds(
      input.edges,
      "component",
      component.id,
      "intent",
      belongsRelations,
    );
    if (linked.size === 0) {
      gaps.push({
        kind: "component_without_intents",
        id: component.id,
        key: component.key,
        title: component.title,
      });
    }
  }

  for (const intent of intents) {
    const impls = implsByIntent.get(intent.id) ?? [];
    if (impls.length === 0) {
      gaps.push({
        kind: "intent_without_implementations",
        id: intent.id,
        key: intent.key,
        title: intent.title,
      });
    } else if (isManualOnly(impls)) {
      gaps.push({
        kind: "manual_only",
        id: intent.id,
        key: intent.key,
        title: intent.title,
      });
    }
  }

  for (const req of requirements) {
    const covering = neighborIds(
      input.edges,
      "requirement",
      req.id,
      "intent",
      coverRelations,
    );
    const hasCover = [...covering].some((id) => intentById.has(id));
    if (!hasCover) {
      gaps.push({
        kind: "affected_requirement_uncovered",
        id: req.id,
        key: req.key,
        title: req.title,
      });
    }
  }

  return { components, requirements, intents, implementations, gaps };
}
