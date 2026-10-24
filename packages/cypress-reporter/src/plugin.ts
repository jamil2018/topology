import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionReport,
  type ExecutionResult,
} from "@topology/domain";
import { mapCypressTest, type CypressScreenshotRef } from "./map-test.js";
import { resolveUploadConfig, uploadExecutionReport } from "./upload.js";

export type TopologyReporterOptions = {
  url?: string;
  apiToken?: string;
  dryRun?: boolean;
  intentFromTitle?: boolean;
};

type CypressRun = {
  spec?: { relative?: string; name?: string };
  tests?: Array<{
    title?: string | string[];
    state?: string;
    duration?: number;
    displayError?: string | null;
  }>;
  screenshots?: CypressScreenshotRef[];
};

export type CypressRunResult = {
  runs?: CypressRun[];
};

type CypressOn = {
  (event: "after:run", fn: (results: CypressRunResult) => void | Promise<void>): void;
};

/**
 * Cypress `setupNodeEvents` plugin: on `after:run`, build an ExecutionReport
 * and POST it to Topology `/api/executions`.
 */
export function topologyCypressPlugin(
  on: CypressOn,
  _config?: unknown,
  options: TopologyReporterOptions = {},
): void {
  on("after:run", async (results) => {
    const mapped = collectCypressResults(results, options);
    if (mapped.length === 0) {
      console.log("[topology] No test results to upload.");
      return;
    }

    const report = buildCypressReport(mapped);
    const dryRun =
      options.dryRun === true ||
      process.env.TOPOLOGY_DRY_RUN === "1" ||
      process.env.TOPOLOGY_DRY_RUN === "true";

    if (dryRun) {
      console.log(
        `[topology] dry-run: ${report.results.length} result(s), not uploaded`,
      );
      return;
    }

    const fromEnv = resolveUploadConfig(process.env);
    const apiToken =
      options.apiToken?.trim() ||
      ("apiToken" in fromEnv ? fromEnv.apiToken : undefined);
    const baseUrl =
      options.url?.replace(/\/$/, "") ||
      ("baseUrl" in fromEnv ? fromEnv.baseUrl : undefined);

    if (!apiToken || !baseUrl) {
      const err =
        "error" in fromEnv
          ? fromEnv.error
          : "TOPOLOGY_API_TOKEN is required to upload execution reports";
      console.error(`[topology] ${err}`);
      return;
    }

    const uploaded = await uploadExecutionReport(report, { baseUrl, apiToken });
    if (!uploaded.ok) {
      console.error(`[topology] upload failed: ${uploaded.error}`, uploaded.body);
      return;
    }

    console.log(
      `[topology] uploaded ${report.results.length} result(s) → ${baseUrl}/api/executions`,
    );
  });
}

export function collectCypressResults(
  results: CypressRunResult | undefined,
  options: TopologyReporterOptions = {},
): ExecutionResult[] {
  const mapped: ExecutionResult[] = [];
  for (const run of results?.runs ?? []) {
    const spec = run.spec ?? {};
    const screenshots = run.screenshots ?? [];
    for (const test of run.tests ?? []) {
      mapped.push(
        mapCypressTest(test, spec, {
          intentFromTitle: options.intentFromTitle,
          screenshots: test.state === "failed" ? screenshots : [],
        }),
      );
    }
  }
  return mapped;
}

export function buildCypressReport(results: ExecutionResult[]): ExecutionReport {
  const env = process.env;
  const commitSha =
    env.TOPOLOGY_COMMIT_SHA?.trim() ||
    env.CI_COMMIT_SHA?.trim() ||
    env.GITHUB_SHA?.trim() ||
    undefined;
  const branch =
    env.TOPOLOGY_BRANCH?.trim() ||
    env.CI_COMMIT_REF_NAME?.trim() ||
    env.GITHUB_REF_NAME?.trim() ||
    undefined;
  const externalId =
    env.TOPOLOGY_RUN_EXTERNAL_ID?.trim() ||
    env.CI_PIPELINE_ID?.trim() ||
    env.GITHUB_RUN_ID?.trim() ||
    undefined;
  const runMeta =
    commitSha || branch || externalId
      ? {
          ...(externalId ? { externalId } : {}),
          ...(commitSha ? { commitSha } : {}),
          ...(branch ? { branch } : {}),
        }
      : undefined;
  return {
    version: EXECUTION_PROTOCOL_VERSION,
    ...(runMeta ? { run: runMeta } : {}),
    results,
  };
}

export default topologyCypressPlugin;
