export type TopologyClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
};

export class TopologyClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TopologyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const message =
        typeof data === "object" && data && "error" in data
          ? String((data as { error: unknown }).error)
          : `HTTP ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  listCases(q?: string) {
    const qs = new URLSearchParams({ resource: "cases" });
    if (q) qs.set("q", q);
    return this.request(`/api/agent?${qs}`);
  }

  listRuns() {
    return this.request(`/api/agent?resource=runs`);
  }

  listResults(opts?: { runId?: string; status?: string }) {
    const qs = new URLSearchParams({ resource: "results" });
    if (opts?.runId) qs.set("runId", opts.runId);
    if (opts?.status) qs.set("status", opts.status);
    return this.request(`/api/agent?${qs}`);
  }

  whatsPending() {
    return this.request(`/api/agent?resource=whats_pending`);
  }

  getScenarioContext(q: string) {
    const qs = new URLSearchParams({
      resource: "scenario_context",
      q,
    });
    return this.request(`/api/agent?${qs}`);
  }

  createCase(body: Record<string, unknown>) {
    return this.request(`/api/agent`, {
      method: "POST",
      body: JSON.stringify({ action: "create_case", ...body }),
    });
  }

  createRun(body: Record<string, unknown>) {
    return this.request(`/api/agent`, {
      method: "POST",
      body: JSON.stringify({ action: "create_run", ...body }),
    });
  }

  recordResult(body: Record<string, unknown>) {
    return this.request(`/api/agent`, {
      method: "POST",
      body: JSON.stringify({ action: "record_result", ...body }),
    });
  }

  createIssue(body: Record<string, unknown>) {
    return this.request(`/api/agent`, {
      method: "POST",
      body: JSON.stringify({ action: "create_issue", ...body }),
    });
  }

  linkIssue(body: Record<string, unknown>) {
    return this.request(`/api/agent`, {
      method: "POST",
      body: JSON.stringify({ action: "link_issue", ...body }),
    });
  }
}

export function requireEnv(): { baseUrl: string; token: string } {
  const baseUrl = process.env.TOPOLOGY_URL;
  const token = process.env.TOPOLOGY_API_TOKEN;
  if (!baseUrl) {
    throw new Error("TOPOLOGY_URL is required");
  }
  if (!token) {
    throw new Error("TOPOLOGY_API_TOKEN is required");
  }
  return { baseUrl, token };
}
