import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { assertOwnedDatabase, redact } from "./safety";

export async function evaluateContainer(options: {
  project: string; databaseUrl: string; created: ReadonlySet<string>; secret: string; output: string;
}) {
  const { project, secret, output } = options;
  const database = new URL(options.databaseUrl);
  assertOwnedDatabase(database.pathname.slice(1), options.created);
  const image = `${project}-app:local`, container = `${project}-app`, volume = `${project}-attachments`;
  let built = false, started = false, storage = false;
  const docker = (args: string[], input?: string) => execFileSync("docker", args, { encoding: "utf8", input, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 }).trim();
  let log = "";
  const sql = postgres(database.toString(), { max: 1 });
  const local = new URL(database); local.hostname = "postgres"; local.port = "5432";
  const health = async () => {
    const port = docker(["port", container, "4317"]).split(":").at(-1);
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try { const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) }); if (response.status === 200) return url; } catch { /* service readiness, not test retry */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Production image failed health preflight");
  };
  try {
    log += docker(["build", "--label", `org.topology.validation=${project}`, "-t", image, "."]);
    built = true;
    docker(["volume", "create", "--label", `org.topology.validation=${project}`, volume]); storage = true;
    docker(["run", "-d", "--name", container, "--network", `${project}_default`, "-p", "127.0.0.1::4317",
      "--mount", `type=volume,src=${volume},dst=/data/attachments`, "-e", `DATABASE_URL=${local}`, "-e", `AUTH_SECRET=${secret}`,
      "-e", "AUTH_URL=http://127.0.0.1:4317", "-e", "TOPOLOGY_ISSUE_PROVIDER=mock", image]);
    started = true;
    let url = await health();
    assert.equal(docker(["exec", container, "id", "-u"]), "1000");
    assert.deepEqual(await (await fetch(`${url}/api/setup`)).json(), { needsSetup: true });
    const setup = await fetch(`${url}/api/setup`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Container admin", email: "container@validation.test", password: "validation-container-password" }) });
    assert.equal(setup.status, 200);
    docker(["exec", container, "node", "-e", "require('node:fs').writeFileSync('/data/attachments/persistence.txt', 'container persistence')"]);
    docker(["stop", container]);
    // Simulate a complete push-era schema with no migration journal, only in
    // this harness-owned database. This forces the shipped reconcile SQL path.
    await sql`DROP SCHEMA drizzle CASCADE`;
    docker(["start", container]);
    url = await health();
    assert.deepEqual(await (await fetch(`${url}/api/setup`)).json(), { needsSetup: false });
    assert.equal(docker(["exec", container, "cat", "/data/attachments/persistence.txt"]), "container persistence");
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    const [{ admins }] = await sql`SELECT count(*)::int AS admins FROM users WHERE email = 'container@validation.test'`;
    assert.equal(n, 7); assert.equal(admins, 1);
    console.log(JSON.stringify({ operation: "production image fresh install, first admin, non-root runtime, unstamped reconciliation and attachment persistence", status: "passed", imageBytes: Number(docker(["image", "inspect", image, "--format", "{{.Size}}"])), migrations: n }));
  } finally {
    try {
      if (started) { log += "\n" + docker(["logs", container]); docker(["rm", "-f", container]); }
      if (storage) docker(["volume", "rm", volume]);
      if (built) docker(["image", "rm", image]);
    } finally {
      writeFileSync(path.join(output, "container.log"), redact(log, [secret, local.toString(), "validation-container-password"]));
      await sql.end({ timeout: 5 });
    }
  }
}
