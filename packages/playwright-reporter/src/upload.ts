import {
  parseExecutionReport,
  type ExecutionReport,
} from "@topology/domain";

export type UploadConfig = {
  baseUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
};

export type UploadResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; error: string; status?: number; body?: unknown };

export function resolveUploadConfig(
  env: NodeJS.ProcessEnv = process.env,
): UploadConfig | { error: string } {
  const apiToken = env.TOPOLOGY_API_TOKEN?.trim();
  if (!apiToken) {
    return { error: "TOPOLOGY_API_TOKEN is required to upload execution reports" };
  }
  const baseUrl = (env.TOPOLOGY_URL ?? "http://127.0.0.1:4317").replace(
    /\/$/,
    "",
  );
  return { baseUrl, apiToken };
}

/** Validate then POST ExecutionReport to TOPOLOGY_URL/api/executions. */
export async function uploadExecutionReport(
  report: ExecutionReport,
  config: UploadConfig,
): Promise<UploadResult> {
  const parsed = parseExecutionReport(report);
  if (!parsed.ok) {
    const detail = parsed.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return { ok: false, error: `Invalid execution report: ${detail}` };
  }

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return { ok: false, error: "fetch is not available in this runtime" };
  }

  try {
    const res = await fetchImpl(`${config.baseUrl}/api/executions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(parsed.report),
    });

    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        status: res.status,
        body,
      };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
