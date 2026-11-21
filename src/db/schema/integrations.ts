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
  notificationChannelKindEnum,
  pullRequestStatusEnum,
  repositoryProviderEnum,
} from "./enums";
import { users, workspaces } from "./identity";

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: repositoryProviderEnum("provider").default("github").notNull(),
    remoteUrl: text("remote_url").notNull(),
    defaultBranch: text("default_branch").default("main").notNull(),
    /** Optional HMAC secret for inbound GitHub webhooks for this remote. */
    webhookSecret: text("webhook_secret"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.remoteUrl)],
);

export const commits = pgTable(
  "commits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    message: text("message").default("").notNull(),
    committedAt: timestamp("committed_at", { mode: "date" }).notNull(),
    /** JSON array of changed file paths for impact analysis. */
    changedPathsJson: text("changed_paths_json").default("[]").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.repositoryId, table.sha)],
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    base: text("base").notNull(),
    head: text("head").notNull(),
    status: pullRequestStatusEnum("status").default("open").notNull(),
    /** JSON array of changed file paths for impact analysis. */
    changedPathsJson: text("changed_paths_json").default("[]").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.repositoryId, table.number)],
);

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  /** Comma-separated scopes: read, ci-write, agent. */
  scope: text("scope").default("read,ci-write,agent").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").default("").notNull(),
  /** Comma-separated event names: run.completed,issue.created,intent.stale,coverage.dropped,proposal.created */
  events: text("events").default("run.completed,issue.created").notNull(),
  enabled: integer("enabled").default(1).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  lastDeliveredAt: timestamp("last_delivered_at", { mode: "date" }),
  lastStatus: integer("last_status"),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

/** Durable outbound webhook delivery log (Phase 3.2 persists rows here). */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    /** Stable id shared across retries (X-Topology-Delivery). */
    deliveryId: text("delivery_id").notNull(),
    requestBody: text("request_body").notNull(),
    responseStatus: integer("response_status"),
    responseExcerpt: text("response_excerpt").default("").notNull(),
    attemptCount: integer("attempt_count").default(1).notNull(),
    durationMs: integer("duration_ms"),
    deliveredAt: timestamp("delivered_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_endpoint_id_idx").on(table.endpointId),
    index("webhook_deliveries_workspace_id_idx").on(table.workspaceId),
    index("webhook_deliveries_delivery_id_idx").on(table.deliveryId),
    index("webhook_deliveries_delivered_at_idx").on(table.deliveredAt),
  ],
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

/**
 * External alert channels (Slack / Teams / SMTP).
 * `config_json` may hold secrets (webhook URLs, SMTP passwords); treat as write-only
 * at the API layer the same way `webhook_endpoints.secret` is never returned.
 */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: notificationChannelKindEnum("kind").notNull(),
    name: text("name").notNull(),
    configJson: text("config_json").default("{}").notNull(),
    /** Comma-separated: assignment,mention,run.completed,coverage.dropped */
    events: text("events")
      .default("assignment,mention,run.completed,coverage.dropped")
      .notNull(),
    enabled: integer("enabled").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("notification_channels_workspace_id_idx").on(table.workspaceId),
  ],
);

export type NotificationChannel = typeof notificationChannels.$inferSelect;

