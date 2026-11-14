import { MIN_PASSWORD_LENGTH } from "../lib/password";

/**
 * Fixed local/CI fixtures for `TOPOLOGY_SEED_MODE=e2e`.
 * Plaintext passwords and API tokens are harness values, not production secrets.
 *
 * A Topology project is a `workspaces` row. This mode keeps the demo admin on
 * Harbor (renamed by the demo seed) and adds:
 * - Harbor Beta, a second project the demo admin can switch to
 * - Foreign Project, the cross-tenant workspace. The harness contract calls
 *   that tenant "Other Workspace"; there is no parent row with that name.
 *   `workspaces.name` is "Foreign Project" (the project switcher label).
 */

export const E2E_PRIMARY_PROJECT_NAME = "Harbor";

export const E2E_DEMO_USER = {
  email: "demo@topology.local",
  password: "topology-demo",
} as const;

export const E2E_USERS = {
  member: {
    email: "member@topology.local",
    password: "topology-member",
    name: "E2E Member",
  },
  viewer: {
    email: "viewer@topology.local",
    password: "topology-viewer",
    name: "E2E Viewer",
  },
  custom: {
    email: "custom@topology.local",
    password: "topology-custom",
    name: "E2E Custom",
  },
  other: {
    email: "other@topology.local",
    password: "topology-other",
    name: "E2E Other",
  },
} as const;

/** Non-system role. Allow-list is exactly these two actions. */
export const E2E_CUSTOM_ROLE = {
  name: "E2E view cases and runs",
  description: "E2E allow-list: cases.view and runs.view only.",
  actions: ["cases.view", "runs.view"] as const,
};

export const E2E_PROJECTS = {
  harborBeta: {
    name: "Harbor Beta",
    slug: "harbor-beta",
    caseKey: "BETA-1",
    caseTitle: "Harbor Beta isolation case",
  },
  foreign: {
    name: "Foreign Project",
    slug: "foreign-project",
    caseKey: "FOR-1",
    caseTitle: "Foreign project isolation case",
  },
} as const;

export const E2E_TOKENS = {
  read: {
    token: "topo_e2e_read_token",
    name: "E2E read",
    scopes: ["read"] as const,
    revoked: false,
  },
  ciWrite: {
    token: "topo_e2e_ci_token",
    name: "E2E ci-write",
    scopes: ["ci-write"] as const,
    revoked: false,
  },
  agent: {
    token: "topo_e2e_agent_token",
    name: "E2E agent",
    scopes: ["agent"] as const,
    revoked: false,
  },
  revoked: {
    token: "topo_e2e_revoked_token",
    name: "E2E revoked read",
    scopes: ["read"] as const,
    revoked: true,
  },
} as const;

export const E2E_STORAGE_STATE = {
  admin: "e2e/.auth/admin.json",
  member: "e2e/.auth/member.json",
  viewer: "e2e/.auth/viewer.json",
  custom: "e2e/.auth/custom.json",
} as const;

export function assertE2eCatalog(): void {
  const passwords = [
    E2E_DEMO_USER.password,
    ...Object.values(E2E_USERS).map((user) => user.password),
  ];
  for (const password of passwords) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `E2E fixture password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  const actions = E2E_CUSTOM_ROLE.actions;
  if (
    actions.length !== 2 ||
    actions[0] !== "cases.view" ||
    actions[1] !== "runs.view"
  ) {
    throw new Error(
      "E2E custom role must allow only cases.view and runs.view",
    );
  }
}
