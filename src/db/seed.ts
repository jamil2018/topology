import "dotenv/config";
import {
  assertDemoSeedAllowed,
  seedIncludesDemoData,
} from "../lib/seed-guard";
import { bootstrapFirstAdmin } from "./seed-bootstrap";
import { seedDemoWorkspace } from "./seed-demo";

async function seed() {
  assertDemoSeedAllowed();

  const { user, workspaceId, email, password, demoToken } =
    await bootstrapFirstAdmin();

  if (!seedIncludesDemoData()) {
    console.log(`Bootstrapped first admin: ${email}`);
    if (demoToken) console.log(`CLI token: ${demoToken}`);
    else console.log("No TOPOLOGY_API_TOKEN set — create a token in Settings.");
    return;
  }

  const result = await seedDemoWorkspace({ workspaceId, user });
  if (result.skipped) {
    console.log(
      result.graphSeeded
        ? "Folders present — seeded quality graph (requirements/risks/components/edges)"
        : "Seed skipped — folders already present",
    );
  } else {
    console.log(
      `Seeded Harbor checkout demo: ${result.caseCount} cases, 6 suites, ${result.runCount} completed runs, plan “${result.planName}”, 2 linked issues`,
    );
  }
  console.log(`Demo login: ${email} / ${password}`);
  if (demoToken) console.log(`CLI token: ${demoToken}`);
  else console.log("Create an API token in Settings → Security.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
