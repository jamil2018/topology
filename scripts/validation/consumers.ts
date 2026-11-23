import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { E2E_TOKENS } from "../../src/db/seed-e2e-catalog";
import { redact } from "./safety";

const workspaces = ["domain", "cli", "mcp", "playwright-reporter", "jest-reporter", "cypress-reporter"];
const runners = { "@playwright/test": "1.63.0", jest: "30.2.0", cypress: "15.7.0" };

export async function evaluateConsumers({ root, output, env, secrets }: {
  root: string; output: string; env: NodeJS.ProcessEnv; secrets: string[];
}) {
  const archives = path.join(output, "packages");
  const consumer = path.join(root, "consumer");
  const pythonSource = path.join(root, "pytest-topology");
  mkdirSync(archives);
  cpSync("fixtures/consumers", consumer, { recursive: true });
  cpSync("packages/pytest-topology", pythonSource, { recursive: true });
  const cases = path.resolve("fixtures/junit/smoke.xml");
  const cliArgs = ["junit", "submit", cases, "--source", "cli", "--name", "Package consumer JUnit"];
  const files: string[] = [];
  const results: { name: string; status: string; valid?: number; revoked?: number }[] = [];
  const receipt = () => writeFileSync(path.join(output, "consumers.json"), JSON.stringify({ packages, results, runners }, null, 2) + "\n");
  const packages: Record<string, { version: string; artifact: string; digest: string }> = {};
  const currentEnv: NodeJS.ProcessEnv = { ...env, PYTHONPATH: "", NODE_PATH: "" };
  delete currentEnv.TOPOLOGY_API_TOKEN;
  const exec = (name: string, command: string, args: string[], settings: { cwd?: string; token?: string; expected?: RegExp; failure?: boolean } = {}) => {
    const result = spawnSync(command, args, {
      cwd: settings.cwd ?? consumer, env: { ...currentEnv, TOPOLOGY_API_TOKEN: settings.token },
      timeout: 300_000, encoding: "utf8",
    });
    const log = redact(result.stdout + result.stderr, secrets);
    writeFileSync(path.join(output, `consumer-${name}.log`), log);
    if (result.error) throw result.error;
    if (settings.failure) assert.ok(result.status !== null && result.status !== 0, `${name} should reject`);
    else assert.equal(result.status, 0, `${name} did not exit cleanly`);
    if (settings.expected) assert.match(log, settings.expected, `${name} has no expected receipt`);
    return result.stdout;
  };

  for (const workspace of workspaces) {
    const [packed] = JSON.parse(exec(workspace + "-pack", "npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", archives], {
      cwd: path.resolve("packages", workspace),
    }));
    const artifact = path.join(archives, packed.filename);
    files.push(artifact);
    packages[packed.name] = { version: packed.version, artifact: packed.filename, digest: checksum(artifact) };
  }
  exec("pytest-wheel", "python3", ["-m", "build", "--wheel", "--outdir", archives, pythonSource]);
  const wheels = readdirSync(archives).filter((file) => /^pytest_topology-.*\.whl$/.test(file));
  assert.equal(wheels.length, 1);
  const wheel = path.join(archives, wheels[0]);
  packages["pytest-topology"] = { version: wheels[0].split("-")[1], artifact: wheels[0], digest: checksum(wheel) };
  receipt();

  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "topology-consumer-fixture", private: true }));
  exec("npm-install", "npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund",
    ...files, ...Object.entries(runners).map(([name, version]) => `${name}@${version}`)]);
  exec("cypress-install", "./node_modules/.bin/cypress", ["install"]);
  exec("python-venv", "python3", ["-m", "venv", "python"]);
  exec("python-install", "./python/bin/python", ["-m", "pip", "install", wheel, "pytest==9.2.0"]);

  const server = spawn(process.execPath, ["scripts/validation/start-production.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk.toString(); });
  server.stderr.on("data", (chunk) => { log += chunk.toString(); });
  const database = postgres(env.DATABASE_URL!, { max: 1 });
  try {
    const deadline = Date.now() + 20_000;
    while (true) {
      const status = await fetch(`${env.TOPOLOGY_URL}/api/health`, { signal: AbortSignal.timeout(2000) }).then((res) => res.status).catch(() => 0);
      if (status === 200) break;
      assert.ok(Date.now() < deadline && server.exitCode === null, "Consumer production server did not start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.match(exec("cli-valid", "./node_modules/.bin/topology", cliArgs, { token: E2E_TOKENS.ciWrite.token }), /Package consumer JUnit|runId|uploaded/i);
    exec("cli-revoked", "./node_modules/.bin/topology", cliArgs, { token: E2E_TOKENS.revoked.token, expected: /401|invalid|revoked/i, failure: true });
    results.push({ name: "CLI", status: "passed" });
    exec("mcp-valid", process.execPath, ["mcp-smoke.mjs"], { token: E2E_TOKENS.agent.token });
    exec("mcp-revoked", process.execPath, ["mcp-smoke.mjs", "revoked"], { token: E2E_TOKENS.revoked.token });
    results.push({ name: "MCP", status: "passed" });
    receipt();

    const installed = [
      { name: "playwright", command: "./node_modules/.bin/playwright", args: ["test"] },
      { name: "jest", command: "./node_modules/.bin/jest", args: ["--runInBand"] },
      { name: "cypress", command: "./node_modules/.bin/cypress", args: ["run", "--headless"] },
      { name: "pytest", command: "./python/bin/python", args: ["-m", "pytest", "-q", "test_consumer.py"] },
    ];
    for (const { name, command, args } of installed) {
      const count = async () => Number((await database`SELECT count(*) FROM run_results`)[0].count);
      const before = await count();
      exec(`${name}-valid`, command, args, { token: E2E_TOKENS.ciWrite.token, expected: /uploaded 1 result/ });
      assert.equal(await count(), before + 1, `${name} must persist one run result`);
      exec(`${name}-revoked`, command, args, { token: E2E_TOKENS.revoked.token, expected: /upload failed:.*401/i });
      assert.equal(await count(), before + 1, `${name} must reject revoked-token writes`);
      results.push({ name, status: "passed", valid: 1, revoked: 0 });
      receipt();
    }
  } finally {
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
    writeFileSync(path.join(output, "consumer-server.log"), redact(log, secrets));
    await database.end({ timeout: 5 });
  }
}

function checksum(file: string) {
  return "sha256:" + createHash("sha256").update(readFileSync(file)).digest("hex");
}
