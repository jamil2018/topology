import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  dedupeNormalizedResults,
  mergeShardResults,
  normalizeJUnitCases,
  parseExecutionReport,
  parseJUnitXml,
  summarizeResults,
  type NormalizedResult,
} from "@topology/domain";

type Json = Record<string, unknown>;

function usage(): never {
  console.log(`Topology CLI

Usage:
  topology junit submit <file> [--run-id <id>] [--name <name>] [--source github|jenkins|cli]
  topology run upload <file.json>
  topology runs create --name <name> [--source github|jenkins|cli] [--branch <b>] [--sha <sha>] [--pr <n>] [--shards <n>]
  topology runs submit-thread --run-id <id> --shard <i> --file <junit.xml>
  topology runs complete --run-id <id>
  topology affected --path <p> [--path <p>...] [--paths a,b] [--rule <pattern=componentKey>]...
  topology release analyze [--file input.json]
  topology release compare --before a.json --after b.json
  topology query '<dsl>'

Examples:
  topology query 'intents where component = payments and criticality = P0'
  topology query 'requirements where key in ("REQ-1", "REQ-2") order by key desc'
  topology query 'implementations where type = playwright and framework exists'
  topology query 'executions where status = failed and branch = main'

Env:
  TOPOLOGY_URL          Base URL (default http://127.0.0.1:4317)
  TOPOLOGY_API_TOKEN    Bearer token for /api/ci/*, /api/executions, /api/affected, /api/releases/*, /api/query
`);
  process.exit(1);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

/** Collect all values for a repeated flag (e.g. --path a --path b). */
function getFlags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1] && !args[i + 1]!.startsWith("-")) {
      values.push(args[i + 1]!);
      i += 1;
    }
  }
  return values;
}

function requireFlag(args: string[], name: string): string {
  const value = getFlag(args, name);
  if (!value) {
    console.error(`Missing required flag ${name}`);
    usage();
  }
  return value;
}

function baseUrl(): string {
  return (process.env.TOPOLOGY_URL ?? "http://127.0.0.1:4317").replace(
    /\/$/,
    "",
  );
}

function token(): string {
  const value = process.env.TOPOLOGY_API_TOKEN;
  if (!value) {
    console.error("TOPOLOGY_API_TOKEN is required");
    process.exit(1);
  }
  return value;
}

async function api(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<Json> {
  const res = await fetch(`${baseUrl()}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? (JSON.parse(text) as Json) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status}`, data);
    process.exit(1);
  }
  return data;
}

async function loadJUnit(filePath: string): Promise<NormalizedResult[]> {
  const absolute = path.resolve(filePath);
  const raw = await readFile(absolute, "utf8");
  return dedupeNormalizedResults(normalizeJUnitCases(parseJUnitXml(raw).cases));
}

async function cmdJunitSubmit(args: string[]) {
  const file = args[0];
  if (!file || file.startsWith("-")) usage();

  const results = await loadJUnit(file);
  const summary = summarizeResults(results);
  const runId = getFlag(args, "--run-id");
  const name =
    getFlag(args, "--name") ??
    `JUnit ${path.basename(file)} ${new Date().toISOString()}`;
  const source = getFlag(args, "--source") ?? "cli";

  const data = await api("POST", "/api/ci/junit", {
    runId,
    name,
    source,
    results,
    summary,
  });

  console.log(JSON.stringify({ ok: true, summary, ...data }, null, 2));
}

async function cmdRunsCreate(args: string[]) {
  const name = requireFlag(args, "--name");
  const source = getFlag(args, "--source") ?? "cli";
  const branch = getFlag(args, "--branch");
  const commitSha = getFlag(args, "--sha");
  const prRaw = getFlag(args, "--pr");
  const shards = Number(getFlag(args, "--shards") ?? "1");

  let pr: number | undefined;
  if (prRaw != null) {
    pr = Number(prRaw);
    if (!Number.isInteger(pr) || pr < 1) {
      console.error(`Invalid --pr ${prRaw} (expected positive integer)`);
      process.exit(1);
    }
  }

  const data = await api("POST", "/api/ci/runs", {
    name,
    source,
    branch,
    commitSha,
    ...(pr != null ? { pr } : {}),
    shardTotal: Number.isFinite(shards) ? shards : 1,
  });

  console.log(JSON.stringify(data, null, 2));
}

async function cmdSubmitThread(args: string[]) {
  const runId = requireFlag(args, "--run-id");
  const shard = Number(requireFlag(args, "--shard"));
  const file = requireFlag(args, "--file");
  const results = await loadJUnit(file);

  const data = await api("POST", `/api/ci/runs/${runId}/shards`, {
    shardIndex: shard,
    results,
    summary: summarizeResults(results),
  });

  console.log(JSON.stringify(data, null, 2));
}

async function cmdComplete(args: string[]) {
  const runId = requireFlag(args, "--run-id");
  const data = await api("POST", `/api/ci/runs/${runId}/complete`, {});
  console.log(JSON.stringify(data, null, 2));
}

/** Local helper for operators merging shard files without a server round-trip. */
async function cmdMergeLocal(args: string[]) {
  const files = args.filter((a) => !a.startsWith("-"));
  if (files.length === 0) usage();
  const shards = await Promise.all(files.map(loadJUnit));
  const merged = mergeShardResults(shards);
  console.log(
    JSON.stringify(
      { results: merged, summary: summarizeResults(merged) },
      null,
      2,
    ),
  );
}

async function cmdRunUpload(args: string[]) {
  const file = args[0];
  if (!file || file.startsWith("-")) usage();

  const absolute = path.resolve(file);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(absolute, "utf8")) as unknown;
  } catch (err) {
    console.error(
      `Failed to read JSON report ${absolute}:`,
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  const parsed = parseExecutionReport(raw);
  if (!parsed.ok) {
    console.error("Invalid execution report:");
    for (const issue of parsed.errors) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const data = await api("POST", "/api/executions", parsed.report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        results: parsed.report.results.length,
        ...data,
      },
      null,
      2,
    ),
  );
}

function collectAffectedPaths(args: string[]): string[] {
  const fromRepeated = getFlags(args, "--path");
  const csv = getFlag(args, "--paths");
  const fromCsv = csv
    ? csv
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  return [...new Set([...fromRepeated, ...fromCsv])];
}

function collectAffectedRules(
  args: string[],
): { pattern: string; componentKey: string }[] {
  const rules: { pattern: string; componentKey: string }[] = [];
  for (const raw of getFlags(args, "--rule")) {
    const eq = raw.indexOf("=");
    if (eq <= 0 || eq === raw.length - 1) {
      console.error(
        `Invalid --rule ${raw} (expected pattern=componentKey, e.g. src/auth/=COMP-AUTH)`,
      );
      process.exit(1);
    }
    rules.push({
      pattern: raw.slice(0, eq),
      componentKey: raw.slice(eq + 1),
    });
  }
  return rules;
}

async function cmdAffected(args: string[]) {
  const paths = collectAffectedPaths(args);
  if (paths.length === 0) {
    console.error("Provide at least one --path <p> or --paths a,b");
    usage();
  }

  const rules = collectAffectedRules(args);
  const data = await api("POST", "/api/affected", {
    paths,
    ...(rules.length > 0 ? { rules } : {}),
  });
  console.log(JSON.stringify(data, null, 2));
}

async function loadJsonFile(filePath: string): Promise<unknown> {
  const absolute = path.resolve(filePath);
  try {
    return JSON.parse(await readFile(absolute, "utf8")) as unknown;
  } catch (err) {
    console.error(
      `Failed to read JSON ${absolute}:`,
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
}

/** Workspace mode when no --file; otherwise POST precomputed ReleaseQualityInput. */
async function cmdReleaseAnalyze(args: string[]) {
  const file = getFlag(args, "--file");
  const body = file ? await loadJsonFile(file) : {};
  const data = await api("POST", "/api/releases/analyze", body);
  console.log(JSON.stringify(data, null, 2));
}

async function cmdReleaseCompare(args: string[]) {
  const beforePath = requireFlag(args, "--before");
  const afterPath = requireFlag(args, "--after");
  const before = await loadJsonFile(beforePath);
  const after = await loadJsonFile(afterPath);
  const data = await api("POST", "/api/releases/compare", { before, after });
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;
  if (!cmd) usage();

  if (cmd === "junit" && sub === "submit") {
    await cmdJunitSubmit(rest);
    return;
  }
  if (cmd === "run" && sub === "upload") {
    await cmdRunUpload(rest);
    return;
  }
  if (cmd === "runs" && sub === "create") {
    await cmdRunsCreate(rest);
    return;
  }
  if (cmd === "runs" && sub === "submit-thread") {
    await cmdSubmitThread(rest);
    return;
  }
  if (cmd === "runs" && sub === "complete") {
    await cmdComplete(rest);
    return;
  }
  if (cmd === "junit" && sub === "merge-local") {
    await cmdMergeLocal(rest);
    return;
  }
  if (cmd === "affected") {
    // `topology affected --path …` — sub may be a flag
    const affectedArgs =
      sub === undefined ? rest : sub.startsWith("-") ? [sub, ...rest] : rest;
    if (sub !== undefined && !sub.startsWith("-")) {
      usage();
    }
    await cmdAffected(affectedArgs);
    return;
  }
  if (cmd === "release" && sub === "analyze") {
    await cmdReleaseAnalyze(rest);
    return;
  }
  if (cmd === "release" && sub === "compare") {
    await cmdReleaseCompare(rest);
    return;
  }
  if (cmd === "query") {
    const dsl = sub ? [sub, ...rest] : rest;
    await cmdQuery(dsl);
    return;
  }

  usage();
}

async function cmdQuery(args: string[]) {
  const dsl = args[0];
  if (!dsl || dsl.startsWith("-")) {
    console.error("Missing DSL argument");
    usage();
  }
  const data = await api("POST", "/api/query", { dsl });
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
