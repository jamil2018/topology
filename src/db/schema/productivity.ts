import { pgTable, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users, workspaces } from "./identity";
import { cases } from "./cases";
import { runResults } from "./execution";

export const runTemplates = pgTable("run_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Ordered IDs intentionally survive case deletion so launch can report missing cases.
  caseIds: uuid("case_ids").array().notNull(),
  environment: text("environment").notNull().default("local"),
  // Preserve removed-user references for explicit correction during launch.
  assigneeId: uuid("assignee_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("run_templates_workspace_idx").on(table.workspaceId)]);

export const retestSources = pgTable("retest_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceResultId: uuid("source_result_id").notNull().references(() => runResults.id, { onDelete: "cascade" }),
  resultId: uuid("result_id").notNull().references(() => runResults.id, { onDelete: "cascade" }),
}, (table) => [unique().on(table.sourceResultId, table.resultId), index("retest_sources_result_idx").on(table.resultId)]);

/** A retest mapping does not rewrite the historical automation result. */
export const resultCaseLinks = pgTable("result_case_links", {
  resultId: uuid("result_id").primaryKey().references(() => runResults.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
