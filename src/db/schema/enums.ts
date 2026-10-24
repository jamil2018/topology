import { pgEnum } from "drizzle-orm/pg-core";

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

export const implementationTypeEnum = pgEnum("implementation_type", [
  "manual",
  "junit",
  "playwright",
  "api",
  "unit",
  "agent",
]);

export const qualityEntityTypeEnum = pgEnum("quality_entity_type", [
  "intent",
  "requirement",
  "risk",
  "component",
  "case",
  "implementation",
  "journey",
]);

export const qualityRelationEnum = pgEnum("quality_relation", [
  "covers",
  "mitigates",
  "belongs_to",
  "implements",
  "part_of",
]);

export const environmentKindEnum = pgEnum("environment_kind", [
  "local",
  "ci",
  "staging",
  "prod",
]);

export const testPlanStatusEnum = pgEnum("test_plan_status", [
  "draft",
  "active",
  "completed",
  "archived",
]);

export const customFieldEntityEnum = pgEnum("custom_field_entity", [
  "case",
  "result",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "boolean",
  "select",
  "date",
]);

export const attachmentKindEnum = pgEnum("attachment_kind", [
  "screenshot",
  "log",
  "video",
  "trace",
  "other",
]);

export const repositoryProviderEnum = pgEnum("repository_provider", [
  "github",
  "gitlab",
  "other",
]);

export const pullRequestStatusEnum = pgEnum("pull_request_status", [
  "open",
  "closed",
  "merged",
  "draft",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const coverageSnapshotSourceEnum = pgEnum("coverage_snapshot_source", [
  "nightly",
  "release",
  "manual",
]);

export const proposalActorTypeEnum = pgEnum("proposal_actor_type", [
  "user",
  "agent",
  "model",
]);

export const linkedIssueProviders = [
  "mock",
  "jira",
  "linear",
  "github",
  "gitlab",
] as const;

export type LinkedIssueProvider = (typeof linkedIssueProviders)[number];

export const issueProviderEnum = pgEnum("issue_provider", [
  ...linkedIssueProviders,
]);

export function isLinkedIssueProvider(
  id: string,
): id is LinkedIssueProvider {
  return (linkedIssueProviders as readonly string[]).includes(id);
}

export function assertLinkedIssueProvider(id: string): LinkedIssueProvider {
  if (isLinkedIssueProvider(id)) return id;
  throw new Error(`Unsupported linked-issue provider "${id}"`);
}

export const issueRemoteStatusEnum = pgEnum("issue_remote_status", [
  "open",
  "in_progress",
  "done",
  "unknown",
]);

export const savedViewEntityEnum = pgEnum("saved_view_entity", [
  "cases",
  "runs",
  "intents",
]);

