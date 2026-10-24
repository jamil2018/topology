import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import {
  inviteStatusEnum,
  themePreferenceEnum,
  workspaceRoleEnum,
} from "./enums";

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
  /** Overrides TOPOLOGY_AI_PROVIDER when set (null = use env). */
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  aiBaseUrl: text("ai_base_url"),
  /** Show quality-graph destinations in nav and hub. Shared by the workspace. */
  qualityGraphEnabled: boolean("quality_graph_enabled")
    .default(false)
    .notNull(),
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

