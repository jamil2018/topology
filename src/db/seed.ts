import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { cases, folders, runResults, runs, users } from "./schema";

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

  const existingFolders = await db.select().from(folders).limit(1);
  if (existingFolders.length > 0) {
    console.log("Seed skipped — folders already present");
    console.log(`Demo login: ${email} / ${password}`);
    return;
  }

  const [smoke] = await db
    .insert(folders)
    .values({ name: "Smoke" })
    .returning();
  const [regression] = await db
    .insert(folders)
    .values({ name: "Regression" })
    .returning();

  const seededCases = await db
    .insert(cases)
    .values([
      {
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
      },
      {
        key: "TOP-2",
        title: "Create a case in a folder",
        description: "Operators can add cases under a folder.",
        preconditions: "At least one folder exists.",
        steps: "1. Open Cases\n2. Create case\n3. Assign folder",
        expectedResult: "Case appears in the folder filter.",
        priority: "P1",
        status: "ready",
        folderId: smoke.id,
        tags: ["cases"],
        createdById: user.id,
      },
      {
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

  const [run] = await db
    .insert(runs)
    .values({
      name: "Local smoke — bootstrap",
      description: "First manual pass after Topology bootstrap.",
      status: "planned",
      environment: "local",
      createdById: user.id,
    })
    .returning();

  await db.insert(runResults).values(
    seededCases.map((c) => ({
      runId: run.id,
      caseId: c.id,
      status: "untested" as const,
    })),
  );

  console.log(`Seeded ${seededCases.length} cases, 2 folders, 1 run`);
  console.log(`Demo login: ${email} / ${password}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
