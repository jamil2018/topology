import {
  assertSafeWebhookDestination,
  type WebhookDnsLookup,
} from "@/lib/webhooks";
import type { ImportApiConfig, ImportProvider } from "./types";
import { parseTestRailJson } from "./testrail";

export type VendorFetch = typeof fetch;

const MAX_PAGES = 40;
const FETCH_TIMEOUT_MS = 12_000;
const IMPORT_API_PRIVATE =
  "Import API URL must not target a local or private address";

export type VendorApiDeps = {
  fetch?: VendorFetch;
  lookup?: WebhookDnsLookup;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function assertSafeUrl(
  raw: string,
  lookup?: WebhookDnsLookup,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await assertSafeWebhookDestination(raw, lookup);
  if (!check.ok) {
    return { ok: false, error: IMPORT_API_PRIVATE };
  }
  return { ok: true };
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  deps: VendorApiDeps,
): Promise<unknown> {
  const safe = await assertSafeUrl(url, deps.lookup);
  if (!safe.ok) throw new Error(safe.error);

  const fetchFn = deps.fetch ?? fetch;
  const reccheck = await assertSafeUrl(url, deps.lookup);
  if (!reccheck.ok) throw new Error(reccheck.error);

  const res = await fetchFn(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error("Import API refused a redirect");
  }
  if (!res.ok) {
    throw new Error(`Import API returned HTTP ${res.status}`);
  }
  return res.json();
}

function encodeBasic(email: string, token: string): string {
  return Buffer.from(`${email}:${token}`).toString("base64");
}

async function fetchTestRail(
  config: ImportApiConfig,
  deps: VendorApiDeps,
): Promise<string> {
  const base = trimSlash(config.baseUrl);
  const project = config.project?.trim();
  if (!project) throw new Error("TestRail project id is required");
  if (!config.email?.trim()) throw new Error("TestRail email is required");
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${encodeBasic(config.email.trim(), config.token)}`,
  };

  const cases: unknown[] = [];
  let offset = 0;
  const limit = 250;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${base}/index.php?/api/v2/get_cases/${encodeURIComponent(project)}&limit=${limit}&offset=${offset}`;
    const payload = await fetchJson(url, headers, deps);
    const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const batch = Array.isArray(payload)
      ? payload
      : Array.isArray(rec?.cases)
        ? rec.cases
        : [];
    cases.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  let sections: unknown = [];
  try {
    const sectionPayload = await fetchJson(
      `${base}/index.php?/api/v2/get_sections/${encodeURIComponent(project)}`,
      headers,
      deps,
    );
    const rec =
      sectionPayload && typeof sectionPayload === "object"
        ? (sectionPayload as Record<string, unknown>)
        : null;
    sections = Array.isArray(sectionPayload)
      ? sectionPayload
      : (rec?.sections ?? []);
  } catch {
    sections = [];
  }

  const combined = { cases, sections };
  parseTestRailJson(combined);
  return JSON.stringify(combined);
}

async function fetchQase(
  config: ImportApiConfig,
  deps: VendorApiDeps,
): Promise<string> {
  const base = trimSlash(config.baseUrl || "https://api.qase.io");
  const project = config.project?.trim();
  if (!project) throw new Error("Qase project code is required");
  const headers = {
    Accept: "application/json",
    Token: config.token,
  };
  const entities: unknown[] = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${base}/v1/case/${encodeURIComponent(project)}?limit=${limit}&offset=${offset}`;
    const payload = await fetchJson(url, headers, deps);
    const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const result = rec?.result && typeof rec.result === "object"
      ? (rec.result as Record<string, unknown>)
      : rec;
    const batch = Array.isArray(result?.entities) ? result.entities : [];
    entities.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return JSON.stringify({ result: { entities } });
}

async function fetchZephyr(
  config: ImportApiConfig,
  deps: VendorApiDeps,
): Promise<string> {
  const base = trimSlash(config.baseUrl || "https://api.zephyrscale.smartbear.com/v2");
  const project = config.project?.trim();
  if (!project) throw new Error("Zephyr Scale project key is required");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${config.token}`,
  };
  const values: unknown[] = [];
  let startAt = 0;
  const maxResults = 100;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${base}/testcases?projectKey=${encodeURIComponent(project)}&maxResults=${maxResults}&startAt=${startAt}`;
    const payload = await fetchJson(url, headers, deps);
    const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const batch = Array.isArray(payload)
      ? payload
      : Array.isArray(rec?.values)
        ? rec.values
        : [];
    values.push(...batch);
    if (batch.length < maxResults) break;
    startAt += maxResults;
  }
  return JSON.stringify({ values });
}

export async function fetchVendorCases(
  provider: ImportProvider,
  config: ImportApiConfig,
  deps: VendorApiDeps = {},
): Promise<string> {
  if (provider === "xray") {
    throw new Error(
      "Xray Cloud API import is not supported; upload a CSV or JSON export",
    );
  }
  const baseUrl = config.baseUrl?.trim();
  if (provider === "testrail" && !baseUrl) {
    throw new Error("API base URL is required");
  }
  if (!config.token?.trim()) throw new Error("API token is required");
  if (baseUrl) {
    const safe = await assertSafeUrl(baseUrl, deps.lookup);
    if (!safe.ok) throw new Error(safe.error);
  }

  switch (provider) {
    case "testrail":
      return fetchTestRail(config, deps);
    case "qase":
      return fetchQase({ ...config, baseUrl: baseUrl || "https://api.qase.io" }, deps);
    case "zephyr":
      return fetchZephyr(
        {
          ...config,
          baseUrl: baseUrl || "https://api.zephyrscale.smartbear.com/v2",
        },
        deps,
      );
  }
}
