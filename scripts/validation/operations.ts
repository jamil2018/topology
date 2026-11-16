import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import postgres from "postgres";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { runMigrations } from "../../src/db/migrator";
import { assertOwnedDatabase } from "./safety";

export async function evaluateOperations(options: {
  adminUrl: string; runId: string; created: Set<string>; compose: string[]; temporaryRoot: string; s3Endpoint: string; bucket: string;
}) {
  const { adminUrl, runId, created, compose, temporaryRoot } = options;
  const url = new URL(adminUrl);
  const migration = `topology_validation_${runId}_migration`;
  const restore = `topology_validation_${runId}_restore`;
  assertOwnedDatabase(migration, created); assertOwnedDatabase(restore, created);
  url.pathname = `/${migration}`;
  const migrationUrl = url.toString();
  const prior = path.join(temporaryRoot, "prior-migrations");
  cpSync("drizzle", prior, { recursive: true });
  const journalFile = path.join(prior, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalFile, "utf8"));
  journal.entries.pop();
  writeFileSync(journalFile, JSON.stringify(journal));
  await runMigrations({ databaseUrl: migrationUrl, migrationsFolder: prior });
  const sql = postgres(migrationUrl, { max: 1 });
  let runIdPersisted: string;
  try {
    const [workspace] = await sql`INSERT INTO workspaces (name, slug) VALUES ('Upgrade evidence', 'upgrade') RETURNING id`;
    const [run] = await sql`INSERT INTO runs (workspace_id, name) VALUES (${workspace.id}, 'Preserved report') RETURNING id`;
    runIdPersisted = run.id;
    await runMigrations({ databaseUrl: migrationUrl });
    await runMigrations({ databaseUrl: migrationUrl });
    const [upgraded] = await sql`SELECT share_generation, name FROM runs WHERE id = ${run.id}`;
    assert.equal(upgraded.share_generation, 0);
    assert.equal(upgraded.name, "Preserved report");
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    assert.equal(n, journal.entries.length + 1);
  } finally { await sql.end({ timeout: 5 }); }
  const container = execFileSync("docker", [...compose, "ps", "-q", "postgres"], { encoding: "utf8" }).trim();
  const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "validation", "-d", migration, "--format=custom"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", "validation", "-d", restore, "--exit-on-error"], { input: dump });
  url.pathname = `/${restore}`;
  const restored = postgres(url.toString(), { max: 1 });
  try {
    const [run] = await restored`SELECT name, share_generation FROM runs WHERE id = ${runIdPersisted}`;
    assert.equal(run.name, "Preserved report"); assert.equal(run.share_generation, 0);
    const [{ n }] = await restored`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    assert.equal(n, journal.entries.length + 1);
  } finally { await restored.end({ timeout: 5 }); }
  const s3 = new S3Client({ endpoint: options.s3Endpoint, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "validation", secretAccessKey: "validation-local-only" } });
  let restartedEndpoint = options.s3Endpoint;
  try {
    const body = `Persistence marker ${runId}`;
    await s3.send(new PutObjectCommand({ Bucket: options.bucket, Key: "persistence.txt", Body: body }));
    execFileSync("docker", [...compose, "restart", "postgres", "minio"]);
    execFileSync("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60", "postgres", "minio"]);
    // Docker may allocate new ephemeral host ports when a container restarts.
    const port = (service: string, target: string) => execFileSync("docker", [...compose, "port", service, target], { encoding: "utf8" }).trim().split(":").at(-1)!;
    const postgresPort = port("postgres", "5432");
    const endpoint = new URL(options.s3Endpoint);
    endpoint.port = port("minio", "9000");
    url.port = postgresPort;
    const persisted = postgres(url.toString(), { max: 1, connect_timeout: 10 });
    try {
      const [run] = await persisted`SELECT name FROM runs WHERE id = ${runIdPersisted}`;
      assert.equal(run.name, "Preserved report");
    } finally { await persisted.end(); }
    const afterRestart = new S3Client({ endpoint: endpoint.origin, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: "validation", secretAccessKey: "validation-local-only" } });
    try {
      const stored = await afterRestart.send(new GetObjectCommand({ Bucket: options.bucket, Key: "persistence.txt" }));
      assert.equal(await stored.Body?.transformToString(), body);
    } finally { afterRestart.destroy(); }
    restartedEndpoint = endpoint.origin;
  } finally { s3.destroy(); }
  console.log(JSON.stringify({ operation: "prior-version upgrade, migration idempotency, custom pg_dump/pg_restore, database/object persistence after restart", status: "passed", dumpBytes: dump.length }));
  return { postgresPort: url.port, s3Endpoint: restartedEndpoint };
}
