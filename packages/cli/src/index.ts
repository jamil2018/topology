import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  mergeShardResults,
  normalizeJUnitCases,
  parseJUnitXml,
  summarizeResults,
  type NormalizedResult,
} from "@topology/domain";

type Json = Record<string, unknown>;

function usage(): never {
  console.log(`Topology CLI

Usage:
  topology junit submit <file> [--run-id <id>] [--name <name>] [--source github|jenkins|cli]
  topology runs create --name <name> [--source github|jenkins|cli] [--branch <b>] [--sha <sha>] [--shards <n>]
  topology runs submit-thread --run-id <id> --shard <i> --file <junit.xml>
  topology runs complete --run-id <id>

Env:
  TOPOLOGY_URL          Base URL (default http://127.0.0.1:4317)
  TOPOLOGY_API_TOKEN    Bearer token for /api/ci/*
`);
  process.exit(1);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
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
  return normalizeJUnitCases(parseJUnitXml(raw).cases);
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
  const shards = Number(getFlag(args, "--shards") ?? "1");

  const data = await api("POST", "/api/ci/runs", {
    name,
    source,
    branch,
    commitSha,
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

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;
  if (!cmd) usage();

  if (cmd === "junit" && sub === "submit") {
    await cmdJunitSubmit(rest);
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

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
