import type { ImpactPathRule } from "@topology/domain";

/** Map request path rules (componentKey) onto ImpactPathRule (componentId). */
export function mapPathRulesByComponentKey(
  rules: { pattern: string; componentKey: string }[],
  componentRows: { id: string; key: string }[],
): { pathRules: ImpactPathRule[]; unknownKeys: string[] } {
  const byKey = new Map(componentRows.map((c) => [c.key, c.id]));
  const pathRules: ImpactPathRule[] = [];
  const unknownKeys: string[] = [];
  const seenUnknown = new Set<string>();

  for (const rule of rules) {
    const componentId = byKey.get(rule.componentKey);
    if (!componentId) {
      if (!seenUnknown.has(rule.componentKey)) {
        seenUnknown.add(rule.componentKey);
        unknownKeys.push(rule.componentKey);
      }
      continue;
    }
    pathRules.push({ pattern: rule.pattern, componentId });
  }

  return { pathRules, unknownKeys };
}

/** Convert persisted path_component_rules rows into ImpactPathRule. */
export function mapDbPathRules(
  rows: { pattern: string; componentId: string }[],
): ImpactPathRule[] {
  return rows.map((r) => ({
    pattern: r.pattern,
    componentId: r.componentId,
  }));
}
