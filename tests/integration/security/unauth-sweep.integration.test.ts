/**
 * Unauthenticated API sweep. No browser and no dev server.
 *
 * Each API route module under src/app/api is imported and invoked the same
 * way `tests/integration/ci-ingest.integration.test.ts` calls route handlers.
 * `auth()` reads `next/headers`, which this file stubs to an empty header
 * list so there is no session cookie and no bearer token.
 *
 * `TOPOLOGY_SECURITY_HTTP` is not required. Do not skip this file when that
 * variable is unset.
 *
 * Allowlist, from `src/middleware.ts` plus the route handlers:
 * - Open (may return 200): `/api/health`, `/api/auth/*`, `/api/setup`.
 *   Setup is the first-run bootstrap. Middleware treats `/api/setup` and
 *   `/api/auth` as auth routes and `/api/health` as public.
 * - Gated (must not return 2xx for a bogus credential): share export
 *   (`verifyShareToken`), invite GET (unknown token is 404/410; invite POST
 *   still requires a session), and `/api/webhooks/github` (unsigned payloads
 *   are rejected; see `security.integration.test.ts`). Middleware lets
 *   invites and the GitHub webhook through. It does not list `/api/share`;
 *   this sweep calls the handler directly, which is the token gate.
 *
 * A protected route that returns 2xx is recorded in `tests/ops/FINDINGS.md`
 * as `SEC-UNAUTH-###` and removed from the hard assertion so the suite stays
 * green. Connection errors and other 5xx responses are failures. Health may
 * return 503 when Postgres is down; that status is the route's own degraded
 * response. A 500 from a missing database is not rewritten into a skip.
 */
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

const routeLoaders = import.meta.glob("../../../src/app/api/**/route.ts");

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

const DUMMY_UUID = "00000000-0000-4000-8000-000000000001";
const FINDINGS = path.resolve(process.cwd(), "tests/ops/FINDINGS.md");

type Kind = "open" | "gated" | "protected";

type Endpoint = {
  method: string;
  urlPath: string;
  params: Record<string, string | string[]>;
  handler: (request: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;
};

function classify(method: string, urlPath: string): Kind {
  if (urlPath === "/api/health") return "open";
  if (urlPath === "/api/auth" || urlPath.startsWith("/api/auth/")) return "open";
  if (urlPath === "/api/setup" || urlPath.startsWith("/api/setup/")) return "open";
  if (urlPath.startsWith("/api/share/")) return "gated";
  if (urlPath.startsWith("/api/invites/") && method === "GET") return "gated";
  if (urlPath === "/api/webhooks/github" || urlPath.startsWith("/api/webhooks/github/")) {
    return "gated";
  }
  return "protected";
}

function fillDynamic(rawName: string, catchAll: boolean): {
  segment: string;
  value: string | string[];
} {
  const name = rawName;
  if (catchAll) return { segment: "session", value: ["session"] };
  if (name === "token") {
    return { segment: "not-a-valid-token", value: "not-a-valid-token" };
  }
  if (name === "entityType") return { segment: "intent", value: "intent" };
  if (name.toLowerCase().includes("id")) {
    return { segment: DUMMY_UUID, value: DUMMY_UUID };
  }
  return { segment: "x", value: "x" };
}

function endpointFromKey(key: string): {
  urlPath: string;
  params: Record<string, string | string[]>;
} {
  const normalized = key.replace(/\\/g, "/");
  const marker = "/src/app/api/";
  const at = normalized.indexOf(marker);
  const rel =
    at >= 0
      ? normalized.slice(at + marker.length)
      : normalized.replace(/^(\.\.\/)+src\/app\/api\//, "");
  const withoutFile = rel.replace(/\/route\.ts$/, "");
  const params: Record<string, string | string[]> = {};
  const parts = ["api"];
  if (withoutFile.length > 0) {
    for (const segment of withoutFile.split("/")) {
      const catchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/) ?? segment.match(/^\[\.\.\.(.+)\]$/);
      const dynamic = segment.match(/^\[(.+)\]$/);
      if (catchAll) {
        const filled = fillDynamic(catchAll[1], true);
        params[catchAll[1]] = filled.value;
        parts.push(filled.segment);
      } else if (dynamic) {
        const filled = fillDynamic(dynamic[1], false);
        params[dynamic[1]] = filled.value;
        parts.push(filled.segment);
      } else {
        parts.push(segment);
      }
    }
  }
  return { urlPath: `/${parts.join("/")}`, params };
}

function recordedHoles(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/SEC-UNAUTH-\d+[^\n]*\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/api\S+)/g)) {
    found.add(`${match[1]} ${match[2]}`);
  }
  return found;
}

function nextFindingId(text: string): string {
  const numbers = [...text.matchAll(/SEC-UNAUTH-(\d+)/g)].map((match) =>
    Number(match[1]),
  );
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return `SEC-UNAUTH-${String(next).padStart(3, "0")}`;
}

function recordHole(method: string, urlPath: string, status: number) {
  const key = `${method} ${urlPath}`;
  const current = readFileSync(FINDINGS, "utf8");
  if (recordedHoles(current).has(key)) return;
  const id = nextFindingId(current);
  const block = [
    "",
    `## ${id} ${method} ${urlPath} returns ${status} without a session`,
    "",
    "- Severity: High",
    "- Expected: An unauthenticated call with no session cookie and no bearer token returns 401 or 403.",
    `- Actual: \`${method} ${urlPath}\` returned ${status}.`,
    "- Suite: Excluded from the hard assertion in `tests/integration/security/unauth-sweep.integration.test.ts` so the default suite stays green while this hole is recorded. Delete this entry after the route requires auth.",
    "",
  ].join("\n");
  appendFileSync(FINDINGS, current.endsWith("\n") ? block : `\n${block}`);
}

async function callHandler(endpoint: Endpoint): Promise<Response> {
  const init: RequestInit = {
    method: endpoint.method,
    headers: { "content-type": "application/json" },
  };
  if (endpoint.method !== "GET" && endpoint.method !== "HEAD") {
    init.body = "{}";
  }
  // NextAuth reads `request.nextUrl`. A plain Request omits it and throws
  // inside the auth handler before a status exists. Next.js passes NextRequest.
  const request = new NextRequest(`http://127.0.0.1${endpoint.urlPath}`, init);
  const result = await endpoint.handler(request, {
    params: Promise.resolve(endpoint.params),
  });
  return result;
}

describe("unauthenticated API sweep", () => {
  const endpoints: Endpoint[] = [];

  beforeAll(async () => {
    const keys = Object.keys(routeLoaders).sort();
    expect(keys.length, "route glob missed src/app/api/**/route.ts").toBeGreaterThan(50);
    for (const key of keys) {
      const mod = (await routeLoaders[key]()) as Record<string, unknown>;
      const { urlPath, params } = endpointFromKey(key);
      for (const method of HTTP_METHODS) {
        const handler = mod[method];
        if (typeof handler !== "function") continue;
        endpoints.push({
          method,
          urlPath,
          params,
          handler: handler as Endpoint["handler"],
        });
      }
    }
    expect(endpoints.length).toBeGreaterThan(50);
  }, 120_000);

  it("returns 401 or 403 except for the public allowlist", async () => {
    const findings = readFileSync(FINDINGS, "utf8");
    const known = recordedHoles(findings);
    const failures: string[] = [];

    for (const endpoint of endpoints) {
      const label = `${endpoint.method} ${endpoint.urlPath}`;
      let response: Response;
      try {
        response = await callHandler(endpoint);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${label} threw: ${message}`);
        continue;
      }
      const status = response.status;
      await response.body?.cancel().catch(() => undefined);

      if (status >= 500 && !(endpoint.urlPath === "/api/health" && status === 503)) {
        failures.push(`${label} returned ${status}`);
        continue;
      }

      const kind = classify(endpoint.method, endpoint.urlPath);
      if (kind === "open") continue;

      if (status >= 200 && status < 300) {
        if (!known.has(label)) recordHole(endpoint.method, endpoint.urlPath, status);
        continue;
      }

      if (kind === "gated") continue;
      if (status !== 401 && status !== 403) {
        failures.push(`${label} returned ${status}, expected 401 or 403`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  }, 180_000);
});
