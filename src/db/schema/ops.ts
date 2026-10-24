import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  coverageSnapshotSourceEnum,
  proposalActorTypeEnum,
  proposalStatusEnum,
} from "./enums";
import { milestones } from "./execution";
import { users, workspaces } from "./identity";

/** Release bound to a git tag/SHA and optional milestone (Phase 5). */
export const releases = pgTable(
  "releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gitTag: text("git_tag"),
    sha: text("sha"),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    releasedAt: timestamp("released_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.name)],
);

/** Frozen coverage/execution snapshot for compare-releases. */
export const releaseSnapshots = pgTable("release_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  releaseId: uuid("release_id")
    .notNull()
    .references(() => releases.id, { onDelete: "cascade" }),
  payloadJson: text("payload_json").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/** Workspace coverage history (Phase 8). */
export const coverageSnapshots = pgTable("coverage_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
  label: text("label"),
  source: coverageSnapshotSourceEnum("source").default("manual").notNull(),
  dimensionsJson: text("dimensions_json").notNull(),
  gapsJson: text("gaps_json"),
  releaseId: uuid("release_id").references(() => releases.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const loginRateLimits = pgTable("login_rate_limits", {
  identifier: text("identifier").primaryKey(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  windowStartedAt: timestamp("window_started_at", { mode: "date" })
    .defaultNow()
    .notNull(),
  lockedUntil: timestamp("locked_until", { mode: "date" }),
});

/** Security audit trail (logins, tokens, roles, webhooks, exports). */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  actorId: uuid("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadataJson: text("metadata_json"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").default("").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * AI / agent proposal review queue (Phase 7).
 * Models and agents propose graph diffs; humans accept or reject.
 * Topology never writes model output straight into the graph.
 */
export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Primary entity type for the proposal (usually first diff). */
  entityType: text("entity_type").notNull(),
  /** JSON ProposalPayload from @topology/domain. */
  payloadJson: text("payload_json").notNull(),
  status: proposalStatusEnum("status").default("pending").notNull(),
  actorType: proposalActorTypeEnum("actor_type").default("agent").notNull(),
  model: text("model"),
  /** JSON string array of input refs (requirement ids, coverage gap keys, …). */
  inputRefs: text("input_refs"),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedById: uuid("approved_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

/** Polymorphic comments on intents / requirements (Phase 8). */
export const entityComments = pgTable("entity_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/** Single owner per entity (Phase 8). */
export const entityOwners = pgTable(
  "entity_owners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.workspaceId, t.entityType, t.entityId),
  ],
);

export type EntityComment = typeof entityComments.$inferSelect;
export type EntityOwner = typeof entityOwners.$inferSelect;

