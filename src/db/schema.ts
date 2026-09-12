import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const casePriorityEnum = pgEnum("case_priority", [
  "P0",
  "P1",
  "P2",
  "P3",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "draft",
  "ready",
  "blocked",
  "deprecated",
]);

export const runStatusEnum = pgEnum("run_status", [
  "planned",
  "in_progress",
  "completed",
  "aborted",
]);

export const resultStatusEnum = pgEnum("result_status", [
  "untested",
  "passed",
  "failed",
  "blocked",
  "skipped",
]);

export const runKindEnum = pgEnum("run_kind", ["manual", "automation"]);

export const triageStatusEnum = pgEnum("triage_status", [
  "open",
  "snoozed",
  "resolved",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "active",
  "archived",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const folders = pgTable("folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  preconditions: text("preconditions").default("").notNull(),
  steps: text("steps").default("").notNull(),
  expectedResult: text("expected_result").default("").notNull(),
  priority: casePriorityEnum("priority").default("P2").notNull(),
  status: caseStatusEnum("status").default("draft").notNull(),
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  tags: text("tags").array().default([]).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  status: runStatusEnum("status").default("planned").notNull(),
  kind: runKindEnum("kind").default("manual").notNull(),
  environment: text("environment").default("local").notNull(),
  source: text("source").default("manual").notNull(),
  externalId: text("external_id"),
  commitSha: text("commit_sha"),
  branch: text("branch"),
  shardIndex: integer("shard_index"),
  shardTotal: integer("shard_total").default(1).notNull(),
  shardsReceived: integer("shards_received").default(0).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const runResults = pgTable("run_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").references(() => cases.id, {
    onDelete: "cascade",
  }),
  externalKey: text("external_key"),
  classname: text("classname"),
  title: text("title"),
  status: resultStatusEnum("status").default("untested").notNull(),
  notes: text("notes").default("").notNull(),
  durationMs: integer("duration_ms"),
  executedById: uuid("executed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  executedAt: timestamp("executed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const runShards = pgTable("run_shards", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  shardIndex: integer("shard_index").notNull(),
  payloadJson: text("payload_json").notNull(),
  receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
});

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  status: milestoneStatusEnum("status").default("active").notNull(),
  targetDate: timestamp("target_date", { mode: "date" }),
  passRateThreshold: integer("pass_rate_threshold").default(95).notNull(),
  maxOpenP0Failures: integer("max_open_p0_failures").default(0).notNull(),
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const triageItems = pgTable("triage_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  title: text("title").notNull(),
  status: triageStatusEnum("status").default("open").notNull(),
  priority: casePriorityEnum("priority").default("P2").notNull(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  resultId: uuid("result_id").references(() => runResults.id, {
    onDelete: "set null",
  }),
  occurrenceCount: integer("occurrence_count").default(1).notNull(),
  notes: text("notes").default("").notNull(),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const issueProviderEnum = pgEnum("issue_provider", [
  "mock",
  "jira",
  "linear",
  "github",
]);

export const issueRemoteStatusEnum = pgEnum("issue_remote_status", [
  "open",
  "in_progress",
  "done",
  "unknown",
]);

export const linkedIssues = pgTable("linked_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
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
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  cases: many(cases),
  runs: many(runs),
  linkedIssues: many(linkedIssues),
  apiTokens: many(apiTokens),
}));

export const foldersRelations = relations(folders, ({ many, one }) => ({
  cases: many(cases),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  folder: one(folders, {
    fields: [cases.folderId],
    references: [folders.id],
  }),
  createdBy: one(users, {
    fields: [cases.createdById],
    references: [users.id],
  }),
  results: many(runResults),
  linkedIssues: many(linkedIssues),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [runs.createdById],
    references: [users.id],
  }),
  results: many(runResults),
  shards: many(runShards),
  linkedIssues: many(linkedIssues),
}));

export const runResultsRelations = relations(runResults, ({ one, many }) => ({
  run: one(runs, {
    fields: [runResults.runId],
    references: [runs.id],
  }),
  case: one(cases, {
    fields: [runResults.caseId],
    references: [cases.id],
  }),
  linkedIssues: many(linkedIssues),
}));

export const runShardsRelations = relations(runShards, ({ one }) => ({
  run: one(runs, {
    fields: [runShards.runId],
    references: [runs.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  folder: one(folders, {
    fields: [milestones.folderId],
    references: [folders.id],
  }),
}));

export const triageItemsRelations = relations(triageItems, ({ one }) => ({
  case: one(cases, {
    fields: [triageItems.caseId],
    references: [cases.id],
  }),
  run: one(runs, {
    fields: [triageItems.runId],
    references: [runs.id],
  }),
}));

export const linkedIssuesRelations = relations(linkedIssues, ({ one }) => ({
  result: one(runResults, {
    fields: [linkedIssues.resultId],
    references: [runResults.id],
  }),
  case: one(cases, {
    fields: [linkedIssues.caseId],
    references: [cases.id],
  }),
  run: one(runs, {
    fields: [linkedIssues.runId],
    references: [runs.id],
  }),
  createdBy: one(users, {
    fields: [linkedIssues.createdById],
    references: [users.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

export type Case = typeof cases.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunResult = typeof runResults.$inferSelect;
export type User = typeof users.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type TriageItem = typeof triageItems.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type LinkedIssue = typeof linkedIssues.$inferSelect;
