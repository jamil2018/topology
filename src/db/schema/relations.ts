import { relations } from "drizzle-orm";
import {
  accounts,
  sessions,
  users,
  workspaceInvites,
  workspaceMembers,
  workspaceRoles,
  workspaces,
} from "./identity";
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
import {
  attachments,
  environments,
  linkedIssues,
  milestones,
  resultComments,
  runResults,
  runShards,
  runStepResults,
  runs,
  testPlanCases,
  testPlans,
  triageItems,
} from "./execution";
import {
  apiTokens,
  commits,
  pullRequests,
  repositories,
  webhookEndpoints,
} from "./integrations";
import {
  auditEvents,
  coverageSnapshots,
  entityComments,
  entityOwners,
  notifications,
  proposals,
  releaseSnapshots,
  releases,
} from "./ops";

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
  auditEvents: many(auditEvents),
  memberships: many(workspaceMembers),
  comments: many(resultComments),
  entityComments: many(entityComments),
  entityOwners: many(entityOwners),
  notifications: many(notifications),
  uploadedAttachments: many(attachments),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  invites: many(workspaceInvites),
  roles: many(workspaceRoles),
  folders: many(folders),
  cases: many(cases),
  testIntents: many(testIntents),
  testImplementations: many(testImplementations),
  environments: many(environments),
  requirements: many(requirements),
  risks: many(risks),
  components: many(components),
  qualityEdges: many(qualityEdges),
  repositories: many(repositories),
  pathComponentRules: many(pathComponentRules),
  failureSignatures: many(failureSignatures),
  journeys: many(journeys),
  releases: many(releases),
  runs: many(runs),
  milestones: many(milestones),
  triageItems: many(triageItems),
  linkedIssues: many(linkedIssues),
  webhookEndpoints: many(webhookEndpoints),
  apiTokens: many(apiTokens),
  auditEvents: many(auditEvents),
  savedViews: many(savedViews),
  proposals: many(proposals),
  entityComments: many(entityComments),
  entityOwners: many(entityOwners),
  coverageSnapshots: many(coverageSnapshots),
  notifications: many(notifications),
  sharedSteps: many(sharedSteps),
  testPlans: many(testPlans),
  customFieldDefs: many(customFieldDefs),
}));

export const entityCommentsRelations = relations(entityComments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [entityComments.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [entityComments.userId],
    references: [users.id],
  }),
}));

export const entityOwnersRelations = relations(entityOwners, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [entityOwners.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [entityOwners.userId],
    references: [users.id],
  }),
}));

export const coverageSnapshotsRelations = relations(
  coverageSnapshots,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [coverageSnapshots.workspaceId],
      references: [workspaces.id],
    }),
    release: one(releases, {
      fields: [coverageSnapshots.releaseId],
      references: [releases.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [notifications.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const proposalsRelations = relations(proposals, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [proposals.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [proposals.createdById],
    references: [users.id],
    relationName: "proposalAuthor",
  }),
  approvedBy: one(users, {
    fields: [proposals.approvedById],
    references: [users.id],
    relationName: "proposalApprover",
  }),
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
  testIntents: many(testIntents),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
}));

export const testIntentsRelations = relations(testIntents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [testIntents.workspaceId],
    references: [workspaces.id],
  }),
  folder: one(folders, {
    fields: [testIntents.folderId],
    references: [folders.id],
  }),
  assignee: one(users, {
    fields: [testIntents.assigneeId],
    references: [users.id],
  }),
  cases: many(cases),
  implementations: many(testImplementations),
}));

export const testImplementationsRelations = relations(
  testImplementations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [testImplementations.workspaceId],
      references: [workspaces.id],
    }),
    intent: one(testIntents, {
      fields: [testImplementations.intentId],
      references: [testIntents.id],
    }),
    case: one(cases, {
      fields: [testImplementations.caseId],
      references: [cases.id],
    }),
    stats: many(implementationStats),
  }),
);

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [environments.workspaceId],
    references: [workspaces.id],
  }),
  runs: many(runs),
}));

export const requirementsRelations = relations(requirements, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [requirements.workspaceId],
    references: [workspaces.id],
  }),
}));

export const risksRelations = relations(risks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [risks.workspaceId],
    references: [workspaces.id],
  }),
}));

export const componentsRelations = relations(components, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [components.workspaceId],
    references: [workspaces.id],
  }),
  pathRules: many(pathComponentRules),
}));

export const qualityEdgesRelations = relations(qualityEdges, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [qualityEdges.workspaceId],
    references: [workspaces.id],
  }),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [repositories.workspaceId],
    references: [workspaces.id],
  }),
  commits: many(commits),
  pullRequests: many(pullRequests),
}));

export const commitsRelations = relations(commits, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [commits.repositoryId],
    references: [repositories.id],
  }),
  runs: many(runs),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repositoryId],
    references: [repositories.id],
  }),
  runs: many(runs),
}));

export const pathComponentRulesRelations = relations(
  pathComponentRules,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [pathComponentRules.workspaceId],
      references: [workspaces.id],
    }),
    component: one(components, {
      fields: [pathComponentRules.componentId],
      references: [components.id],
    }),
  }),
);

export const casesRelations = relations(cases, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [cases.workspaceId],
    references: [workspaces.id],
  }),
  folder: one(folders, {
    fields: [cases.folderId],
    references: [folders.id],
  }),
  intent: one(testIntents, {
    fields: [cases.intentId],
    references: [testIntents.id],
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
  implementations: many(testImplementations),
  structuredSteps: many(caseSteps),
  parameters: many(caseParameters),
  datasetRows: many(caseDatasetRows),
  versions: many(caseVersions),
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

export const sharedStepsRelations = relations(sharedSteps, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [sharedSteps.workspaceId],
    references: [workspaces.id],
  }),
  items: many(sharedStepItems),
  caseSteps: many(caseSteps),
}));

export const sharedStepItemsRelations = relations(sharedStepItems, ({ one }) => ({
  sharedStep: one(sharedSteps, {
    fields: [sharedStepItems.sharedStepId],
    references: [sharedSteps.id],
  }),
}));

export const caseStepsRelations = relations(caseSteps, ({ one }) => ({
  case: one(cases, {
    fields: [caseSteps.caseId],
    references: [cases.id],
  }),
  sharedStep: one(sharedSteps, {
    fields: [caseSteps.sharedStepId],
    references: [sharedSteps.id],
  }),
}));

export const caseParametersRelations = relations(caseParameters, ({ one }) => ({
  case: one(cases, {
    fields: [caseParameters.caseId],
    references: [cases.id],
  }),
}));

export const caseDatasetRowsRelations = relations(caseDatasetRows, ({ one }) => ({
  case: one(cases, {
    fields: [caseDatasetRows.caseId],
    references: [cases.id],
  }),
}));

export const caseVersionsRelations = relations(caseVersions, ({ one }) => ({
  case: one(cases, {
    fields: [caseVersions.caseId],
    references: [cases.id],
  }),
  activity: one(caseActivities, {
    fields: [caseVersions.activityId],
    references: [caseActivities.id],
  }),
}));

export const testPlansRelations = relations(testPlans, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [testPlans.workspaceId],
    references: [workspaces.id],
  }),
  milestone: one(milestones, {
    fields: [testPlans.milestoneId],
    references: [milestones.id],
  }),
  cases: many(testPlanCases),
  runs: many(runs),
}));

export const testPlanCasesRelations = relations(testPlanCases, ({ one }) => ({
  plan: one(testPlans, {
    fields: [testPlanCases.planId],
    references: [testPlans.id],
  }),
  case: one(cases, {
    fields: [testPlanCases.caseId],
    references: [cases.id],
  }),
}));

export const runStepResultsRelations = relations(runStepResults, ({ one }) => ({
  result: one(runResults, {
    fields: [runStepResults.resultId],
    references: [runResults.id],
  }),
}));

export const customFieldDefsRelations = relations(
  customFieldDefs,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [customFieldDefs.workspaceId],
      references: [workspaces.id],
    }),
    values: many(customFieldValues),
  }),
);

export const customFieldValuesRelations = relations(
  customFieldValues,
  ({ one }) => ({
    field: one(customFieldDefs, {
      fields: [customFieldValues.fieldId],
      references: [customFieldDefs.id],
    }),
  }),
);

export const runsRelations = relations(runs, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [runs.workspaceId],
    references: [workspaces.id],
  }),
  environmentRef: one(environments, {
    fields: [runs.environmentId],
    references: [environments.id],
  }),
  pullRequest: one(pullRequests, {
    fields: [runs.pullRequestId],
    references: [pullRequests.id],
  }),
  commit: one(commits, {
    fields: [runs.commitId],
    references: [commits.id],
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
  plan: one(testPlans, {
    fields: [runs.planId],
    references: [testPlans.id],
  }),
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
  implementation: one(testImplementations, {
    fields: [runResults.implementationId],
    references: [testImplementations.id],
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
  stepResults: many(runStepResults),
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

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [milestones.workspaceId],
    references: [workspaces.id],
  }),
  folder: one(folders, {
    fields: [milestones.folderId],
    references: [folders.id],
  }),
  releases: many(releases),
}));

export const implementationStatsRelations = relations(
  implementationStats,
  ({ one }) => ({
    implementation: one(testImplementations, {
      fields: [implementationStats.implementationId],
      references: [testImplementations.id],
    }),
  }),
);

export const failureSignaturesRelations = relations(
  failureSignatures,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [failureSignatures.workspaceId],
      references: [workspaces.id],
    }),
    triageItems: many(triageItems),
  }),
);

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
  result: one(runResults, {
    fields: [triageItems.resultId],
    references: [runResults.id],
  }),
  signature: one(failureSignatures, {
    fields: [triageItems.signatureId],
    references: [failureSignatures.id],
  }),
}));

export const journeysRelations = relations(journeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [journeys.workspaceId],
    references: [workspaces.id],
  }),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [releases.workspaceId],
    references: [workspaces.id],
  }),
  milestone: one(milestones, {
    fields: [releases.milestoneId],
    references: [milestones.id],
  }),
  snapshots: many(releaseSnapshots),
}));

export const releaseSnapshotsRelations = relations(
  releaseSnapshots,
  ({ one }) => ({
    release: one(releases, {
      fields: [releaseSnapshots.releaseId],
      references: [releases.id],
    }),
  }),
);

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

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [auditEvents.workspaceId],
    references: [workspaces.id],
  }),
  actor: one(users, {
    fields: [auditEvents.actorId],
    references: [users.id],
  }),
}));

