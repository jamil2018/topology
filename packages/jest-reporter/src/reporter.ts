import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionReport,
  type ExecutionResult,
} from "@topology/domain";
import { mapJestAssertion } from "./map-test.js";
import { resolveUploadConfig, uploadExecutionReport } from "./upload.js";

export type TopologyReporterOptions = {
  url?: string;
  apiToken?: string;
  dryRun?: boolean;
  intentFromTitle?: boolean;
};

type JestFileResult = {
  testFilePath?: string;
  testResults?: Array<{
    title: string;
    ancestorTitles?: string[];
    status: string;
    duration?: number | null;
    failureMessages?: string[];
  }>;
};

type JestAggregated = {
  testResults?: JestFileResult[];
};

/**
 * Thin Jest reporter that builds an ExecutionReport and POSTs it to
 * Topology `/api/executions` when the run ends.
 */
export class TopologyJestReporter {
  private readonly options: TopologyReporterOptions;

  constructor(
    _globalConfig?: unknown,
    options: TopologyReporterOptions = {},
  ) {
    this.options = options;
  }

  async onRunComplete(
    _contexts?: unknown,
    results?: JestAggregated,
  ): Promise<void> {
    const mapped = this.collect(results);
    if (mapped.length === 0) {
      console.log("[topology] No test results to upload.");
      return;
    }

    const report = this.buildReport(mapped);
    const dryRun =
      this.options.dryRun === true ||
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
      this.options.apiToken?.trim() ||
      ("apiToken" in fromEnv ? fromEnv.apiToken : undefined);
    const baseUrl =
      this.options.url?.replace(/\/$/, "") ||
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
  }

  collect(results?: JestAggregated): ExecutionResult[] {
    const files = results?.testResults ?? [];
    const mapped: ExecutionResult[] = [];
    for (const file of files) {
      const path = file.testFilePath ?? "unknown";
      for (const assertion of file.testResults ?? []) {
        mapped.push(
          mapJestAssertion(assertion, path, {
            intentFromTitle: this.options.intentFromTitle,
          }),
        );
      }
    }
    return mapped;
  }

  buildReport(results: ExecutionResult[]): ExecutionReport {
    const env = process.env;
    const commitSha =
      env.TOPOLOGY_COMMIT_SHA?.trim() || env.GITHUB_SHA?.trim() || undefined;
    const branch =
      env.TOPOLOGY_BRANCH?.trim() || env.GITHUB_REF_NAME?.trim() || undefined;
    const externalId =
      env.TOPOLOGY_RUN_EXTERNAL_ID?.trim() ||
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
}

export default TopologyJestReporter;
