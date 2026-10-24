import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  casePriorityEnum,
  implementationTypeEnum,
  qualityEntityTypeEnum,
  qualityRelationEnum,
  resultStatusEnum,
} from "./enums";
import { cases, testIntents } from "./cases";
import { workspaces } from "./identity";

export const testImplementations = pgTable(
  "test_implementations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => testIntents.id, { onDelete: "cascade" }),
    type: implementationTypeEnum("type").notNull(),
    caseId: uuid("case_id").references(() => cases.id, {
      onDelete: "set null",
    }),
    sourcePath: text("source_path"),
    externalKey: text("external_key"),
    framework: text("framework"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("test_implementations_workspace_id_idx").on(table.workspaceId),
    index("test_implementations_intent_id_idx").on(table.intentId),
    index("test_implementations_case_id_idx").on(table.caseId),
  ],
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    criticality: casePriorityEnum("criticality").default("P2").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
);

export const risks = pgTable(
  "risks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    criticality: casePriorityEnum("criticality").default("P2").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
);

export const components = pgTable(
  "components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    criticality: casePriorityEnum("criticality").default("P2").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
);

/** Typed Postgres graph edges between quality entities. */
export const qualityEdges = pgTable(
  "quality_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromType: qualityEntityTypeEnum("from_type").notNull(),
    fromId: uuid("from_id").notNull(),
    toType: qualityEntityTypeEnum("to_type").notNull(),
    toId: uuid("to_id").notNull(),
    relation: qualityRelationEnum("relation").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(
      table.workspaceId,
      table.fromType,
      table.fromId,
      table.toType,
      table.toId,
      table.relation,
    ),
    index("quality_edges_workspace_id_idx").on(table.workspaceId),
    index("quality_edges_from_idx").on(table.fromType, table.fromId),
    index("quality_edges_to_idx").on(table.toType, table.toId),
  ],
);

export const pathComponentRules = pgTable(
  "path_component_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.pattern)],
);

export const implementationStats = pgTable(
  "implementation_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    implementationId: uuid("implementation_id")
      .notNull()
      .references(() => testImplementations.id, { onDelete: "cascade" }),
    /** Rolling window length in days (e.g. 7, 30). */
    windowDays: integer("window_days").notNull(),
    passRate: doublePrecision("pass_rate"),
    flakeProbability: doublePrecision("flake_probability"),
    durationP50: integer("duration_p50"),
    durationP95: integer("duration_p95"),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    lastStatus: resultStatusEnum("last_status"),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.implementationId, table.windowDays)],
);

/** Clustered failure identity from normalized message + stack top. */
export const failureSignatures = pgTable(
  "failure_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    normalizedMessage: text("normalized_message").default("").notNull(),
    stackTop: text("stack_top").default("").notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.hash)],
);

export const journeys = pgTable(
  "journeys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    criticality: casePriorityEnum("criticality").default("P2").notNull(),
    description: text("description").default("").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
);


