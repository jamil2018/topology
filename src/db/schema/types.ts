import {
  caseActivities,
  caseDatasetRows,
  caseParameters,
  caseSteps,
  caseVersions,
  cases,
  customFieldDefs,
  customFieldValues,
  folders,
  savedViews,
  sharedStepItems,
  sharedSteps,
  testIntents,
} from "./cases";
import {
  attachmentKindEnum,
  coverageSnapshotSourceEnum,
  environmentKindEnum,
  proposalActorTypeEnum,
  proposalStatusEnum,
  workspaceRoleEnum,
} from "./enums";
import {
  attachments,
  environments,
  linkedIssues,
  milestones,
  resultComments,
  runResults,
  runStepResults,
  runs,
  testPlanCases,
  testPlans,
  triageItems,
} from "./execution";
import {
  accounts,
  users,
  workspaceInvites,
  workspaceMembers,
  workspaceRoles,
  workspaces,
} from "./identity";
import {
  apiTokens,
  commits,
  pullRequests,
  repositories,
} from "./integrations";
import {
  auditEvents,
  coverageSnapshots,
  loginRateLimits,
  notifications,
  proposals,
  releaseSnapshots,
  releases,
} from "./ops";
import {
  components,
  failureSignatures,
  implementationStats,
  journeys,
  pathComponentRules,
  qualityEdges,
  requirements,
  risks,
  testImplementations,
} from "./quality";

export type Project = Workspace;

export type Case = typeof cases.$inferSelect;
export type TestIntent = typeof testIntents.$inferSelect;
export type TestImplementation = typeof testImplementations.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Risk = typeof risks.$inferSelect;
export type Component = typeof components.$inferSelect;
export type QualityEdge = typeof qualityEdges.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type Commit = typeof commits.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type PathComponentRule = typeof pathComponentRules.$inferSelect;
export type ImplementationStat = typeof implementationStats.$inferSelect;
export type FailureSignature = typeof failureSignatures.$inferSelect;
export type Journey = typeof journeys.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type ReleaseSnapshot = typeof releaseSnapshots.$inferSelect;
export type CoverageSnapshot = typeof coverageSnapshots.$inferSelect;
export type CoverageSnapshotSource =
  (typeof coverageSnapshotSourceEnum.enumValues)[number];
export type Notification = typeof notifications.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunResult = typeof runResults.$inferSelect;
export type User = typeof users.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type TriageItem = typeof triageItems.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type LoginRateLimit = typeof loginRateLimits.$inferSelect;
export type LinkedIssue = typeof linkedIssues.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type WorkspaceCustomRole = typeof workspaceRoles.$inferSelect;
export type ResultComment = typeof resultComments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
export type EnvironmentKind = (typeof environmentKindEnum.enumValues)[number];
export type AttachmentKind = (typeof attachmentKindEnum.enumValues)[number];
export type SavedView = typeof savedViews.$inferSelect;
export type CaseActivity = typeof caseActivities.$inferSelect;
export type SharedStep = typeof sharedSteps.$inferSelect;
export type SharedStepItem = typeof sharedStepItems.$inferSelect;
export type CaseStep = typeof caseSteps.$inferSelect;
export type CaseParameter = typeof caseParameters.$inferSelect;
export type CaseDatasetRow = typeof caseDatasetRows.$inferSelect;
export type CaseVersion = typeof caseVersions.$inferSelect;
export type TestPlan = typeof testPlans.$inferSelect;
export type TestPlanCase = typeof testPlanCases.$inferSelect;
export type RunStepResult = typeof runStepResults.$inferSelect;
export type CustomFieldDef = typeof customFieldDefs.$inferSelect;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];
export type ProposalActorType =
  (typeof proposalActorTypeEnum.enumValues)[number];


