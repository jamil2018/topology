import type { WorkspaceRole } from "@/db/schema";

/**
 * Explicit allow-list of permission actions.
 * Keys are stable API/UI identifiers — never rename without a migration.
 */
export const ACTION_CATALOG = [
  "cases.view",
  "cases.create",
  "cases.edit",
  "cases.delete",
  "intents.view",
  "intents.create",
  "intents.edit",
  "intents.delete",
  "requirements.view",
  "requirements.create",
  "requirements.edit",
  "requirements.delete",
  "proposals.view",
  "proposals.create",
  "proposals.review",
  "releases.view",
  "releases.create",
  "releases.edit",
  "releases.delete",
  "journeys.view",
  "journeys.create",
  "journeys.edit",
  "journeys.delete",
  "runs.view",
  "runs.create",
  "runs.edit",
  "runs.delete",
  "runs.complete",
  "reports.view",
  "reports.create",
  "automation.view",
  "automation.manage",
  "milestones.view",
  "milestones.manage",
  "triage.manage",
  "folders.manage",
  "settings.view",
  "webhooks.manage",
  "project.manage",
  "members.invite",
  "roles.manage",
] as const;

export type Action = (typeof ACTION_CATALOG)[number];

export type ActionGroup = {
  id: string;
  label: string;
  actions: Action[];
};

export const ACTION_GROUPS: ActionGroup[] = [
  {
    id: "cases",
    label: "Cases",
    actions: ["cases.view", "cases.create", "cases.edit", "cases.delete"],
  },
  {
    id: "intents",
    label: "Intents",
    actions: [
      "intents.view",
      "intents.create",
      "intents.edit",
      "intents.delete",
    ],
  },
  {
    id: "requirements",
    label: "Requirements",
    actions: [
      "requirements.view",
      "requirements.create",
      "requirements.edit",
      "requirements.delete",
    ],
  },
  {
    id: "proposals",
    label: "Proposals",
    actions: ["proposals.view", "proposals.create", "proposals.review"],
  },
  {
    id: "releases",
    label: "Releases",
    actions: [
      "releases.view",
      "releases.create",
      "releases.edit",
      "releases.delete",
    ],
  },
  {
    id: "journeys",
    label: "Journeys",
    actions: [
      "journeys.view",
      "journeys.create",
      "journeys.edit",
      "journeys.delete",
    ],
  },
  {
    id: "runs",
    label: "Runs",
    actions: [
      "runs.view",
      "runs.create",
      "runs.edit",
      "runs.delete",
      "runs.complete",
    ],
  },
  {
    id: "reports",
    label: "Reports",
    actions: ["reports.view", "reports.create"],
  },
  {
    id: "automation",
    label: "Automation",
    actions: ["automation.view", "automation.manage"],
  },
  {
    id: "milestones",
    label: "Milestones",
    actions: ["milestones.view", "milestones.manage"],
  },
  {
    id: "ops",
    label: "Triage & folders",
    actions: ["triage.manage", "folders.manage"],
  },
  {
    id: "admin",
    label: "Project admin",
    actions: [
      "settings.view",
      "webhooks.manage",
      "project.manage",
      "members.invite",
      "roles.manage",
    ],
  },
];

export const ACTION_LABELS: Record<Action, string> = {
  "cases.view": "View cases",
  "cases.create": "Create cases",
  "cases.edit": "Edit cases",
  "cases.delete": "Delete cases",
  "intents.view": "View intents",
  "intents.create": "Create intents",
  "intents.edit": "Edit intents",
  "intents.delete": "Delete intents",
  "requirements.view": "View requirements",
  "requirements.create": "Create requirements",
  "requirements.edit": "Edit requirements",
  "requirements.delete": "Delete requirements",
  "proposals.view": "View proposals",
  "proposals.create": "Create proposals",
  "proposals.review": "Accept or reject proposals",
  "releases.view": "View releases",
  "releases.create": "Create releases",
  "releases.edit": "Edit releases",
  "releases.delete": "Delete releases",
  "journeys.view": "View journeys",
  "journeys.create": "Create journeys",
  "journeys.edit": "Edit journeys",
  "journeys.delete": "Delete journeys",
  "runs.view": "View runs",
  "runs.create": "Create runs",
  "runs.edit": "Edit runs / record results",
  "runs.delete": "Delete runs",
  "runs.complete": "Complete runs",
  "reports.view": "View reports",
  "reports.create": "Create reports",
  "automation.view": "View automation",
  "automation.manage": "Manage automation",
  "milestones.view": "View milestones",
  "milestones.manage": "Manage milestones",
  "triage.manage": "Manage triage",
  "folders.manage": "Manage folders",
  "settings.view": "View settings",
  "webhooks.manage": "Manage webhooks",
  "project.manage": "Manage project",
  "members.invite": "Invite members",
  "roles.manage": "Manage roles",
};

/** Actions granted to legacy system roles (migration + fallback). */
export const SYSTEM_ROLE_ACTIONS: Record<WorkspaceRole, readonly Action[]> = {
  admin: [...ACTION_CATALOG],
  member: [
    "cases.view",
    "cases.create",
    "cases.edit",
    "cases.delete",
    "intents.view",
    "intents.create",
    "intents.edit",
    "intents.delete",
    "requirements.view",
    "requirements.create",
    "requirements.edit",
    "requirements.delete",
    "proposals.view",
    "proposals.create",
    "proposals.review",
    "releases.view",
    "releases.create",
    "releases.edit",
    "releases.delete",
    "journeys.view",
    "journeys.create",
    "journeys.edit",
    "journeys.delete",
    "runs.view",
    "runs.create",
    "runs.edit",
    "runs.delete",
    "runs.complete",
    "reports.view",
    "reports.create",
    "automation.view",
    "automation.manage",
    "milestones.view",
    "milestones.manage",
    "triage.manage",
    "folders.manage",
    "settings.view",
  ],
  viewer: [
    "cases.view",
    "intents.view",
    "requirements.view",
    "proposals.view",
    "releases.view",
    "journeys.view",
    "runs.view",
    "reports.view",
    "automation.view",
    "milestones.view",
    "settings.view",
  ],
};

export const SYSTEM_ROLE_META: Record<
  WorkspaceRole,
  { name: string; description: string }
> = {
  admin: {
    name: "Admin",
    description: "Full project access, including members and roles.",
  },
  member: {
    name: "Member",
    description: "Create and edit cases, runs, and related project data.",
  },
  viewer: {
    name: "Viewer",
    description: "Read-only access to cases, runs, and reports.",
  },
};

const ACTION_SET = new Set<string>(ACTION_CATALOG);

export function isAction(value: string): value is Action {
  return ACTION_SET.has(value);
}

export function normalizeActions(actions: readonly string[]): Action[] {
  const seen = new Set<Action>();
  for (const raw of actions) {
    if (isAction(raw)) seen.add(raw);
  }
  return ACTION_CATALOG.filter((a) => seen.has(a));
}

export function roleHasAction(
  actions: readonly string[] | null | undefined,
  action: Action,
): boolean {
  if (!actions || actions.length === 0) return false;
  return actions.includes(action);
}

export function legacyRoleHasAction(
  role: WorkspaceRole | null | undefined,
  action: Action,
): boolean {
  if (!role) return false;
  return roleHasAction(SYSTEM_ROLE_ACTIONS[role], action);
}

/** True when the action set matches legacy write (member+) access. */
export function actionsAllowWrite(actions: readonly string[] | null | undefined) {
  return (
    roleHasAction(actions, "cases.create") ||
    roleHasAction(actions, "cases.edit") ||
    roleHasAction(actions, "runs.create") ||
    roleHasAction(actions, "runs.edit")
  );
}

/** True when the action set matches legacy admin access. */
export function actionsAllowAdmin(actions: readonly string[] | null | undefined) {
  return (
    roleHasAction(actions, "roles.manage") ||
    roleHasAction(actions, "members.invite") ||
    roleHasAction(actions, "project.manage")
  );
}

/**
 * Map a custom action set onto the coarse enum stored on members and invites.
 * Custom roles are never persisted as admin. That enum is ORed into write and
 * admin gates, so a partial set such as `members.invite` must not become admin.
 * System roles keep their `systemKey` and do not use this helper.
 */
export function inferLegacyRole(
  actions: readonly string[] | null | undefined,
): WorkspaceRole {
  if (actionsAllowWrite(actions)) return "member";
  return "viewer";
}

export function denyMessage(action: Action): string {
  return `Missing permission: ${action}`;
}
