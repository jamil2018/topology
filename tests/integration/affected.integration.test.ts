import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("getWorkspaceImpact (integration)", () => {
  beforeAll(() => {
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
  });

  afterEach(async () => {
    // suite cleans up its own rows
  });

  it("walks path rules to affected intents via quality edges", async () => {
    const { db } = await import("@/db");
    const {
      components,
      qualityEdges,
      testImplementations,
      testIntents,
      users,
    } = await import("@/db/schema");
    const { ensureMembership } = await import("@/lib/workspace");
    const { getWorkspaceImpact } = await import("@/lib/quality-graph");

    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    expect(demo?.id).toBeTruthy();
    const { workspace } = await ensureMembership(demo!.id, "admin");
    const workspaceId = workspace.id;
    const stamp = Date.now();

    const [comp] = await db
      .insert(components)
      .values({
        workspaceId,
        key: `COMP-IMP-${stamp}`,
        title: "Impact component",
        description: "integration",
        criticality: "P1",
      })
      .returning();

    const [intent] = await db
      .insert(testIntents)
      .values({
        workspaceId,
        key: `IMP-IT-${stamp}`,
        title: "Impact intent",
        behavior: "Changed path should hit this intent",
        criticality: "P0",
        status: "ready",
      })
      .returning();

    const [impl] = await db
      .insert(testImplementations)
      .values({
        workspaceId,
        intentId: intent.id,
        type: "junit",
        sourcePath: `src/impact-${stamp}/spec.ts`,
        externalKey: `impact::${stamp}`,
        framework: "junit",
      })
      .returning();

    await db.insert(qualityEdges).values({
      workspaceId,
      fromType: "intent",
      fromId: intent.id,
      toType: "component",
      toId: comp.id,
      relation: "belongs_to",
    });

    const { impact, pathRulesApplied, unknownComponentKeys } =
      await getWorkspaceImpact(
        workspaceId,
        [`src/impact-${stamp}/handler.ts`],
        [
          {
            pattern: `src/impact-${stamp}/`,
            componentKey: comp.key,
          },
        ],
      );

    expect(pathRulesApplied).toBe(1);
    expect(unknownComponentKeys).toEqual([]);
    expect(impact.components.map((c) => c.key)).toContain(comp.key);
    expect(impact.intents.map((i) => i.key)).toContain(intent.key);
    expect(impact.implementations.map((i) => i.id)).toContain(impl.id);

    // Direct sourcePath overlap without rules
    const bySource = await getWorkspaceImpact(workspaceId, [
      `src/impact-${stamp}/spec.ts`,
    ]);
    expect(bySource.impact.implementations.map((i) => i.id)).toContain(impl.id);
    expect(bySource.impact.intents.map((i) => i.key)).toContain(intent.key);
    expect(bySource.rulesSource).toBe("database");

    // Persist a path rule and omit body.rules → DB rules applied
    const { pathComponentRules } = await import("@/db/schema");
    const [dbRule] = await db
      .insert(pathComponentRules)
      .values({
        workspaceId,
        pattern: `src/impact-${stamp}/`,
        componentId: comp.id,
      })
      .returning();

    const fromDb = await getWorkspaceImpact(workspaceId, [
      `src/impact-${stamp}/handler.ts`,
    ]);
    expect(fromDb.rulesSource).toBe("database");
    expect(fromDb.pathRulesApplied).toBeGreaterThanOrEqual(1);
    expect(fromDb.impact.intents.map((i) => i.key)).toContain(intent.key);

    // cleanup
    await db
      .delete(pathComponentRules)
      .where(eq(pathComponentRules.id, dbRule.id));
    await db
      .delete(qualityEdges)
      .where(
        and(
          eq(qualityEdges.workspaceId, workspaceId),
          eq(qualityEdges.fromId, intent.id),
        ),
      );
    await db
      .delete(testImplementations)
      .where(eq(testImplementations.id, impl.id));
    await db.delete(testIntents).where(eq(testIntents.id, intent.id));
    await db.delete(components).where(eq(components.id, comp.id));
  });
});
