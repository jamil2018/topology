/**
 * Discover every exported route method at collection time. Public routes have
 * an explicit allowlist; token-gated routes must reject dummy credentials.
 * Every unexpected unauthenticated success and server exception fails. This
 * suite never edits a findings file or exempts previously recorded defects.
 */
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
  // Inbound issue-tracker webhooks are signature-gated (not session auth), same as GitHub.
  if (urlPath === "/api/webhooks/issues" || urlPath.startsWith("/api/webhooks/issues/")) {
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
        failures.push(`${label} returned unauthenticated success ${status}`);
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
