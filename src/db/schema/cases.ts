import {
  boolean,
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
  caseStatusEnum,
  customFieldEntityEnum,
  customFieldTypeEnum,
  savedViewEntityEnum,
} from "./enums";
import { users, workspaces } from "./identity";

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("folders_workspace_id_idx").on(table.workspaceId),
    index("folders_parent_id_idx").on(table.parentId),
  ],
);

export const testIntents = pgTable(
  "test_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    behavior: text("behavior").default("").notNull(),
    /** Canonical structured representation JSON: { given, when, then }. */
    representationJson: text("representation_json"),
    criticality: casePriorityEnum("criticality").default("P2").notNull(),
    status: caseStatusEnum("status").default("draft").notNull(),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    /** Last freshness state we emitted intent.stale for (dedupe). */
    freshnessWebhookState: text("freshness_webhook_state"),
  },
  (table) => [
    unique().on(table.workspaceId, table.key),
    index("test_intents_folder_id_idx").on(table.folderId),
  ],
);

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
    /** Linked Test Intent — Case is the manual implementation of this intent. */
    intentId: uuid("intent_id").references(() => testIntents.id, {
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
  (table) => [
    unique().on(table.workspaceId, table.key),
    index("cases_folder_id_idx").on(table.folderId),
    index("cases_intent_id_idx").on(table.intentId),
  ],
);

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
}, (table) => [
  index("saved_views_workspace_id_idx").on(table.workspaceId),
]);

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
  /** When activity reflects AI-assisted graph changes (optional). */
  generatedBy: text("generated_by"),
  model: text("model"),
  approvedById: uuid("approved_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("case_activities_case_id_idx").on(table.caseId)]);

/** Reusable step block (name + ordered items). */
export const sharedSteps = pgTable("shared_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const sharedStepItems = pgTable(
  "shared_step_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sharedStepId: uuid("shared_step_id")
      .notNull()
      .references(() => sharedSteps.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    action: text("action").notNull(),
    expected: text("expected").default("").notNull(),
    data: text("data").default("").notNull(),
  },
  (table) => [unique().on(table.sharedStepId, table.position)],
);

/** Structured case steps. Legacy cases.steps / expected_result remain as projection. */
export const caseSteps = pgTable(
  "case_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    action: text("action").default("").notNull(),
    expected: text("expected").default("").notNull(),
    data: text("data").default("").notNull(),
    sharedStepId: uuid("shared_step_id").references(() => sharedSteps.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.caseId, table.position),
    index("case_steps_case_id_idx").on(table.caseId),
    index("case_steps_workspace_id_idx").on(table.workspaceId),
    index("case_steps_shared_step_id_idx").on(table.sharedStepId),
  ],
);

export const caseParameters = pgTable(
  "case_parameters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultValue: text("default_value").default("").notNull(),
    position: integer("position").default(0).notNull(),
  },
  (table) => [unique().on(table.caseId, table.name)],
);

export const caseDatasetRows = pgTable(
  "case_dataset_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    valuesJson: text("values_json").default("{}").notNull(),
  },
  (table) => [unique().on(table.caseId, table.position)],
);

/** Point-in-time case snapshot, linked to case_activities when recorded. */
export const caseVersions = pgTable(
  "case_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    activityId: uuid("activity_id").references(() => caseActivities.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.caseId, table.version),
    index("case_versions_workspace_id_idx").on(table.workspaceId),
  ],
);

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entity: customFieldEntityEnum("entity").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").default("text").notNull(),
    optionsJson: text("options_json"),
    required: boolean("required").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.entity, table.key)],
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFieldDefs.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    valueJson: text("value_json").notNull(),
  },
  (table) => [
    unique().on(table.fieldId, table.entityType, table.entityId),
    index("custom_field_values_entity_idx").on(table.entityType, table.entityId),
  ],
);

