import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  attachmentKindEnum,
  casePriorityEnum,
  environmentKindEnum,
  issueProviderEnum,
  issueRemoteStatusEnum,
  milestoneStatusEnum,
  resultStatusEnum,
  runKindEnum,
  runStatusEnum,
  testPlanStatusEnum,
  triageStatusEnum,
} from "./enums";
import { cases, caseSteps, folders, sharedSteps } from "./cases";
import { users, workspaces } from "./identity";
import { commits, pullRequests } from "./integrations";
import { failureSignatures, testImplementations } from "./quality";

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: environmentKindEnum("kind").default("local").notNull(),
    metadataJson: text("metadata_json"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.name)],
);

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  status: runStatusEnum("status").default("planned").notNull(),
  kind: runKindEnum("kind").default("manual").notNull(),
  /** Legacy free-text label; prefer environmentId when set. */
  environment: text("environment").default("local").notNull(),
  environmentId: uuid("environment_id").references(() => environments.id, {
    onDelete: "set null",
  }),
  source: text("source").default("manual").notNull(),
  externalId: text("external_id"),
  commitSha: text("commit_sha"),
  branch: text("branch"),
  pullRequestId: uuid("pull_request_id").references(() => pullRequests.id, {
    onDelete: "set null",
  }),
  commitId: uuid("commit_id").references(() => commits.id, {
    onDelete: "set null",
  }),
  shardIndex: integer("shard_index"),
  shardTotal: integer("shard_total").default(1).notNull(),
  shardsReceived: integer("shards_received").default(0).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  assigneeId: uuid("assignee_id").references(() => users.id, {
    onDelete: "set null",
  }),
  planId: uuid("plan_id").references(() => testPlans.id, {
    onDelete: "set null",
  }),
  matrixBrowser: text("matrix_browser"),
  matrixOs: text("matrix_os"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("runs_workspace_id_idx").on(table.workspaceId),
  index("runs_workspace_kind_idx").on(table.workspaceId, table.kind),
  index("runs_plan_id_idx").on(table.planId),
  index("runs_environment_id_idx").on(table.environmentId),
]);

export const runResults = pgTable(
  "run_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, {
      onDelete: "cascade",
    }),
    implementationId: uuid("implementation_id").references(
      () => testImplementations.id,
      { onDelete: "set null" },
    ),
    /** Browser/os (and similar) snapshot from the execution protocol. */
    environmentJson: text("environment_json"),
    externalKey: text("external_key"),
    classname: text("classname"),
    title: text("title"),
    status: resultStatusEnum("status").default("untested").notNull(),
    notes: text("notes").default("").notNull(),
    errorMessage: text("error_message"),
    stack: text("stack"),
    durationMs: integer("duration_ms"),
    executedById: uuid("executed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    iterationIndex: integer("iteration_index").default(0).notNull(),
    iterationValuesJson: text("iteration_values_json"),
    executedAt: timestamp("executed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("run_results_run_id_idx").on(table.runId),
    index("run_results_case_id_created_at_idx").on(table.caseId, table.createdAt),
    index("run_results_implementation_id_idx").on(table.implementationId),
  ],
);

export const linkedIssues = pgTable("linked_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: issueProviderEnum("provider").notNull(),
  remoteId: text("remote_id").notNull(),
  remoteKey: text("remote_key").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  remoteStatus: issueRemoteStatusEnum("remote_status")
    .default("open")
    .notNull(),
  resultId: uuid("result_id").references(() => runResults.id, {
    onDelete: "set null",
  }),
  caseId: uuid("case_id").references(() => cases.id, {
    onDelete: "set null",
  }),
  runId: uuid("run_id").references(() => runs.id, {
    onDelete: "set null",
  }),
  needsRetest: integer("needs_retest").default(0).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  lastSyncedAt: timestamp("last_synced_at", { mode: "date" })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("linked_issues_workspace_id_idx").on(table.workspaceId),
  index("linked_issues_case_id_idx").on(table.caseId),
  index("linked_issues_result_id_idx").on(table.resultId),
  index("linked_issues_run_id_idx").on(table.runId),
]);

export const resultComments = pgTable("result_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  resultId: uuid("result_id")
    .notNull()
    .references(() => runResults.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("result_comments_result_id_idx").on(table.resultId)]);

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  resultId: uuid("result_id").references(() => runResults.id, {
    onDelete: "cascade",
  }),
  commentId: uuid("comment_id").references(() => resultComments.id, {
    onDelete: "set null",
  }),
  kind: attachmentKindEnum("kind").default("other").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").default("application/octet-stream").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const runShards = pgTable(
  "run_shards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    shardIndex: integer("shard_index").notNull(),
    payloadJson: text("payload_json").notNull(),
    receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("run_shards_run_id_idx").on(table.runId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    status: milestoneStatusEnum("status").default("active").notNull(),
    targetDate: timestamp("target_date", { mode: "date" }),
    passRateThreshold: integer("pass_rate_threshold").default(95).notNull(),
    maxOpenP0Failures: integer("max_open_p0_failures").default(0).notNull(),
    minExecutedPct: integer("min_executed_pct").default(80).notNull(),
    maxOpenBlockers: integer("max_open_blockers").default(0).notNull(),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("milestones_workspace_id_idx").on(table.workspaceId),
    index("milestones_folder_id_idx").on(table.folderId),
  ],
);

export const triageItems = pgTable(
  "triage_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    status: triageStatusEnum("status").default("open").notNull(),
    priority: casePriorityEnum("priority").default("P2").notNull(),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    resultId: uuid("result_id").references(() => runResults.id, {
      onDelete: "set null",
    }),
    signatureId: uuid("signature_id").references(() => failureSignatures.id, {
      onDelete: "set null",
    }),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    notes: text("notes").default("").notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("triage_items_workspace_id_idx").on(table.workspaceId),
    index("triage_items_case_id_idx").on(table.caseId),
    index("triage_items_run_id_idx").on(table.runId),
    index("triage_items_result_id_idx").on(table.resultId),
  ],
);

export const testPlans = pgTable(
  "test_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    status: testPlanStatusEnum("status").default("draft").notNull(),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    /** JSON: { browsers, operatingSystems, environmentIds }. */
    matrixJson: text("matrix_json")
      .default('{"browsers":[],"operatingSystems":[],"environmentIds":[]}')
      .notNull(),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("test_plans_workspace_id_idx").on(table.workspaceId),
    index("test_plans_milestone_id_idx").on(table.milestoneId),
  ],
);

export const testPlanCases = pgTable(
  "test_plan_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => testPlans.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
  },
  (table) => [
    unique().on(table.planId, table.caseId),
    index("test_plan_cases_case_id_idx").on(table.caseId),
  ],
);

export const runStepResults = pgTable(
  "run_step_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resultId: uuid("result_id")
      .notNull()
      .references(() => runResults.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    caseStepId: uuid("case_step_id").references(() => caseSteps.id, {
      onDelete: "set null",
    }),
    sharedStepId: uuid("shared_step_id").references(() => sharedSteps.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    expected: text("expected").default("").notNull(),
    data: text("data").default("").notNull(),
    status: resultStatusEnum("status").default("untested").notNull(),
    notes: text("notes").default("").notNull(),
  },
  (table) => [
    unique().on(table.resultId, table.position),
    index("run_step_results_case_step_id_idx").on(table.caseStepId),
  ],
);

