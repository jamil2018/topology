import {
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionReport,
  type ExecutionResult,
} from "@topology/domain";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { mapPlaywrightResult } from "./map-test.js";
import { resolveUploadConfig, uploadExecutionReport } from "./upload.js";

export type TopologyReporterOptions = {
  /** Override TOPOLOGY_URL. */
  url?: string;
  /** Override TOPOLOGY_API_TOKEN. */
  apiToken?: string;
  /** Skip network upload (still builds the report). */
  dryRun?: boolean;
  /** When false, do not parse INTENT-123 from titles. Default true. */
  intentFromTitle?: boolean;
};

/**
 * Thin Playwright reporter that builds an ExecutionReport and POSTs it to
 * Topology `/api/executions` when the run ends.
 */
export class TopologyReporter implements Reporter {
  private readonly options: TopologyReporterOptions;
  private results: ExecutionResult[] = [];
  private config: FullConfig | undefined;

  constructor(options: TopologyReporterOptions = {}) {
    this.options = options;
  }

  onBegin(config: FullConfig): void {
    this.config = config;
    this.results = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only keep the last retry attempt for each test.
    if (result.retry < test.retries && result.status === "failed") {
      return;
    }

    const project = test.parent.project();
    const browserName = project?.use?.browserName;
    const browser =
      typeof browserName === "string" ? browserName : undefined;

    const mapped = mapPlaywrightResult(
      {
        title: test.title,
        titlePath: test.titlePath(),
        location: test.location,
        annotations: test.annotations,
      },
      {
        status: result.status,
        duration: result.duration,
        error: result.error
          ? { message: result.error.message, stack: result.error.stack }
          : undefined,
        attachments: result.attachments.map((a) => ({
          name: a.name,
          path: a.path,
          contentType: a.contentType,
        })),
        retry: result.retry,
      },
      {
        projectRoot: this.config?.rootDir,
        intentFromTitle: this.options.intentFromTitle,
        browser,
        os: process.platform,
      },
    );

    this.results.push(mapped);
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.results.length === 0) {
      console.log("[topology] No test results to upload.");
      return;
    }

    const report = this.buildReport();
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

    const uploaded = await uploadExecutionReport(report, {
      baseUrl,
      apiToken,
    });

    if (!uploaded.ok) {
      console.error(`[topology] upload failed: ${uploaded.error}`, uploaded.body);
      return;
    }

    console.log(
      `[topology] uploaded ${report.results.length} result(s) → ${baseUrl}/api/executions`,
    );
  }

  /** Exposed for tests. */
  buildReport(): ExecutionReport {
    const env = process.env;
    const commitSha =
      env.TOPOLOGY_COMMIT_SHA?.trim() ||
      env.GITHUB_SHA?.trim() ||
      undefined;
    const branch =
      env.TOPOLOGY_BRANCH?.trim() ||
      env.GITHUB_REF_NAME?.trim() ||
      undefined;
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
            environment: {
              os: process.platform,
            },
          }
        : undefined;

    return {
      version: EXECUTION_PROTOCOL_VERSION,
      ...(runMeta ? { run: runMeta } : {}),
      results: this.results,
    };
  }
}

export default TopologyReporter;
