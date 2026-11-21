#!/usr/bin/env node
/**
 * Make local Postgres reachable before the app starts.
 * Starts Colima when the Docker daemon is down, then `docker compose up -d`.
 * Skips Compose when DATABASE_URL (from env / .env.local) or the Compose port
 * 127.0.0.1:54329 is already accepting connections.
 *
 * Cross-platform replacement for the previous bash-only predev gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_HOST = "127.0.0.1";
const COMPOSE_PORT = 54329;
const CONTAINER = "topology-postgres";

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function portOpen(host, port, timeoutMs = 750) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function parseDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || 5432),
    };
  } catch {
    return null;
  }
}

function commandExists(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: false,
  });
  return result.status === 0;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

function runCapture(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

function composeArgs(args) {
  const plugin = runCapture("docker", ["compose", "version"]);
  if (plugin.status === 0) return ["docker", ["compose", ...args]];
  if (commandExists("docker-compose")) return ["docker-compose", args];
  die("Docker Compose is required. Install Docker Desktop or the Compose plugin.");
}

function compose(args) {
  const [command, fullArgs] = composeArgs(args);
  const result = run(command, fullArgs);
  if (result.status !== 0) {
    die(`docker compose ${args.join(" ")} failed`);
  }
}

function dockerInfoOk() {
  const result = runCapture("docker", ["info"]);
  return result.status === 0;
}

function ensureDocker() {
  if (!commandExists("docker")) {
    die("Docker is required to run Postgres. Install Docker Desktop or Colima.");
  }

  if (dockerInfoOk()) {
    composeArgs(["version"]);
    return;
  }

  if (commandExists("colima")) {
    console.log("Docker is not running. Starting Colima...");
    const started = run("colima", ["start"]);
    if (started.status !== 0) {
      die("Failed to start Colima.");
    }
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      if (dockerInfoOk()) {
        console.log("Docker is ready");
        composeArgs(["version"]);
        return;
      }
      sleepSync(2000);
    }
    die("Colima started but the Docker daemon is still unavailable.");
  }

  die("Docker is installed but not running. Start Docker Desktop or Colima, then re-run.");
}

function containerStatus() {
  const inspect = runCapture("docker", [
    "inspect",
    "-f",
    "{{.State.Status}}",
    CONTAINER,
  ]);
  if (inspect.status !== 0) return null;
  return (inspect.stdout || "").trim();
}

function preparePostgresContainer() {
  const status = containerStatus();
  if (status === null) return;
  if (status === "running") {
    console.log(`Postgres container ${CONTAINER} is already running`);
    return;
  }
  console.log(
    `Removing stopped container ${CONTAINER} so Compose can recreate it (data volume is kept)`,
  );
  const removed = runCapture("docker", ["rm", CONTAINER]);
  if (removed.status !== 0) {
    die(`Failed to remove stopped container ${CONTAINER}`);
  }
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const ready = runCapture("docker", [
      "exec",
      CONTAINER,
      "pg_isready",
      "-U",
      "topology",
      "-d",
      "topology",
    ]);
    if (ready.status === 0) {
      console.log("Postgres is ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  die("Postgres did not become ready. Check 'docker compose ps' and 'docker compose logs postgres'.");
}

function applyMigrations() {
  if (!existsSync(path.join(ROOT, "node_modules"))) return;
  const fileEnv = loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.DATABASE_URL && !fileEnv.DATABASE_URL && !existsSync(path.join(ROOT, ".env.local"))) {
    return;
  }
  console.log("Applying database migrations");
  const result = run("npm", ["run", "db:migrate"], {
    env: { ...process.env, ...fileEnv },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    die("Database migrations failed");
  }
}

async function main() {
  if (process.env.SKIP_ENSURE_POSTGRES === "1") {
    console.log("SKIP_ENSURE_POSTGRES=1; leaving Postgres as-is");
    return;
  }

  const fileEnv = loadEnvFile(path.join(ROOT, ".env.local"));
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const targets = [{ host: COMPOSE_HOST, port: COMPOSE_PORT }];

  if (databaseUrl) {
    const parsed = parseDatabaseUrl(databaseUrl);
    if (
      parsed &&
      !(parsed.host === COMPOSE_HOST && parsed.port === COMPOSE_PORT)
    ) {
      targets.unshift(parsed);
    }
  }

  for (const target of targets) {
    if (await portOpen(target.host, target.port)) {
      console.log(`Postgres is already reachable on ${target.host}:${target.port}`);
      applyMigrations();
      return;
    }
  }

  ensureDocker();
  preparePostgresContainer();

  const status = containerStatus();
  if (status !== "running") {
    compose(["up", "-d"]);
  }
  await waitForPostgres();
  applyMigrations();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
