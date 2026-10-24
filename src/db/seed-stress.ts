import "dotenv/config";
import { eq } from "drizzle-orm";
import { assertDemoSeedAllowed } from "../lib/seed-guard";
import { ensureSystemRoles, getSystemRole } from "../lib/custom-roles";
import { db } from "./index";
import { bootstrapFirstAdmin } from "./seed-bootstrap";
import { cases, folders, workspaceMembers, workspaces } from "./schema";

/** XSS / SQL-shaped fixtures for load and sanitizer stress. Not the default demo. */
const STRESS_TITLES = [
  "<img onerror=alert(1) src=x> catalog tile",
  "<script>alert('BUGHUNT')</script> PDP title",
  "'; DROP VIEW public.cases; --",
  "BUGHUNT-SQL-VIEW-1",
  "BUGHUNT-SQL-VIEW-2",
  "1 OR 1=1 -- search box",
  "{{constructor.constructor('alert(1)')()}}",
  "javascript:alert(document.cookie)",
  "<svg/onload=alert(1)>",
  "A".repeat(240) + " overflow title",
];

async function seed() {
  assertDemoSeedAllowed();

  const { user, email, password, demoToken } = await bootstrapFirstAdmin();

  let workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, "bughunt"),
  });
  if (!workspace) {
    const [created] = await db
      .insert(workspaces)
      .values({ name: "BUGHUNT", slug: "bughunt" })
      .returning();
    workspace = created;
    await ensureSystemRoles(workspace.id);
    const adminRole = await getSystemRole(workspace.id, "admin");
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "admin",
      customRoleId: adminRole.id,
    });
  }

  const existing = await db
    .select()
    .from(folders)
    .where(eq(folders.workspaceId, workspace.id))
    .limit(1);
  if (existing.length > 0) {
    console.log("Stress seed skipped — BUGHUNT folders already present");
    console.log(`Demo login: ${email} / ${password}`);
    return;
  }

  const [injection] = await db
    .insert(folders)
    .values({ workspaceId: workspace.id, name: "Injection" })
    .returning();
  const [xss] = await db
    .insert(folders)
    .values({ workspaceId: workspace.id, name: "XSS" })
    .returning();
  const [load] = await db
    .insert(folders)
    .values({ workspaceId: workspace.id, name: "Load" })
    .returning();

  const stressCases = STRESS_TITLES.map((title, index) => ({
    workspaceId: workspace.id,
    key: `BH-${index + 1}`,
    title,
    description: "BUGHUNT stress fixture — do not use as product screenshots.",
    preconditions: "Stress project only.",
    steps: "1. Open the case\n2. Confirm the title is escaped in the UI",
    expectedResult: "Title is escaped; no script or SQL runs.",
    priority: (index % 2 === 0 ? "P0" : "P2") as "P0" | "P2",
    status: "ready" as const,
    folderId: title.includes("BUGHUNT-SQL")
      ? injection.id
      : title.includes("<") || title.includes("javascript")
        ? xss.id
        : load.id,
    tags: ["bughunt", "stress"],
    createdById: user.id,
  }));

  const loadCases = Array.from({ length: 80 }, (_, index) => ({
    workspaceId: workspace.id,
    key: `BH-L-${index + 1}`,
    title: `BUGHUNT load row ${index + 1} <img onerror=alert(${index}) src=x>`,
    description: "Generated load fixture.",
    preconditions: "",
    steps: "1. Scroll the list\n2. Confirm virtualization holds",
    expectedResult: "Row renders escaped.",
    priority: "P3" as const,
    status: "ready" as const,
    folderId: load.id,
    tags: ["bughunt", "load"],
    createdById: user.id,
  }));

  await db.insert(cases).values([...stressCases, ...loadCases]);

  console.log(
    `Seeded BUGHUNT stress project: ${stressCases.length + loadCases.length} cases in 3 folders`,
  );
  console.log(`Switch to project “BUGHUNT” after login: ${email} / ${password}`);
  if (demoToken) console.log(`CLI token: ${demoToken}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
