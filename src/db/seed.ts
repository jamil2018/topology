import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { hashToken } from "../lib/ci-auth";
import { ensureMembership } from "../lib/workspace";
import { ensureIntentForCase } from "../lib/quality-graph";
import { db } from "./index";
import {
  apiTokens,
  cases,
  components,
  environments,
  folders,
  journeys,
  milestones,
  pathComponentRules,
  qualityEdges,
  requirements,
  resultComments,
  risks,
  runResults,
  runs,
  testImplementations,
  testIntents,
  users,
  type Case,
} from "./schema";

async function seedQualityGraph(workspaceId: string, caseRows: Case[]) {
  const existingReqs = await db
    .select()
    .from(requirements)
    .where(eq(requirements.workspaceId, workspaceId))
    .limit(1);
  if (existingReqs.length > 0) {
    await seedPathRuleAndJourney(workspaceId);
    return false;
  }

  for (const c of caseRows) {
    if (!c.intentId) await ensureIntentForCase(c);
  }

  // Refresh after linking so intentIds are present.
  const linkedCases = await db.query.cases.findMany({
    where: eq(cases.workspaceId, workspaceId),
  });

  const [reqHub] = await db
    .insert(requirements)
    .values({
      workspaceId,
      key: "REQ-HUB-1",
      title: "Hub must load for operators",
      description: "Operators can open the quality hub without errors.",
      criticality: "P0",
    })
    .returning();
  const [reqRefund] = await db
    .insert(requirements)
    .values({
      workspaceId,
      key: "REQ-REFUND-1",
      title: "Refunds require dual approval",
      description: "Uncovered demo requirement for Hub gaps.",
      criticality: "P1",
    })
    .returning();

  const [riskAuth] = await db
    .insert(risks)
    .values({
      workspaceId,
      key: "RISK-AUTH-1",
      title: "Broken auth smoke blocks release",
      description: "P0 smoke failures on hub/auth paths.",
      criticality: "P0",
    })
    .returning();

  const [compHub] = await db
    .insert(components)
    .values({
      workspaceId,
      key: "COMP-HUB",
      title: "Hub shell",
      description: "App chrome, nav, and pulse widgets.",
      criticality: "P0",
    })
    .returning();
  const [compAuth] = await db
    .insert(components)
    .values({
      workspaceId,
      key: "COMP-AUTH",
      title: "Auth",
      description: "Login and session boundaries.",
      criticality: "P0",
    })
    .returning();

  const hubCase =
    linkedCases.find((c) => c.key === "TOP-1") ?? linkedCases[0];
  const hubIntent = hubCase?.intentId
    ? await db.query.testIntents.findFirst({
        where: eq(testIntents.id, hubCase.intentId),
      })
    : await db.query.testIntents.findFirst({
        where: and(
          eq(testIntents.workspaceId, workspaceId),
          eq(testIntents.key, "TOP-1"),
        ),
      });

  // Mixed implementations: keep TOP-1 manual, also attach a junit impl to the same intent.
  if (hubIntent) {
    if (!hubIntent.representationJson) {
      await db
        .update(testIntents)
        .set({
          representationJson: JSON.stringify({
            given: ["the Topology app is running", "a demo operator exists"],
            when: ["the operator opens /", "they open Cases"],
            then: ["the hub shell renders", "the cases list is reachable"],
          }),
          updatedAt: new Date(),
        })
        .where(eq(testIntents.id, hubIntent.id));
    }

    const existingJunit = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.intentId, hubIntent.id),
        eq(testImplementations.type, "junit"),
      ),
    });
    if (!existingJunit) {
      await db.insert(testImplementations).values({
        workspaceId,
        intentId: hubIntent.id,
        type: "junit",
        externalKey: "hub::opens",
        framework: "junit",
      });
    }

    await db.insert(qualityEdges).values([
      {
        workspaceId,
        fromType: "requirement",
        fromId: reqHub.id,
        toType: "intent",
        toId: hubIntent.id,
        relation: "covers",
      },
      {
        workspaceId,
        fromType: "intent",
        fromId: hubIntent.id,
        toType: "risk",
        toId: riskAuth.id,
        relation: "mitigates",
      },
      {
        workspaceId,
        fromType: "intent",
        fromId: hubIntent.id,
        toType: "component",
        toId: compHub.id,
        relation: "belongs_to",
      },
    ]);
  }

  // Leave REQ-REFUND-1 uncovered so Hub shows a requirement gap.
  void reqRefund;

  await seedPathRuleAndJourney(workspaceId, {
    componentId: compHub.id,
    intentId: hubIntent?.id ?? null,
  });

  // Optional AUTO case for a second automated intent (catalog parity with CI ingest).
  let autoCase = linkedCases.find((c) => c.key.startsWith("AUTO-"));
  if (!autoCase) {
    const [created] = await db
      .insert(cases)
      .values({
        workspaceId,
        key: "AUTO-auth::login",
        title: "auth::login",
        description: "Imported from automation (junit)",
        steps: "",
        expectedResult: "Test passes in CI",
        priority: "P1",
        status: "ready",
        tags: ["automation", "junit"],
        createdById: null,
      })
      .returning();
    autoCase = created;
    await ensureIntentForCase(autoCase, db, {
      externalKey: "auth::login",
      framework: "junit",
    });
  }

  const autoIntent = autoCase.intentId
    ? await db.query.testIntents.findFirst({
        where: eq(testIntents.id, autoCase.intentId),
      })
    : null;
  if (autoIntent) {
    await db.insert(qualityEdges).values({
      workspaceId,
      fromType: "intent",
      fromId: autoIntent.id,
      toType: "component",
      toId: compAuth.id,
      relation: "belongs_to",
    });
  }

  return true;
}

/** Phase 3/5 light seed: one path→component rule + one critical journey. */
async function seedPathRuleAndJourney(
  workspaceId: string,
  opts?: { componentId?: string | null; intentId?: string | null },
) {
  let componentId = opts?.componentId ?? null;
  if (!componentId) {
    const [comp] = await db
      .select()
      .from(components)
      .where(eq(components.workspaceId, workspaceId))
      .limit(1);
    componentId = comp?.id ?? null;
  }

  if (componentId) {
    const existingRule = await db
      .select()
      .from(pathComponentRules)
      .where(eq(pathComponentRules.workspaceId, workspaceId))
      .limit(1);
    if (existingRule.length === 0) {
      await db.insert(pathComponentRules).values({
        workspaceId,
        pattern: "src/components/**",
        componentId,
      });
    }
  }

  const existingJourney = await db
    .select()
    .from(journeys)
    .where(eq(journeys.workspaceId, workspaceId))
    .limit(1);
  if (existingJourney.length > 0) return;

  const [journey] = await db
    .insert(journeys)
    .values({
      workspaceId,
      key: "JOURNEY-HUB",
      title: "Open hub and browse cases",
      criticality: "P0",
      description: "Operator opens Topology, loads the hub, and reaches Cases.",
    })
    .returning();

  let intentId = opts?.intentId ?? null;
  if (!intentId) {
    const [intent] = await db
      .select()
      .from(testIntents)
      .where(eq(testIntents.workspaceId, workspaceId))
      .limit(1);
    intentId = intent?.id ?? null;
  }

  if (journey && intentId) {
    await db.insert(qualityEdges).values({
      workspaceId,
      fromType: "journey",
      fromId: journey.id,
      toType: "intent",
      toId: intentId,
      relation: "covers",
    });
  }
}

async function seed() {
  const email = process.env.DEMO_USER_EMAIL ?? "demo@topology.local";
  const password = process.env.DEMO_USER_PASSWORD ?? "topology-demo";
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  const [user] =
    existing != null
      ? [existing]
      : await db
          .insert(users)
          .values({
            name: "Demo Operator",
            email,
            passwordHash,
            emailVerified: new Date(),
          })
          .returning();

  const { workspace } = await ensureMembership(user.id, "admin", {
    create: true,
  });
  const workspaceId = workspace.id;

  const demoToken =
    process.env.TOPOLOGY_API_TOKEN ?? "topo_demo_token_local_dev_only";
  const tokenHash = hashToken(demoToken);
  const existingToken = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, tokenHash),
  });
  if (!existingToken) {
    await db.insert(apiTokens).values({
      workspaceId,
      name: "Local demo CLI token",
      tokenHash,
      tokenPrefix: demoToken.slice(0, 12),
      userId: user.id,
    });
  }

  const existingFolders = await db.select().from(folders).limit(1);
  if (existingFolders.length > 0) {
    const existingMilestone = await db.select().from(milestones).limit(1);
    if (existingMilestone.length === 0) {
      const [smoke] = await db
        .select()
        .from(folders)
        .where(eq(folders.name, "Smoke"))
        .limit(1);
      await db.insert(milestones).values({
        workspaceId,
        name: "v1 launch gate",
        description: "Smoke suite must stay green for launch.",
        folderId: smoke?.id,
        passRateThreshold: 95,
        maxOpenP0Failures: 0,
        minExecutedPct: 80,
        maxOpenBlockers: 0,
        status: "active",
      });
    }
    const caseRows = await db.query.cases.findMany({
      where: eq(cases.workspaceId, workspaceId),
    });
    const graphSeeded = await seedQualityGraph(workspaceId, caseRows);
    console.log(
      graphSeeded
        ? "Folders present — seeded quality graph (requirements/risks/components/edges)"
        : "Seed skipped — folders already present",
    );
    console.log(`Demo login: ${email} / ${password}`);
    console.log(`CLI token: ${demoToken}`);
    return;
  }

  const [smoke] = await db
    .insert(folders)
    .values({ workspaceId, name: "Smoke" })
    .returning();
  const [smokeAuth] = await db
    .insert(folders)
    .values({ workspaceId, name: "Auth", parentId: smoke.id })
    .returning();
  const [regression] = await db
    .insert(folders)
    .values({ workspaceId, name: "Regression" })
    .returning();

  const seededCases = await db
    .insert(cases)
    .values([
      {
        workspaceId,
        key: "TOP-1",
        title: "Operator can open the hub",
        description: "Landing shell loads with navigation and pulse summary.",
        preconditions: "App is running; demo user exists.",
        steps: "1. Open /\n2. Confirm hub shell renders\n3. Open Cases",
        expectedResult: "Hub and cases list are reachable without errors.",
        priority: "P0",
        status: "ready",
        folderId: smoke.id,
        tags: ["smoke", "ui"],
        createdById: user.id,
        assigneeId: user.id,
      },
      {
        workspaceId,
        key: "TOP-2",
        title: "Create a case in a folder",
        description: "Operators can add cases under a folder.",
        preconditions: "At least one folder exists.",
        steps: "1. Open Cases\n2. Create case\n3. Assign folder",
        expectedResult: "Case appears in the folder filter.",
        priority: "P1",
        status: "ready",
        folderId: smokeAuth.id,
        tags: ["cases"],
        createdById: user.id,
      },
      {
        workspaceId,
        key: "TOP-3",
        title: "Import cases from CSV",
        description: "CSV upload creates cases and folders as needed.",
        preconditions: "Valid CSV with key,title columns.",
        steps: "1. Open Cases\n2. Import CSV\n3. Review created rows",
        expectedResult: "Imported cases show with mapped fields.",
        priority: "P1",
        status: "ready",
        folderId: regression.id,
        tags: ["import", "csv"],
        createdById: user.id,
      },
      {
        workspaceId,
        key: "TOP-4",
        title: "Execute a manual run",
        description: "Mark pass/fail on cases inside a run.",
        preconditions: "A run with attached cases exists.",
        steps: "1. Open Runs\n2. Start run\n3. Record results",
        expectedResult: "Run progress updates and statuses persist.",
        priority: "P0",
        status: "ready",
        folderId: regression.id,
        tags: ["runs", "manual"],
        createdById: user.id,
      },
    ])
    .returning();

  await seedQualityGraph(workspaceId, seededCases);

  await db.insert(milestones).values({
    workspaceId,
    name: "v1 launch gate",
    description: "Smoke suite must stay green for launch.",
    folderId: smoke.id,
    passRateThreshold: 95,
    maxOpenP0Failures: 0,
    minExecutedPct: 80,
    maxOpenBlockers: 0,
    status: "active",
  });

  const [localEnv] = await db
    .insert(environments)
    .values({
      workspaceId,
      name: "local",
      kind: "local",
      metadataJson: null,
    })
    .returning();

  const [run] = await db
    .insert(runs)
    .values({
      workspaceId,
      name: "Local smoke — bootstrap",
      description: "First manual pass after Topology bootstrap.",
      status: "planned",
      kind: "manual",
      environment: "local",
      environmentId: localEnv.id,
      createdById: user.id,
      assigneeId: user.id,
    })
    .returning();

  const results = await db
    .insert(runResults)
    .values(
      seededCases.map((c, index) => ({
        runId: run.id,
        caseId: c.id,
        status: index === 0 ? ("failed" as const) : ("untested" as const),
        notes: index === 0 ? "Seeded failure for Create issue demo" : "",
        assigneeId: user.id,
        executedAt: index === 0 ? new Date() : null,
        executedById: index === 0 ? user.id : null,
      })),
    )
    .returning();

  const failed = results.find((r) => r.status === "failed");
  if (failed) {
    await db.insert(resultComments).values({
      resultId: failed.id,
      userId: user.id,
      body: "Seeded comment — try Create issue from this failure on the 15-minute path.",
    });
  }

  console.log(
    `Seeded ${seededCases.length} cases (+ intents/AUTO), requirements/risks/components/edges, 3 folders, 1 run, 1 milestone`,
  );
  console.log(`Demo login: ${email} / ${password}`);
  console.log(`CLI token: ${demoToken}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
