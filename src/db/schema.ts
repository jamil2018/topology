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
  environment: text("environment").default("local").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const runResults = pgTable(
  "run_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    status: resultStatusEnum("status").default("untested").notNull(),
    notes: text("notes").default("").notNull(),
    executedById: uuid("executed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    executedAt: timestamp("executed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  cases: many(cases),
  runs: many(runs),
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
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [runs.createdById],
    references: [users.id],
  }),
  results: many(runResults),
}));

export const runResultsRelations = relations(runResults, ({ one }) => ({
  run: one(runs, {
    fields: [runResults.runId],
    references: [runs.id],
  }),
  case: one(cases, {
    fields: [runResults.caseId],
    references: [cases.id],
  }),
}));

export type Case = typeof cases.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunResult = typeof runResults.$inferSelect;
export type User = typeof users.$inferSelect;
