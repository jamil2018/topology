import { and, eq } from "drizzle-orm";
import { ensureIntentForCase } from "../lib/quality-graph";
import { db } from "./index";
import {
  caseSteps,
  cases,
  components,
  environments,
  folders,
  journeys,
  linkedIssues,
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
  testPlanCases,
  testPlans,
  workspaces,
  type Case,
  type User,
} from "./schema";

type Priority = "P0" | "P1" | "P2" | "P3";
type StepDraft = { action: string; expected: string };
type CaseDraft = {
  title: string;
  suite: string;
  priority: Priority;
  tags: string[];
  preconditions: string;
  steps: StepDraft[];
};

const SUITES = [
  "Smoke",
  "Auth & account",
  "Catalog & search",
  "Cart",
  "Checkout & payments",
  "Orders & fulfillment",
] as const;

function steps(title: string, extras: StepDraft[] = []): StepDraft[] {
  const verb = title[0]?.toLowerCase() + title.slice(1);
  return [
    {
      action: `Open Harbor and reach the surface for “${title}”.`,
      expected: "The page loads without an error banner or blank state.",
    },
    {
      action: `Carry out the behavior: ${verb}.`,
      expected: "Harbor accepts the input and shows a progress or confirmation state.",
    },
    {
      action: "Confirm cart, order, or account state matches the case.",
      expected: "The observable result matches the title and no residual error remains.",
    },
    ...extras,
  ];
}

function draft(
  suite: string,
  title: string,
  priority: Priority,
  tags: string[],
  customSteps?: StepDraft[],
  preconditions = "Harbor storefront is running against the staging catalog.",
): CaseDraft {
  return {
    title,
    suite,
    priority,
    tags,
    preconditions,
    steps: customSteps ?? steps(title),
  };
}

export function demoCatalog(): CaseDraft[] {
  const smoke: CaseDraft[] = [
    draft("Smoke", "Shopper can open the storefront home", "P0", ["smoke", "ui"]),
    draft("Smoke", "Shopper can open a product detail page", "P0", ["smoke", "catalog"]),
    draft("Smoke", "Shopper can add an in-stock SKU to the cart", "P0", ["smoke", "cart"], [
      { action: "Open the ceramic pour-over PDP.", expected: "Price, stock, and add-to-cart are visible." },
      { action: "Add quantity 1 to the cart.", expected: "Cart drawer shows the SKU with $48.00." },
      { action: "Keep the drawer open and refresh.", expected: "The line item is still present." },
    ]),
    draft("Smoke", "Shopper can open the cart drawer", "P0", ["smoke", "cart"]),
    draft("Smoke", "Shopper can start checkout as a guest", "P0", ["smoke", "checkout"]),
    draft("Smoke", "Shopper can complete checkout with a test card", "P0", ["smoke", "payments"], [
      { action: "Start guest checkout with a filled cart.", expected: "Address and payment steps appear." },
      { action: "Enter 4242 test card and a US shipping address.", expected: "Totals include tax and shipping." },
      { action: "Place the order.", expected: "Confirmation shows an order number and emailed receipt." },
    ]),
    draft("Smoke", "Signed-in shopper can view order confirmation", "P1", ["smoke", "orders"]),
    draft("Smoke", "Shopper sees a 404 for an unknown product slug", "P2", ["smoke", "catalog"]),
    draft("Smoke", "Storefront health endpoint returns 200", "P0", ["smoke", "ops"]),
    draft("Smoke", "Shopper can search from the header", "P1", ["smoke", "search"]),
    draft("Smoke", "Shopper can open the account sign-in page", "P1", ["smoke", "auth"]),
    draft("Smoke", "Cart persists after a page reload", "P1", ["smoke", "cart"]),
    draft("Smoke", "Shopper can apply a valid promo code", "P1", ["smoke", "checkout"]),
    draft("Smoke", "Shopper can complete checkout with Apple Pay sandbox", "P1", ["smoke", "payments"]),
    draft("Smoke", "Order confirmation email is queued", "P2", ["smoke", "orders"]),
  ];

  const authTitles = [
    ["Shopper can register with a valid email", "P0"],
    ["Shopper cannot register with a disposable email", "P1"],
    ["Shopper can verify email from the inbox link", "P0"],
    ["Shopper can sign in with email and password", "P0"],
    ["Shopper sees a lockout after five bad passwords", "P1"],
    ["Shopper can reset a forgotten password", "P0"],
    ["Shopper can sign in with Google OAuth", "P1"],
    ["Shopper can sign in with Apple", "P2"],
    ["Shopper session survives a tab refresh", "P1"],
    ["Shopper is signed out after idle timeout", "P2"],
    ["Shopper can update their display name", "P2"],
    ["Shopper can add a second shipping address", "P1"],
    ["Shopper can mark a default address", "P1"],
    ["Shopper can delete an unused address", "P2"],
    ["Shopper can save a card to the wallet", "P1"],
    ["Shopper can remove a saved card", "P2"],
    ["Shopper can opt into marketing email", "P3"],
    ["Shopper can opt out of marketing email", "P2"],
    ["Shopper can enable two-factor authentication", "P1"],
    ["Shopper can recover an account with a backup code", "P1"],
    ["Staff cannot sign in on the storefront login", "P2"],
    ["Shopper sees a clear error for an unverified email", "P1"],
    ["Shopper can close their account", "P3"],
    ["Closed account cannot sign in", "P2"],
    ["Shopper can reopen a recently closed account", "P3"],
  ] as const;

  const catalogTitles = [
    ["Shopper can filter mugs by color", "P1"],
    ["Shopper can sort catalog by price low to high", "P1"],
    ["Shopper can sort catalog by newest", "P2"],
    ["Shopper can open a sold-out SKU", "P1"],
    ["Sold-out SKU hides add to cart", "P1"],
    ["Shopper can join a restock waitlist", "P2"],
    ["Shopper can switch PDP image gallery", "P2"],
    ["Shopper can pick a size variant", "P1"],
    ["Price updates when a variant changes", "P0"],
    ["Shopper sees estimated ship date on PDP", "P2"],
    ["Shopper can read care instructions", "P3"],
    ["Search returns pour-over results for kettle", "P0"],
    ["Search suggests corrections for a typo", "P2"],
    ["Empty search shows a helpful empty state", "P2"],
    ["Shopper can open a collection landing page", "P1"],
    ["Collection pagination keeps filters", "P2"],
    ["Shopper can share a PDP URL with the selected variant", "P2"],
    ["Structured data is present on the PDP", "P3"],
    ["Shopper sees related products", "P2"],
    ["Shopper can add a related product from the PDP", "P2"],
    ["Locale switch rewrites catalog copy", "P2"],
    ["Currency switch updates list prices", "P1"],
    ["Shopper can open a merchandised bundle", "P1"],
    ["Bundle shows the combined savings", "P1"],
    ["Out-of-region catalog hides restricted SKUs", "P1"],
  ] as const;

  const cartTitles = [
    ["Guest can add two units of the same SKU", "P0"],
    ["Signed-in shopper can add two units of the same SKU", "P0"],
    ["Shopper can increment quantity in the cart", "P1"],
    ["Shopper can decrement quantity in the cart", "P1"],
    ["Quantity cannot drop below one without remove", "P2"],
    ["Shopper can remove a line item", "P0"],
    ["Empty cart shows a continue-shopping CTA", "P2"],
    ["Cart shows line discounts from a promo", "P1"],
    ["Cart shows free-shipping progress", "P1"],
    ["Cart blocks checkout when a SKU goes out of stock", "P0"],
    ["Cart warns when quantity exceeds inventory", "P1"],
    ["Shopper can add a gift note", "P2"],
    ["Shopper can request gift wrap", "P3"],
    ["Cart drawer closes on escape", "P3"],
    ["Cart is restored after sign-in", "P1"],
    ["Guest cart merges on sign-in", "P1"],
    ["Shopper can save an item for later", "P2"],
    ["Saved-for-later item returns to the cart", "P2"],
    ["Cart estimate includes US sales tax", "P0"],
    ["Cart estimate updates after a ZIP change", "P1"],
    ["Shopper can add a bundle as one line", "P1"],
    ["Removing a bundle removes all components", "P1"],
    ["Cart survives 30 minutes of idle time", "P2"],
    ["Expired cart is rebuilt from the last PDP", "P3"],
    ["Shopper can copy a cart share link", "P3"],
  ] as const;

  const checkoutTitles = [
    ["Guest can enter a US shipping address", "P0"],
    ["Address autocomplete fills city and state", "P1"],
    ["Invalid ZIP blocks continue", "P1"],
    ["Shopper can ship to a PO box", "P2"],
    ["Shopper can choose express shipping", "P1"],
    ["Express shipping updates the total", "P0"],
    ["Shopper can choose pickup at the Brooklyn studio", "P2"],
    ["Pickup hides shipping price", "P2"],
    ["Shopper can apply WELCOME10", "P1"],
    ["Expired promo is rejected with a reason", "P1"],
    ["Stacked promos are rejected", "P1"],
    ["Shopper can remove a promo code", "P2"],
    ["Tax total includes the regional surcharge", "P0"],
    ["Tax total is zero for a tax-exempt nonprofit", "P2"],
    ["Shopper can pay with a Visa test card", "P0"],
    ["Shopper can pay with a Mastercard test card", "P1"],
    ["Declined card shows a recoverable error", "P0"],
    ["3DS challenge can be completed", "P1"],
    ["Shopper can pay with Shop Pay", "P1"],
    ["Shopper can pay with Apple Pay on Safari", "P1"],
    ["Apple Pay sheet stays open on iOS 18", "P0"],
    ["Shopper can pay with Google Pay", "P2"],
    ["Shopper can pay with a saved card", "P1"],
    ["CVC is required for a saved card", "P1"],
    ["Billing address can differ from shipping", "P2"],
    ["Order review shows itemized totals", "P0"],
    ["Place order is disabled until payment is valid", "P1"],
    ["Double-clicking place order creates one order", "P0"],
    ["Checkout restores after a mid-flow refresh", "P1"],
    ["Shopper can return from payment to address", "P2"],
    ["EU shopper sees VAT on the review step", "P1"],
    ["CAD shopper sees duties estimate", "P2"],
    ["Shopper can add an order-level gift message", "P3"],
    ["Out-of-stock SKU is removed before payment", "P1"],
    ["Checkout session expires after 60 minutes", "P2"],
  ] as const;

  const orderTitles = [
    ["Confirmation page shows the order number", "P0"],
    ["Confirmation page shows the estimated delivery", "P1"],
    ["Shopper can print the confirmation", "P3"],
    ["Signed-in shopper can open order history", "P0"],
    ["Guest can look up an order with email and number", "P1"],
    ["Shopper can see shipment tracking", "P1"],
    ["Shopper is notified when a label is created", "P2"],
    ["Shopper can cancel an unfulfilled order", "P1"],
    ["Cancel is hidden after fulfillment", "P1"],
    ["Shopper can request a return", "P1"],
    ["Return label is emailed", "P2"],
    ["Refund appears after the return is received", "P1"],
    ["Partial refund is itemized", "P2"],
    ["Shopper can reorder from history", "P2"],
    ["Reorder restores the original variants", "P2"],
    ["Shopper can download an invoice PDF", "P2"],
    ["Invoice lists tax and shipping separately", "P1"],
    ["Failed fulfillment shows a support banner", "P1"],
    ["Split shipment shows two tracking numbers", "P2"],
    ["Shopper can add a missing apartment number", "P2"],
    ["Address change is blocked after the label prints", "P1"],
    ["Shopper can contact support from the order", "P3"],
    ["Support ticket includes the order number", "P2"],
    ["Shopper can leave a product review after delivery", "P3"],
    ["Review requires a delivered order", "P2"],
  ] as const;

  const fromTitles = (
    suite: string,
    rows: readonly (readonly [string, Priority])[],
    tag: string,
  ) => rows.map(([title, priority]) => draft(suite, title, priority, [tag, "harbor"]));

  return [
    ...smoke,
    ...fromTitles("Auth & account", authTitles, "auth"),
    ...fromTitles("Catalog & search", catalogTitles, "catalog"),
    ...fromTitles("Cart", cartTitles, "cart"),
    ...fromTitles("Checkout & payments", checkoutTitles, "checkout"),
    ...fromTitles("Orders & fulfillment", orderTitles, "orders"),
  ];
}

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
      key: "JOURNEY-CHECKOUT",
      title: "Guest checkout with a test card",
      criticality: "P0",
      description: "Shopper opens Harbor, adds a SKU, and completes guest checkout.",
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

  const linkedCases = await db.query.cases.findMany({
    where: eq(cases.workspaceId, workspaceId),
  });

  const [reqCheckout] = await db
    .insert(requirements)
    .values({
      workspaceId,
      key: "REQ-CHECKOUT-1",
      title: "Guest checkout must complete with a valid card",
      description: "A guest can place an order without creating an account.",
      criticality: "P0",
    })
    .returning();
  const [reqTax] = await db
    .insert(requirements)
    .values({
      workspaceId,
      key: "REQ-TAX-1",
      title: "Regional surcharge is included in tax",
      description: "Uncovered demo requirement for Hub gaps.",
      criticality: "P1",
    })
    .returning();

  const [riskPay] = await db
    .insert(risks)
    .values({
      workspaceId,
      key: "RISK-PAY-1",
      title: "Apple Pay sheet dismisses before authorization",
      description: "P0 payment failures on iOS Safari.",
      criticality: "P0",
    })
    .returning();

  const [compCart] = await db
    .insert(components)
    .values({
      workspaceId,
      key: "COMP-CART",
      title: "Cart",
      description: "Drawer, totals, and merge.",
      criticality: "P0",
    })
    .returning();
  const [compPay] = await db
    .insert(components)
    .values({
      workspaceId,
      key: "COMP-PAY",
      title: "Payments",
      description: "Card, wallet, and 3DS.",
      criticality: "P0",
    })
    .returning();

  const checkoutCase =
    linkedCases.find((c) =>
      c.title.includes("complete checkout with a test card"),
    ) ?? linkedCases[0];
  const checkoutIntent = checkoutCase?.intentId
    ? await db.query.testIntents.findFirst({
        where: eq(testIntents.id, checkoutCase.intentId),
      })
    : null;

  if (checkoutIntent) {
    if (!checkoutIntent.representationJson) {
      await db
        .update(testIntents)
        .set({
          representationJson: JSON.stringify({
            given: ["Harbor is running", "the ceramic pour-over is in stock"],
            when: ["a guest adds the SKU", "they pay with a 4242 test card"],
            then: ["an order number is issued", "confirmation email is queued"],
          }),
          updatedAt: new Date(),
        })
        .where(eq(testIntents.id, checkoutIntent.id));
    }

    const existingJunit = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.intentId, checkoutIntent.id),
        eq(testImplementations.type, "junit"),
      ),
    });
    if (!existingJunit) {
      await db.insert(testImplementations).values({
        workspaceId,
        intentId: checkoutIntent.id,
        type: "junit",
        externalKey: "checkout::guest_card",
        framework: "junit",
      });
    }

    await db.insert(qualityEdges).values([
      {
        workspaceId,
        fromType: "requirement",
        fromId: reqCheckout.id,
        toType: "intent",
        toId: checkoutIntent.id,
        relation: "covers",
      },
      {
        workspaceId,
        fromType: "intent",
        fromId: checkoutIntent.id,
        toType: "risk",
        toId: riskPay.id,
        relation: "mitigates",
      },
      {
        workspaceId,
        fromType: "intent",
        fromId: checkoutIntent.id,
        toType: "component",
        toId: compPay.id,
        relation: "belongs_to",
      },
    ]);
  }

  void reqTax;

  await seedPathRuleAndJourney(workspaceId, {
    componentId: compCart.id,
    intentId: checkoutIntent?.id ?? null,
  });

  let autoCase = linkedCases.find((c) => c.key.startsWith("AUTO-"));
  if (!autoCase) {
    const [created] = await db
      .insert(cases)
      .values({
        workspaceId,
        key: "AUTO-checkout::guest_card",
        title: "checkout::guest_card",
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
      externalKey: "checkout::guest_card",
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
      toId: compPay.id,
      relation: "belongs_to",
    });
  }

  return true;
}

function projectSteps(stepRows: StepDraft[]) {
  return {
    steps: stepRows.map((step, i) => `${i + 1}. ${step.action}`).join("\n"),
    expectedResult: stepRows[stepRows.length - 1]?.expected ?? "",
  };
}

async function insertCases(
  workspaceId: string,
  userId: string,
  folderBySuite: Map<string, string>,
) {
  const drafts = demoCatalog();
  const values = drafts.map((item, index) => {
    const projected = projectSteps(item.steps);
    return {
      workspaceId,
      key: `HAR-${index + 1}`,
      title: item.title,
      description: `Harbor ${item.suite.toLowerCase()} coverage.`,
      preconditions: item.preconditions,
      steps: projected.steps,
      expectedResult: projected.expectedResult,
      priority: item.priority,
      status: "ready" as const,
      folderId: folderBySuite.get(item.suite) ?? null,
      tags: item.tags,
      createdById: userId,
      assigneeId: userId,
    };
  });

  const seeded: Case[] = [];
  for (let i = 0; i < values.length; i += 50) {
    const chunk = await db.insert(cases).values(values.slice(i, i + 50)).returning();
    seeded.push(...chunk);
  }

  const stepValues = seeded.flatMap((row, index) =>
    drafts[index].steps.map((step, position) => ({
      caseId: row.id,
      workspaceId,
      position,
      action: step.action,
      expected: step.expected,
      data: "",
    })),
  );
  for (let i = 0; i < stepValues.length; i += 80) {
    await db.insert(caseSteps).values(stepValues.slice(i, i + 80));
  }

  return seeded;
}

function findCase(rows: Case[], needle: string) {
  return rows.find((row) => row.title.includes(needle));
}

async function seedCompletedRun(input: {
  workspaceId: string;
  userId: string;
  name: string;
  description: string;
  environment: string;
  environmentId: string;
  caseRows: Case[];
  failedTitles: string[];
  notes: Record<string, string>;
  completedAt: Date;
}) {
  const [run] = await db
    .insert(runs)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      status: "completed",
      kind: "manual",
      environment: input.environment,
      environmentId: input.environmentId,
      createdById: input.userId,
      assigneeId: input.userId,
      startedAt: new Date(input.completedAt.getTime() - 90 * 60 * 1000),
      completedAt: input.completedAt,
    })
    .returning();

  const results = await db
    .insert(runResults)
    .values(
      input.caseRows.map((row) => {
        const failed = input.failedTitles.some((title) => row.title.includes(title));
        return {
          runId: run.id,
          caseId: row.id,
          status: failed ? ("failed" as const) : ("passed" as const),
          notes: failed ? (input.notes[row.title] ?? input.notes[Object.keys(input.notes).find((k) => row.title.includes(k)) ?? ""] ?? "Failed on staging.") : "",
          assigneeId: input.userId,
          executedAt: input.completedAt,
          executedById: input.userId,
        };
      }),
    )
    .returning();

  return { run, results };
}

export async function seedDemoWorkspace(input: {
  workspaceId: string;
  user: User;
}) {
  const { workspaceId, user } = input;
  await db
    .update(workspaces)
    .set({ name: "Harbor", updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

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
        name: "Harbor 2.4 checkout gate",
        description: "Smoke and checkout suites must stay green for launch.",
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
    return {
      skipped: true,
      graphSeeded,
      caseCount: caseRows.length,
    };
  }

  const folderBySuite = new Map<string, string>();
  for (const name of SUITES) {
    const [folder] = await db
      .insert(folders)
      .values({ workspaceId, name })
      .returning();
    folderBySuite.set(name, folder.id);
  }

  const seededCases = await insertCases(workspaceId, user.id, folderBySuite);
  await seedQualityGraph(workspaceId, seededCases);

  await db.insert(milestones).values({
    workspaceId,
    name: "Harbor 2.4 checkout gate",
    description: "Smoke and checkout suites must stay green for launch.",
    folderId: folderBySuite.get("Smoke"),
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
  const [stagingEnv] = await db
    .insert(environments)
    .values({
      workspaceId,
      name: "staging",
      kind: "staging",
      metadataJson: null,
    })
    .returning();

  const smokeCases = seededCases.filter((row) => row.tags.includes("smoke"));
  const checkoutCases = seededCases.filter((row) =>
    row.tags.includes("checkout"),
  );
  const cartCases = seededCases.filter((row) => row.tags.includes("cart"));

  const now = Date.now();
  const smokeRun = await seedCompletedRun({
    workspaceId,
    userId: user.id,
    name: "Harbor smoke — Chrome / macOS",
    description: "Staging smoke before the 2.4 freeze.",
    environment: "staging",
    environmentId: stagingEnv.id,
    caseRows: smokeCases,
    failedTitles: ["Cart persists after a page reload"],
    notes: {
      "Cart persists after a page reload":
        "Drawer is empty after a hard refresh on Chrome 130 / macOS. localStorage key is written, then cleared by the locale bootstrap.",
    },
    completedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
  });

  const checkoutRun = await seedCompletedRun({
    workspaceId,
    userId: user.id,
    name: "Checkout regression — Firefox / Windows",
    description: "Full checkout + cart pass on Firefox.",
    environment: "staging",
    environmentId: stagingEnv.id,
    caseRows: [...checkoutCases, ...cartCases.slice(0, 8)],
    failedTitles: [
      "Tax total includes the regional surcharge",
      "Stacked promos are rejected",
    ],
    notes: {
      "Tax total includes the regional surcharge":
        "NYC order shows $4.20 tax; expected $5.04 with the 0.375% regional surcharge.",
      "Stacked promos are rejected":
        "WELCOME10 + FREESHIP both applied. Review total dropped $18 instead of rejecting the second code.",
    },
    completedAt: new Date(now - 24 * 60 * 60 * 1000),
  });

  const paymentCases = seededCases.filter((row) =>
    /pay|card|Apple Pay|Google Pay|3DS|CVC|Visa|Mastercard/i.test(row.title),
  );
  const paymentsRun = await seedCompletedRun({
    workspaceId,
    userId: user.id,
    name: "Payments — Safari / iOS",
    description: "Wallet and card matrix on iOS 18 Safari.",
    environment: "staging",
    environmentId: stagingEnv.id,
    caseRows: paymentCases.length > 0 ? paymentCases : smokeCases,
    failedTitles: ["Apple Pay sheet stays open on iOS 18"],
    notes: {
      "Apple Pay sheet stays open on iOS 18":
        "Sheet dismisses immediately after Touch ID. No payment_intent is created. Reproduced on iPhone 15 / iOS 18.0.1.",
    },
    completedAt: new Date(now - 6 * 60 * 60 * 1000),
  });

  const taxResult = checkoutRun.results.find((r) => r.status === "failed");
  const appleResult = paymentsRun.results.find((r) => r.status === "failed");
  if (taxResult) {
    await db.insert(resultComments).values({
      resultId: taxResult.id,
      userId: user.id,
      body: "Reproduced on Firefox 131. Tax service is using the old ZIP table — surcharge row for 10001 is missing.",
    });
  }
  if (appleResult) {
    await db.insert(resultComments).values({
      resultId: appleResult.id,
      userId: user.id,
      body: "Wallet JS reloads the page when ApplePaySession.canMakePayments returns true on iOS 18.",
    });
  }

  const [plan] = await db
    .insert(testPlans)
    .values({
      workspaceId,
      name: "Release 2.4 checkout",
      description:
        "Open plan for the Harbor 2.4 freeze — smoke plus checkout on Chrome and Firefox.",
      status: "active",
      matrixJson: JSON.stringify({
        browsers: ["Chrome", "Firefox"],
        operatingSystems: ["macOS", "Windows"],
        environmentIds: [stagingEnv.id],
      }),
      createdById: user.id,
    })
    .returning();

  const planCases = [...smokeCases, ...checkoutCases.slice(0, 20)];
  await db.insert(testPlanCases).values(
    planCases.map((row, position) => ({
      planId: plan.id,
      caseId: row.id,
      position,
    })),
  );

  const taxCase = findCase(seededCases, "Tax total includes the regional surcharge");
  const appleCase = findCase(seededCases, "Apple Pay sheet stays open on iOS 18");
  if (taxResult && taxCase) {
    await db.insert(linkedIssues).values({
      workspaceId,
      provider: "mock",
      remoteId: "harbor-41",
      remoteKey: "HAR-41",
      url: "https://issues.harbor.test/HAR-41",
      title: "Tax total ignores regional surcharge in NYC",
      remoteStatus: "open",
      resultId: taxResult.id,
      caseId: taxCase.id,
      runId: checkoutRun.run.id,
      createdById: user.id,
    });
  }
  if (appleResult && appleCase) {
    await db.insert(linkedIssues).values({
      workspaceId,
      provider: "mock",
      remoteId: "harbor-58",
      remoteKey: "HAR-58",
      url: "https://issues.harbor.test/HAR-58",
      title: "Apple Pay sheet dismisses on iOS 18 Safari",
      remoteStatus: "open",
      resultId: appleResult.id,
      caseId: appleCase.id,
      runId: paymentsRun.run.id,
      createdById: user.id,
    });
  }

  void localEnv;
  void smokeRun;

  return {
    skipped: false,
    graphSeeded: true,
    caseCount: seededCases.length,
    runCount: 3,
    planName: plan.name,
  };
}
