import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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

export const themePreferenceEnum = pgEnum("theme_preference", [
  "system",
  "light",
  "dark",
]);

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "admin",
  "member",
  "viewer",
]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  themePreference: themePreferenceEnum("theme_preference")
    .default("system")
    .notNull(),
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

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Soft-archive; archived projects are hidden from the switcher. */
  archivedAt: timestamp("archived_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * Named permission sets scoped to a project (workspace).
 * System roles (admin/member/viewer) are seeded per project and cannot be deleted.
 */
export const workspaceRoles = pgTable(
  "workspace_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    /** Allow-listed action keys from src/lib/permissions.ts */
    actions: text("actions").array().default([]).notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    /** Present for seeded system roles; null for custom roles. */
    systemKey: workspaceRoleEnum("system_key"),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.workspaceId, table.name),
    unique().on(table.workspaceId, table.systemKey),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Coarse legacy role — kept in sync with customRole when possible. */
    role: workspaceRoleEnum("role").default("member").notNull(),
    customRoleId: uuid("custom_role_id").references(() => workspaceRoles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.userId)],
);

export const workspaceInvites = pgTable("workspace_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: workspaceRoleEnum("role").default("member").notNull(),
  customRoleId: uuid("custom_role_id").references(() => workspaceRoles.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  invitedById: uuid("invited_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
});

export const folders = pgTable("folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
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
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
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
  assigneeId: uuid("assignee_id").references(() => users.id, {
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
  assigneeId: uuid("assignee_id").references(() => users.id, {
    onDelete: "set null",
  }),
  executedAt: timestamp("executed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

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
});

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  resultId: uuid("result_id").references(() => runResults.id, {
    onDelete: "cascade",
  }),
  commentId: uuid("comment_id").references(() => resultComments.id, {
    onDelete: "set null",
  }),
  filename: text("filename").notNull(),
  contentType: text("content_type").default("application/octet-stream").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

export const milestones = pgTable("milestones", {
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
});

export const triageItems = pgTable("triage_items", {
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
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").default("").notNull(),
  /** Comma-separated event names: run.completed,issue.created */
  events: text("events").default("run.completed,issue.created").notNull(),
  enabled: integer("enabled").default(1).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  lastDeliveredAt: timestamp("last_delivered_at", { mode: "date" }),
  lastStatus: integer("last_status"),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

export const savedViewEntityEnum = pgEnum("saved_view_entity", [
  "cases",
  "runs",
]);

/** Named filter+sort presets (Linear-style saved views). */
export const savedViews = pgTable("saved_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  entity: savedViewEntityEnum("entity").notNull(),
  /** JSON: filters + sort for the entity list. */
  configJson: text("config_json").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

/** Minimal case change log (who changed what). */
export const caseActivities = pgTable("case_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  field: text("field"),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  authoredCases: many(cases, { relationName: "caseAuthor" }),
  assignedCases: many(cases, { relationName: "caseAssignee" }),
  authoredRuns: many(runs, { relationName: "runAuthor" }),
  assignedRuns: many(runs, { relationName: "runAssignee" }),
  executedResults: many(runResults, { relationName: "resultExecutor" }),
  assignedResults: many(runResults, { relationName: "resultAssignee" }),
  linkedIssues: many(linkedIssues),
  apiTokens: many(apiTokens),
  memberships: many(workspaceMembers),
  comments: many(resultComments),
  uploadedAttachments: many(attachments),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  invites: many(workspaceInvites),
  roles: many(workspaceRoles),
  folders: many(folders),
  cases: many(cases),
  runs: many(runs),
  milestones: many(milestones),
  triageItems: many(triageItems),
  linkedIssues: many(linkedIssues),
  webhookEndpoints: many(webhookEndpoints),
  apiTokens: many(apiTokens),
  savedViews: many(savedViews),
}));

export const workspaceRolesRelations = relations(
  workspaceRoles,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workspaceRoles.workspaceId],
      references: [workspaces.id],
    }),
    members: many(workspaceMembers),
    invites: many(workspaceInvites),
  }),
);

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
    customRole: one(workspaceRoles, {
      fields: [workspaceMembers.customRoleId],
      references: [workspaceRoles.id],
    }),
  }),
);

export const workspaceInvitesRelations = relations(
  workspaceInvites,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceInvites.workspaceId],
      references: [workspaces.id],
    }),
    invitedBy: one(users, {
      fields: [workspaceInvites.invitedById],
      references: [users.id],
    }),
    customRole: one(workspaceRoles, {
      fields: [workspaceInvites.customRoleId],
      references: [workspaceRoles.id],
    }),
  }),
);

export const foldersRelations = relations(folders, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [folders.workspaceId],
    references: [workspaces.id],
  }),
  cases: many(cases),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [cases.workspaceId],
    references: [workspaces.id],
  }),
  folder: one(folders, {
    fields: [cases.folderId],
    references: [folders.id],
  }),
  createdBy: one(users, {
    fields: [cases.createdById],
    references: [users.id],
    relationName: "caseAuthor",
  }),
  assignee: one(users, {
    fields: [cases.assigneeId],
    references: [users.id],
    relationName: "caseAssignee",
  }),
  results: many(runResults),
  linkedIssues: many(linkedIssues),
  activities: many(caseActivities),
}));

export const savedViewsRelations = relations(savedViews, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [savedViews.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [savedViews.createdById],
    references: [users.id],
  }),
}));

export const caseActivitiesRelations = relations(caseActivities, ({ one }) => ({
  case: one(cases, {
    fields: [caseActivities.caseId],
    references: [cases.id],
  }),
  actor: one(users, {
    fields: [caseActivities.actorId],
    references: [users.id],
  }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [runs.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [runs.createdById],
    references: [users.id],
    relationName: "runAuthor",
  }),
  assignee: one(users, {
    fields: [runs.assigneeId],
    references: [users.id],
    relationName: "runAssignee",
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
  executedBy: one(users, {
    fields: [runResults.executedById],
    references: [users.id],
    relationName: "resultExecutor",
  }),
  assignee: one(users, {
    fields: [runResults.assigneeId],
    references: [users.id],
    relationName: "resultAssignee",
  }),
  linkedIssues: many(linkedIssues),
  comments: many(resultComments),
  attachments: many(attachments),
}));

export const resultCommentsRelations = relations(
  resultComments,
  ({ one, many }) => ({
    result: one(runResults, {
      fields: [resultComments.resultId],
      references: [runResults.id],
    }),
    user: one(users, {
      fields: [resultComments.userId],
      references: [users.id],
    }),
    attachments: many(attachments),
  }),
);

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  result: one(runResults, {
    fields: [attachments.resultId],
    references: [runResults.id],
  }),
  comment: one(resultComments, {
    fields: [attachments.commentId],
    references: [resultComments.id],
  }),
  uploadedBy: one(users, {
    fields: [attachments.uploadedById],
    references: [users.id],
  }),
}));

export const runShardsRelations = relations(runShards, ({ one }) => ({
  run: one(runs, {
    fields: [runShards.runId],
    references: [runs.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [milestones.workspaceId],
    references: [workspaces.id],
  }),
  folder: one(folders, {
    fields: [milestones.folderId],
    references: [folders.id],
  }),
}));

export const triageItemsRelations = relations(triageItems, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [triageItems.workspaceId],
    references: [workspaces.id],
  }),
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
  workspace: one(workspaces, {
    fields: [linkedIssues.workspaceId],
    references: [workspaces.id],
  }),
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
  workspace: one(workspaces, {
    fields: [apiTokens.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

export type Project = Workspace;

export type Case = typeof cases.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunResult = typeof runResults.$inferSelect;
export type User = typeof users.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type TriageItem = typeof triageItems.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type LinkedIssue = typeof linkedIssues.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type WorkspaceCustomRole = typeof workspaceRoles.$inferSelect;
export type ResultComment = typeof resultComments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
export type SavedView = typeof savedViews.$inferSelect;
export type CaseActivity = typeof caseActivities.$inferSelect;
