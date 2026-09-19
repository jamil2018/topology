export type CoveragePriority = "P0" | "P1" | "P2" | "P3";

export type CoverageRequirement = {
  id: string;
  key: string;
  title: string;
};

export type CoverageRisk = {
  id: string;
  key: string;
  title: string;
  criticality?: CoveragePriority | string;
};

export type CoverageImplementation = {
  type: string;
};

export type CoverageIntent = {
  id: string;
  key: string;
  title: string;
  criticality: CoveragePriority | string;
  implementations: CoverageImplementation[];
  /** Last time any linked case/result was executed (non-untested). */
  lastExecutedAt: Date | string | null;
};

export type CoverageEdge = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relation: string;
};

export type CoverageInput = {
  requirements: CoverageRequirement[];
  risks: CoverageRisk[];
  intents: CoverageIntent[];
  edges: CoverageEdge[];
};

export type CoverageDimension = {
  covered: number;
  total: number;
  /** null when total is 0 (N/A until entities exist). */
  pct: number | null;
};

export type CoverageGap =
  | {
      kind: "uncovered_requirement";
      id: string;
      key: string;
      title: string;
    }
  | {
      kind: "manual_only_p0";
      id: string;
      key: string;
      title: string;
    }
  | {
      kind: "never_executed";
      id: string;
      key: string;
      title: string;
    };

export type CoverageReport = {
  requirement: CoverageDimension;
  risk: CoverageDimension;
  automation: CoverageDimension;
  execution: CoverageDimension;
  gaps: CoverageGap[];
};

function pct(covered: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((covered / total) * 100);
}

function isAutomated(impls: CoverageImplementation[]): boolean {
  return impls.some((i) => i.type !== "manual");
}

function isManualOnly(impls: CoverageImplementation[]): boolean {
  return impls.length > 0 && impls.every((i) => i.type === "manual");
}

function hasExecution(lastExecutedAt: Date | string | null): boolean {
  return lastExecutedAt != null && lastExecutedAt !== "";
}

/** Intent IDs covered by a requirement via `covers` edges (either direction). */
function intentIdsCoveringRequirement(
  requirementId: string,
  edges: CoverageEdge[],
): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.relation !== "covers") continue;
    if (
      e.fromType === "requirement" &&
      e.fromId === requirementId &&
      e.toType === "intent"
    ) {
      ids.add(e.toId);
    }
    if (
      e.toType === "requirement" &&
      e.toId === requirementId &&
      e.fromType === "intent"
    ) {
      ids.add(e.fromId);
    }
  }
  return ids;
}

function intentIdsMitigatingRisk(
  riskId: string,
  edges: CoverageEdge[],
): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.relation !== "mitigates") continue;
    if (
      e.fromType === "risk" &&
      e.fromId === riskId &&
      e.toType === "intent"
    ) {
      ids.add(e.toId);
    }
    if (
      e.toType === "risk" &&
      e.toId === riskId &&
      e.fromType === "intent"
    ) {
      ids.add(e.fromId);
    }
  }
  return ids;
}

/**
 * Deterministic coverage math for Hub / API.
 * Requirement & risk coverage are N/A (pct null) until those entities exist.
 */
export function computeCoverage(input: CoverageInput): CoverageReport {
  const intentById = new Map(input.intents.map((i) => [i.id, i]));

  let reqCovered = 0;
  const uncoveredReqs: CoverageGap[] = [];
  for (const req of input.requirements) {
    const linked = intentIdsCoveringRequirement(req.id, input.edges);
    const hasLink = [...linked].some((id) => intentById.has(id));
    if (hasLink) {
      reqCovered += 1;
    } else {
      uncoveredReqs.push({
        kind: "uncovered_requirement",
        id: req.id,
        key: req.key,
        title: req.title,
      });
    }
  }

  let riskCovered = 0;
  for (const risk of input.risks) {
    const linked = intentIdsMitigatingRisk(risk.id, input.edges);
    if ([...linked].some((id) => intentById.has(id))) {
      riskCovered += 1;
    }
  }

  let automated = 0;
  let executed = 0;
  const gaps: CoverageGap[] = [...uncoveredReqs];

  for (const intent of input.intents) {
    if (isAutomated(intent.implementations)) automated += 1;
    if (hasExecution(intent.lastExecutedAt)) {
      executed += 1;
    } else {
      gaps.push({
        kind: "never_executed",
        id: intent.id,
        key: intent.key,
        title: intent.title,
      });
    }
    if (
      intent.criticality === "P0" &&
      (intent.implementations.length === 0 ||
        isManualOnly(intent.implementations))
    ) {
      gaps.push({
        kind: "manual_only_p0",
        id: intent.id,
        key: intent.key,
        title: intent.title,
      });
    }
  }

  const intentTotal = input.intents.length;

  return {
    requirement: {
      covered: reqCovered,
      total: input.requirements.length,
      pct: pct(reqCovered, input.requirements.length),
    },
    risk: {
      covered: riskCovered,
      total: input.risks.length,
      pct: pct(riskCovered, input.risks.length),
    },
    automation: {
      covered: automated,
      total: intentTotal,
      pct: pct(automated, intentTotal),
    },
    execution: {
      covered: executed,
      total: intentTotal,
      pct: pct(executed, intentTotal),
    },
    gaps,
  };
}
