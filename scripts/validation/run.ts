import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir, cpus, totalmem, platform, arch } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { normalizeVisualDates, prepareVisualIdentity } from "./visual-fixture";
import { evaluateContainer } from "./container";
import { evaluateOperations } from "./operations";
import { assertOwnedDatabase, redact } from "./safety";

const mode = process.argv[2] ?? "sanity";
const browserArgs = process.argv.slice(3);
if (!["sanity", "regression", "release", "integration", "e2e", "smoke", "core", "ops", "performance", "onboarding", "visual", "visual-linux", "lighthouse", "container", "debug"].includes(mode)) {
  throw new Error(`Unknown validation suite: ${mode}`);
}
const runId = randomBytes(8).toString("hex");
const project = `topology-validation-${runId}`;
const compose = ["compose", "-f", "scripts/validation/compose.yml", "-p", project];
const root = mkdtempSync(path.join(tmpdir(), "topology-validation-"));
const output = path.resolve("test-results", `validation-${runId}`);
mkdirSync(output, { recursive: true });
const secret = randomBytes(32).toString("hex");
const secrets = [secret, "validation-webhook-regression-secret", "validation-local-only", "topology-demo", "topology-member", "topology-viewer", "topology-custom", "topology-other", "validation-admin-password", "topo_validation_performance_token", "topo_demo_token_local_dev_only", "topo_e2e_read_token", "topo_e2e_ci_token", "topo_e2e_agent_token", "topo_e2e_revoked_token"];
const created = new Set<string>();
let current: ChildProcess | undefined;
let provisioned = false;
let browserProvisioned = false;
const browserContainer = `${project}-browser`;
let terminating = false;
const env = { ...process.env };
// Do not inherit developer auth, providers, storage, routing or fixtures.
for (const key of Object.keys(env)) {
  if (/^(DATABASE_|AUTH_|OIDC_|ATTACHMENTS_|TOPOLOGY_|DEMO_|PERF_|PLAYWRIGHT_|DRIZZLE_)/.test(key)) delete env[key];
}
// Block Next's automatic .env loading from introducing developer credentials.
for (const filename of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"]) {
  if (existsSync(filename)) {
    for (const match of readFileSync(filename, "utf8").matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = "";
  }
}
Object.assign(env, {
  PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(output, "html"),
  PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(output, "playwright.json"),
  PLAYWRIGHT_OUTPUT_DIR: path.join(output, "browser"),
  TOPOLOGY_VALIDATION_OWNER: runId,
  PLAYWRIGHT_DEV_SERVER: mode === "debug" ? "1" : "0",
  DOTENV_CONFIG_PATH: "/dev/null",
  AUTH_SECRET: secret, AUTH_URL: "http://127.0.0.1:4318", PORT: "4318",
  HOST: "127.0.0.1", TOPOLOGY_URL: "http://127.0.0.1:4318",
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4318", TOPOLOGY_VALIDATION: "1",
  TOPOLOGY_SEED_MODE: "e2e", TOPOLOGY_ISSUE_PROVIDER: "mock", TOPOLOGY_AI_PROVIDER: "none",
  TOPOLOGY_API_TOKEN: "topo_demo_token_local_dev_only", DEMO_USER_EMAIL: "demo@topology.local",
  DEMO_USER_PASSWORD: "topology-demo", ATTACHMENTS_DRIVER: "local", ATTACHMENTS_DIR: path.join(root, "attachments"),
  TOPOLOGY_S3_E2E: "1", TOPOLOGY_OPS_E2E: "1", PYTHONPATH: path.resolve("packages/pytest-topology/src"),
});
const results: { command: string; status: string; durationMs: number; tests?: { passed: number; failed: number; skipped: number; flaky: number } }[] = [];
function sync(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 900_000 }).trim();
}
async function run(command: string, args: string[]) {
  if (terminating) throw new Error("Validation interrupted");
  const start = Date.now();
  const label = [command, ...args].join(" ");
  const isBrowser = command === "npx" && args[0] === "playwright";
  if (isBrowser) {
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = path.join(output, `browser-results-${results.length + 1}.json`);
    env.PLAYWRIGHT_HTML_OUTPUT_DIR = path.join(output, `browser-report-${results.length + 1}`);
  }
  let log = "";
  console.log(`\n[validation] ${label}`);
  const progress = isBrowser ? setInterval(() => {
    const plain = log.replace(/\x1b\[[0-9;]*m/g, "");
    const passed = plain.match(/^\s*✓\s+\d+\s+\[/gm)?.length ?? 0;
    const failed = plain.match(/^\s*[✘×]\s+\d+\s+\[/gm)?.length ?? 0;
    console.log(`[validation] Browser progress: ${passed} passed, ${failed} failed; ${Math.round((Date.now() - start) / 1000)} s elapsed (no retries)`);
  }, 60_000) : undefined;
  progress?.unref();
  const status = await new Promise<number>((resolve, reject) => {
    current = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    // Buffer until completion so secrets split over stream chunks are redacted too.
    current.stdout!.on("data", (chunk) => { log += chunk.toString(); });
    current.stderr!.on("data", (chunk) => { log += chunk.toString(); });
    current.on("error", (error) => { clearInterval(progress); reject(error); });
    current.on("exit", (code) => { clearInterval(progress); resolve(code ?? 1); });
  });
  current = undefined;
  const safe = redact(log, secrets);
  writeFileSync(path.join(output, `${results.length + 1}.log`), safe);
  console.log(safe.slice(-6000));
  let tests;
  if (isBrowser && existsSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME!)) {
    const stats = JSON.parse(readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME!, "utf8")).stats;
    tests = { passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped, flaky: stats.flaky };
  }
  const vitestOutput = args.find((argument) => argument.startsWith("--outputFile="))?.slice("--outputFile=".length);
  if (vitestOutput && existsSync(vitestOutput)) {
    const stats = JSON.parse(readFileSync(vitestOutput, "utf8"));
    tests = { passed: stats.numPassedTests, failed: stats.numFailedTests, skipped: stats.numPendingTests + (stats.numTodoTests ?? 0), flaky: 0 };
  }
  const unqualified = tests && (tests.skipped > 0 || tests.flaky > 0);
  results.push({ command: label, status: status === 0 && !unqualified ? "passed" : "failed", durationMs: Date.now() - start, tests });
  if (unqualified) throw new Error(`${label} contains skipped or retry-only passes; see the browser results`);
  if (status !== 0) throw new Error(`${label} exited ${status}`);
}
async function connectContainerBrowser() {
  if (!browserProvisioned) {
      const version = JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version;
      sync("docker", ["run", "-d", "--rm", "--init", "--name", browserContainer,
        "--shm-size=1gb", "-p", "127.0.0.1::3000", "--mount",
        `type=bind,src=${path.resolve("node_modules")},dst=/node_modules,readonly`,
        `mcr.microsoft.com/playwright:v${version}-noble`, "node", "/node_modules/playwright/cli.js",
        "run-server", "--port", "3000", "--host", "0.0.0.0"]);
      browserProvisioned = true;
      const browserPort = sync("docker", ["port", browserContainer, "3000"]).split(":").at(-1);
      const endpoint = `http://127.0.0.1:${browserPort}`;
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try { await fetch(endpoint); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      if (!ready) throw new Error("Container browser did not start");
  }
  const browserPort = sync("docker", ["port", browserContainer, "3000"]).split(":").at(-1);
  env.PLAYWRIGHT_WS_ENDPOINT = `ws://127.0.0.1:${browserPort}/`;
  env.PLAYWRIGHT_SNAPSHOT_PLATFORM = "linux";
}
async function selectBrowserTemplate(sourceUrl: string) {
  const source = new URL(sourceUrl);
  const name = source.pathname.slice(1);
  assertOwnedDatabase(name, created);
  const template = `topology_validation_${runId}_browser_template`;
  source.pathname = "/postgres";
  const templateAdmin = postgres(source.toString(), { max: 1 });
  try {
    if (created.has(template)) {
      assertOwnedDatabase(template, created);
      await templateAdmin.unsafe(`DROP DATABASE "${template}"`);
    }
    await templateAdmin.unsafe(`CREATE DATABASE "${template}" WITH TEMPLATE "${name}"`);
    created.add(template);
    env.TOPOLOGY_VALIDATION_ADMIN_URL = source.toString();
    env.TOPOLOGY_VALIDATION_TEMPLATE = template;
  } finally { await templateAdmin.end(); }
}

function killCurrent() {
  if (current?.pid) { try { process.kill(-current.pid, "SIGTERM"); } catch { /* already exited */ } }
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    terminating = true;
    killCurrent();
    // Finally owns cleanup; active child exit releases the pending run.
  });
}
let admin: postgres.Sql | undefined;
let failure: string | undefined;
let containerResources: unknown;
async function main() {
try {
  containerResources = JSON.parse(sync("docker", ["info", "--format", '{"serverVersion":"{{.ServerVersion}}","cpuCount":{{.NCPU}},"memoryBytes":{{.MemTotal}}}']));
  if (terminating) throw new Error("Validation interrupted");
  provisioned = true; // down also cleans partially started services
  sync("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "90"]);
  const pgPort = sync("docker", [...compose, "port", "postgres", "5432"]).split(":").at(-1);
  const s3Port = sync("docker", [...compose, "port", "minio", "9000"]).split(":").at(-1);
  const connection = new URL(`postgresql://validation:validation-local-only@127.0.0.1:${pgPort}/postgres`);
  admin = postgres(connection.toString(), { max: 1, connect_timeout: 10 });
  for (const purpose of ["seeded", "onboarding", "migration", "performance", "restore", "visual", "lighthouse", "container"]) {
    const name = `topology_validation_${runId}_${purpose}`;
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    created.add(name);
  }
  const seeded = `topology_validation_${runId}_seeded`;
  assertOwnedDatabase(seeded, created);
  connection.pathname = `/${seeded}`;
  env.DATABASE_URL = connection.toString();
  Object.assign(env, {
    ATTACHMENTS_S3_BUCKET: `validation-${runId}`, ATTACHMENTS_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    ATTACHMENTS_S3_ACCESS_KEY_ID: "validation", ATTACHMENTS_S3_SECRET_ACCESS_KEY: "validation-local-only",
    ATTACHMENTS_S3_REGION: "us-east-1", ATTACHMENTS_S3_FORCE_PATH_STYLE: "true",
  });
  const s3 = new S3Client({ endpoint: env.ATTACHMENTS_S3_ENDPOINT, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "validation", secretAccessKey: "validation-local-only" } });
  try { await s3.send(new CreateBucketCommand({ Bucket: env.ATTACHMENTS_S3_BUCKET })); } finally { s3.destroy(); }
  await run("npx", ["tsx", "src/db/migrate.ts"]);
  const seedSql = postgres(env.DATABASE_URL!, { max: 1 });
  try {
    await seedSql`CREATE TABLE validation_harness_owner (id text PRIMARY KEY)`;
    await seedSql`INSERT INTO validation_harness_owner (id) VALUES (${runId})`;
  } finally { await seedSql.end(); }
  await run("npx", ["tsx", "src/db/seed.ts"]);
  await selectBrowserTemplate(env.DATABASE_URL!);
  if (["onboarding", "regression", "release"].includes(mode)) {
    const seededUrl = env.DATABASE_URL;
    connection.pathname = `/topology_validation_${runId}_onboarding`;
    env.DATABASE_URL = connection.toString();
    env.PLAYWRIGHT_OUTPUT_DIR = path.join(output, "onboarding");
    await run("npx", ["tsx", "src/db/migrate.ts"]);
    await run("npx", ["playwright", "test", "--project=onboarding", "--retries=0"]);
    env.DATABASE_URL = seededUrl;
    env.PLAYWRIGHT_OUTPUT_DIR = path.join(output, "browser");
  }
  if (["sanity", "regression", "release"].includes(mode)) {
    await run("npm", ["run", "test:unit", "--", "--reporter=default", "--reporter=json", `--outputFile=${path.join(output, "unit.json")}`]);
    await run("npm", ["run", "test:ui", "--", "--reporter=default", "--reporter=json", `--outputFile=${path.join(output, "components.json")}`]);
  }
  if (["regression", "release", "integration"].includes(mode)) {
    await run("npm", ["run", "build", "--", "--webpack"]);
    env.PLAYWRIGHT_BUILD_READY = "1";
    await run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts", "--reporter=default", "--reporter=json", `--outputFile=${path.join(output, "integration.json")}`]);
    await run("python3", ["-m", "pytest", "packages/pytest-topology/tests", "-q", "-p", "no:cacheprovider"]);
  }
  if (["sanity", "regression", "release", "e2e", "smoke", "core", "debug"].includes(mode)) {
    if (["release", "core"].includes(mode)) await connectContainerBrowser();
    const projects = mode === "release" ? ["chromium", "firefox-core", "webkit-core", "mobile-390", "tablet-834", "tablet-1194", "laptop-1366", "desktop-1920"]
      : mode === "core" ? ["firefox-core", "webkit-core"]
      : mode === "sanity" || mode === "smoke" ? ["smoke"] : ["chromium"];
    if (mode !== "debug") env.TOPOLOGY_ISOLATE_BROWSER_TESTS = "1";
    await run("npx", ["playwright", "test", ...projects.map((name) => `--project=${name}`), ...browserArgs, "--retries=0"]);
    delete env.TOPOLOGY_ISOLATE_BROWSER_TESTS;
  }
  if (["release", "container"].includes(mode)) {
    const containerUrl = new URL(connection.toString());
    containerUrl.pathname = `/topology_validation_${runId}_container`;
    const started = performance.now();
    await evaluateContainer({ project, databaseUrl: containerUrl.toString(), created, secret, output });
    results.push({ command: "production container install/reconcile/persistence", status: "passed", durationMs: performance.now() - started });
  }
  if (["release", "ops"].includes(mode)) {
    const started = performance.now();
    const restarted = await evaluateOperations({ adminUrl: connection.toString(), runId, created, compose, temporaryRoot: root, s3Endpoint: env.ATTACHMENTS_S3_ENDPOINT!, bucket: env.ATTACHMENTS_S3_BUCKET! });
    connection.port = restarted.postgresPort;
    env.ATTACHMENTS_S3_ENDPOINT = restarted.s3Endpoint;
    results.push({ command: "operations: upgrade/idempotency/backup/restore", status: "passed", durationMs: performance.now() - started });
  }
  if (["release", "lighthouse"].includes(mode)) {
    delete env.PLAYWRIGHT_WS_ENDPOINT;
    connection.pathname = `/topology_validation_${runId}_lighthouse`;
    env.DATABASE_URL = connection.toString();
    await run("npx", ["tsx", "src/db/migrate.ts"]);
    await run("npx", ["tsx", "src/db/seed.ts"]);
    await selectBrowserTemplate(env.DATABASE_URL!);
    env.TOPOLOGY_ISOLATE_BROWSER_TESTS = "1";
    env.PLAYWRIGHT_OUTPUT_DIR = path.join(output, "lighthouse");
    await run("npx", ["playwright", "test", "--project=lighthouse", "--retries=0"]);
    delete env.TOPOLOGY_ISOLATE_BROWSER_TESTS;
  }
  if (["release", "visual", "visual-linux"].includes(mode)) {
    await connectContainerBrowser();
    connection.pathname = `/topology_validation_${runId}_visual`;
    env.DATABASE_URL = connection.toString();
    await run("npx", ["tsx", "src/db/migrate.ts"]);
    await prepareVisualIdentity(env.DATABASE_URL, created);
    await run("npx", ["tsx", "src/db/seed.ts"]);
    await normalizeVisualDates(env.DATABASE_URL, created);
    await selectBrowserTemplate(env.DATABASE_URL!);
    env.TOPOLOGY_ISOLATE_BROWSER_TESTS = "1";
    env.PLAYWRIGHT_OUTPUT_DIR = path.join(output, "visual");
    await run("npx", ["playwright", "test", "--project=visual", ...browserArgs, "--retries=0"]);
    delete env.TOPOLOGY_ISOLATE_BROWSER_TESTS;
  }
  if (["release", "performance"].includes(mode)) {
    connection.pathname = `/topology_validation_${runId}_performance`;
    env.DATABASE_URL = connection.toString();
    env.PERF_CASES = "50000";
    env.PERF_OUTPUT = path.join(output, "cases-performance.json");
    env.PERF_METADATA_OUTPUT = path.join(output, "performance-fixture.json");
    await run("npx", ["tsx", "src/db/migrate.ts"]);
    await run("npx", ["tsx", "src/db/seed.ts"]);
    await run("npx", ["tsx", "scripts/perf-fixture.ts"]);
    const fixture = JSON.parse(readFileSync(env.PERF_METADATA_OUTPUT, "utf8"));
    env.PERF_PROJECT_ID = fixture.projectId; env.PERF_RUN_ID = fixture.runId;
    await run("npx", ["tsx", "scripts/perf-bench.ts"]);
    await selectBrowserTemplate(env.DATABASE_URL!);
    env.TOPOLOGY_ISOLATE_BROWSER_TESTS = "1";
    env.PLAYWRIGHT_OUTPUT_DIR = path.join(output, "performance");
    await run("npx", ["playwright", "test", "--project=performance", "--retries=0"]);
    delete env.TOPOLOGY_ISOLATE_BROWSER_TESTS;
  }
  if (terminating) throw new Error("Validation interrupted");
} catch (error) {
  failure = redact(String(error), secrets);
  console.error(failure);
  process.exitCode = 1;
} finally {
  killCurrent();
  if (browserProvisioned) {
    try { sync("docker", ["stop", browserContainer]); }
    catch { failure = `${failure ?? ""} Browser cleanup failed`; process.exitCode = 1; }
  }
  await admin?.end({ timeout: 5 });
  if (provisioned) {
    try { sync("docker", [...compose, "down", "--volumes", "--remove-orphans"]); }
    catch { failure = `${failure ?? ""} Cleanup failed for ${project}`; process.exitCode = 1; }
  }
  rmSync(root, { recursive: true, force: true });
  try {
    execFileSync("python3", ["scripts/validation/redact-artifacts.py", output], {
      env: { ...process.env, VALIDATION_REDACT_SECRETS: JSON.stringify(secrets) }, stdio: "pipe",
    });
  } catch { failure = `${failure ?? ""} Artifact redaction failed`; process.exitCode = 1; }
  writeFileSync(path.join(output, "summary.json"), JSON.stringify({
    runId, mode, commit: sync("git", ["rev-parse", "HEAD"]),
    dirty: Boolean(sync("git", ["status", "--porcelain"])),
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), containerResources, browserRuntime: browserProvisioned ? `playwright:${JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version}-noble Linux` : "native installed Playwright" },
    retries: 0, results, failure, status: failure ? "failed" : "passed",
    qualifications: { liveProviders: "not run", screenReader: "not run", nativeZoom: "not run" },
  }, null, 2));
}

}
void main();
