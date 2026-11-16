import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveIssueProvider } from "../../packages/issue-providers/src";

/** Explicit opt-in, read-only qualification against a known sandbox issue. */
async function main() {
  const selected = (process.env.TOPOLOGY_LIVE_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const results: { provider: string; status: string; scope: string; error?: string }[] = [];
  if (!selected.length) {
    console.error("UNQUALIFIED: select sandbox providers with TOPOLOGY_LIVE_PROVIDERS=github,jira,linear,gitlab and set TOPOLOGY_LIVE_<PROVIDER>_TOKEN and _ISSUE_ID. GitHub/GitLab also need _REPO; Jira needs _BASE_URL and _EMAIL. Only issue read/normalization is qualified; OAuth, writes and AI need separate sandbox journeys.");
    process.exitCode = 1;
    return;
  }
  for (const provider of selected) {
    const prefix = `TOPOLOGY_LIVE_${provider.toUpperCase()}_`;
    try {
      assert(["github", "gitlab", "jira", "linear"].includes(provider), "Unsupported live provider");
      const token = process.env[`${prefix}TOKEN`];
      const issue = process.env[`${prefix}ISSUE_ID`];
      assert(token && issue, `${prefix}TOKEN and ${prefix}ISSUE_ID are required`);
      const api = resolveIssueProvider({
        provider,
        token, email: process.env[`${prefix}EMAIL`], baseUrl: process.env[`${prefix}BASE_URL`],
        defaultRepo: process.env[`${prefix}REPO`],
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
      });
      const result = await api.getIssue(issue);
      assert.equal(result.provider, provider);
      assert(result.id && result.key && result.title);
      assert(["open", "in_progress", "done", "unknown"].includes(result.status));
      assert.equal(new URL(result.url).protocol, "https:");
      results.push({ provider, status: "passed", scope: "read existing sandbox issue and normalize identity/title/status/URL" });
    } catch {
      // Provider exceptions may embed credentials or customer issue content.
      results.push({ provider, status: "failed", scope: "read existing sandbox issue", error: "Provider read failed or configuration/normalized response was invalid" });
      process.exitCode = 1;
    }
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/live-qualification.json", JSON.stringify({ results,
    unqualified: ["OAuth", "provider create/update/transition", "AI inference", "live S3 cloud credentials"] }, null, 2));
  console.log(JSON.stringify(results));
}
void main();
