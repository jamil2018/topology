import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.union([z.string().trim().min(1).max(160), z.number().int().positive().safe()])
  .transform(String);
const unixSeconds = z.number().int().nonnegative().max(253402300799);
const timestamp = z.iso.datetime({ offset: true });
const status = z.enum(["passed", "failed", "blocked", "skipped", "untested"]);
const optionalText = z.string().max(20_000).nullish();
const duration = z.number().int().nonnegative().max(2_147_483_647);

const attachment = z.object({
  id,
  resultId: id,
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i).max(127).optional(),
  dataBase64: z.base64().min(4).max(1_398_104).optional(),
});

export const maxHistoryBundleBytes = 8 * 1024 * 1024;

export const historyBundleSchema = z.object({
  provider: z.enum(["testrail", "qase"]),
  sourceNamespace: z.string().trim().min(1).max(500),
  statusMapping: z.record(z.string().max(160), status).optional(),
  runs: z.array(z.object({
    run: z.record(z.string(), z.unknown()),
    tests: z.array(z.unknown()).max(5000).optional(),
    results: z.array(z.unknown()).max(5000),
    attachments: z.array(z.unknown()).max(500).optional(),
    expected: z.object({
      results: z.number().int().nonnegative().max(5000).optional(),
      attachments: z.number().int().nonnegative().max(500).optional(),
    }).optional(),
  })).min(1).max(50),
});

const railRun = z.object({
  id, name: z.string().trim().min(1).max(240), description: optionalText,
  is_completed: z.literal(true), created_on: unixSeconds, completed_on: unixSeconds,
});
const railTest = z.object({ id, case_id: id, title: optionalText });
const railResult = z.object({
  id, test_id: id, status_id: id, comment: optionalText, created_on: unixSeconds, elapsed: z.string().max(80).nullish(),
});
const qaseRun = z.object({
  id, title: z.string().trim().min(1).max(240), description: optionalText,
  start_time: timestamp.nullish(), end_time: timestamp,
  status_text: z.string().nullish(),
  environment: z.object({ title: z.string().max(200).nullish() }).nullish(),
});
const qaseResult = z.object({
  hash: id, run_id: id, case_id: id, status: z.string().trim().min(1).max(160),
  comment: optionalText, stacktrace: optionalText, time_spent_ms: duration.nullish(), end_time: timestamp.nullish(),
});

export type HistoryBundle = z.input<typeof historyBundleSchema>;
export type HistoryAttachment = z.infer<typeof attachment>;
type ResultStatus = z.infer<typeof status>;

export type HistoricalResult = {
  sourceId: string;
  caseSourceId: string;
  title?: string | null;
  status: ResultStatus;
  sourceStatus: string;
  notes?: string | null;
  stack?: string | null;
  durationMs?: number | null;
  executedAt?: string | null;
};
export type HistoricalRun = {
  id: string;
  name: string;
  description?: string | null;
  startedAt?: string | null;
  completedAt: string;
  environment?: string | null;
  results: HistoricalResult[];
  attachments: HistoryAttachment[];
};

const railStatuses: Record<string, ResultStatus> = {
  "1": "passed", "2": "blocked", "3": "untested", "5": "failed",
};
const qaseStatuses: Record<string, ResultStatus> = {
  passed: "passed", failed: "failed", blocked: "blocked", skipped: "skipped",
};
const isoSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();

function elapsedMilliseconds(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?$/i.exec(value.trim());
  if (!match || !match.slice(1).some(Boolean)) throw new Error(`Unsupported TestRail elapsed time: ${value}`);
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return duration.parse((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
}

function mapStatus(source: string, mapping: Record<string, ResultStatus>, defaults: Record<string, ResultStatus>) {
  if (Object.hasOwn(mapping, source)) return mapping[source];
  if (Object.hasOwn(defaults, source)) return defaults[source];
  throw new Error(`Map source status "${source}" before importing this run`);
}

function rejectDuplicate(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} IDs`);
}

function normalizeRun(
  record: z.infer<typeof historyBundleSchema>["runs"][number],
  provider: HistoryBundle["provider"],
  mapping: Record<string, ResultStatus>,
): HistoricalRun {
  if (record.expected?.results !== undefined && record.expected.results !== record.results.length) {
    throw new Error(`Expected ${record.expected.results} result records, found ${record.results.length}`);
  }
  const attachments = z.array(attachment).parse(record.attachments ?? []);
  if (record.expected?.attachments !== undefined && record.expected.attachments !== attachments.length) {
    throw new Error(`Expected ${record.expected.attachments} attachment records, found ${attachments.length}`);
  }
  let value: HistoricalRun;
  if (provider === "testrail") {
    const run = railRun.parse(record.run);
    const tests = z.array(railTest).parse(record.tests ?? []);
    rejectDuplicate(tests.map((test) => test.id), "TestRail test");
    const byTestId = new Map(tests.map((test) => [test.id, test]));
    const results = z.array(railResult).parse(record.results).map((result) => {
      const test = byTestId.get(result.test_id);
      if (!test) throw new Error(`Add the TestRail test record for result ${result.id} (test ${result.test_id})`);
      return {
        sourceId: result.id, caseSourceId: test.case_id, title: test.title,
        status: mapStatus(result.status_id, mapping, railStatuses), sourceStatus: result.status_id,
        notes: result.comment, executedAt: isoSeconds(result.created_on), durationMs: elapsedMilliseconds(result.elapsed),
      };
    });
    value = { id: run.id, name: run.name, description: run.description, startedAt: isoSeconds(run.created_on),
      completedAt: isoSeconds(run.completed_on), results, attachments };
  } else {
    const run = qaseRun.parse(record.run);
    if (run.status_text && !["passed", "failed", "complete", "completed"].includes(run.status_text.toLowerCase())) {
      throw new Error("Choose a completed Qase run");
    }
    const results = z.array(qaseResult).parse(record.results).map((result) => {
      if (result.run_id !== run.id) throw new Error(`Qase result ${result.hash} belongs to a different run`);
      return {
        sourceId: result.hash, caseSourceId: result.case_id,
        status: mapStatus(result.status, mapping, qaseStatuses), sourceStatus: result.status,
        notes: result.comment, stack: result.stacktrace, executedAt: result.end_time, durationMs: result.time_spent_ms,
      };
    });
    value = { id: run.id, name: run.title, description: run.description, startedAt: run.start_time,
      completedAt: run.end_time, environment: run.environment?.title, results, attachments };
  }

  if (value.startedAt && Date.parse(value.startedAt) > Date.parse(value.completedAt)) {
    throw new Error("Run completed before it started");
  }
  if (value.results.length === 0) throw new Error("Add the completed run's result records");
  rejectDuplicate(value.results.map((result) => result.sourceId), "result");
  rejectDuplicate(attachments.map((file) => JSON.stringify([file.resultId, file.id])), "attachment");
  const resultIds = new Set(value.results.map((result) => result.sourceId));
  for (const file of attachments) {
    if (!resultIds.has(file.resultId)) throw new Error(`Attachment ${file.id} references a missing result`);
    if (!file.dataBase64) throw new Error(`Supply the downloaded bytes for attachment ${file.id}`);
    if (Buffer.byteLength(file.dataBase64, "base64") > 1024 * 1024) throw new Error(`Attachment ${file.id} exceeds 1 MiB`);
  }
  value.results.sort((a, b) => (a.executedAt ?? "").localeCompare(b.executedAt ?? "") || a.sourceId.localeCompare(b.sourceId));
  value.attachments.sort((a, b) => a.resultId.localeCompare(b.resultId) || a.id.localeCompare(b.id));
  return value;
}

export function parseHistoryBundle(input: unknown) {
  const bundle = historyBundleSchema.parse(input);
  const sourceIds = bundle.runs.map((record) => id.safeParse(record.run.id).data ?? null);
  const duplicates = new Set(sourceIds.filter((id, index) => id && sourceIds.indexOf(id) !== index));
  const entries = bundle.runs.map((record, index) => {
    try {
      if (duplicates.has(sourceIds[index])) throw new Error("Duplicate run ID in this bundle");
      const run = normalizeRun(record, bundle.provider, bundle.statusMapping ?? {});
      return { run, digest: createHash("sha256").update(JSON.stringify(run)).digest("hex") };
    } catch (error) {
      const reason = error instanceof z.ZodError
        ? error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "run"} ${issue.message}`).join(". ")
        : error instanceof Error ? error.message : "Invalid run";
      return { index, sourceId: sourceIds[index], reason, results: record.results.length, attachments: record.attachments?.length ?? 0 };
    }
  });
  const digest = createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
  return { provider: bundle.provider, namespace: bundle.sourceNamespace, entries, digest };
}
