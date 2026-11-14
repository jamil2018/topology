import { describe, expect, it } from "vitest";
import { API_TOKEN_SCOPES } from "../lib/api-token-scopes";
import { ACTION_CATALOG, inferLegacyRole } from "../lib/permissions";
import {
  assertE2eCatalog,
  E2E_CUSTOM_ROLE,
  E2E_DEMO_USER,
  E2E_PRIMARY_PROJECT_NAME,
  E2E_PROJECTS,
  E2E_TOKENS,
  E2E_USERS,
} from "./seed-e2e-catalog";

describe("e2e seed catalog", () => {
  it("keeps the demo admin and adds the role users with long passwords", () => {
    expect(() => assertE2eCatalog()).not.toThrow();
    expect(E2E_DEMO_USER).toEqual({
      email: "demo@topology.local",
      password: "topology-demo",
    });
    expect(E2E_PRIMARY_PROJECT_NAME).toBe("Harbor");
    expect(E2E_USERS.member.email).toBe("member@topology.local");
    expect(E2E_USERS.member.password).toBe("topology-member");
    expect(E2E_USERS.viewer.email).toBe("viewer@topology.local");
    expect(E2E_USERS.viewer.password).toBe("topology-viewer");
    expect(E2E_USERS.custom.email).toBe("custom@topology.local");
    expect(E2E_USERS.custom.password).toBe("topology-custom");
    expect(E2E_USERS.other.email).toBe("other@topology.local");
    expect(E2E_USERS.other.password).toBe("topology-other");
    expect(E2E_USERS.member.email).not.toBe(E2E_DEMO_USER.email);
  });

  it("allow-lists only cases.view and runs.view on the custom role", () => {
    expect([...E2E_CUSTOM_ROLE.actions]).toEqual(["cases.view", "runs.view"]);
    for (const action of E2E_CUSTOM_ROLE.actions) {
      expect(ACTION_CATALOG).toContain(action);
    }
    expect(inferLegacyRole(E2E_CUSTOM_ROLE.actions)).toBe("viewer");
  });

  it("defines scoped tokens plus one revoked read token", () => {
    expect(E2E_TOKENS.read).toMatchObject({
      token: "topo_e2e_read_token",
      scopes: ["read"],
      revoked: false,
    });
    expect(E2E_TOKENS.ciWrite).toMatchObject({
      token: "topo_e2e_ci_token",
      scopes: ["ci-write"],
      revoked: false,
    });
    expect(E2E_TOKENS.agent).toMatchObject({
      token: "topo_e2e_agent_token",
      scopes: ["agent"],
      revoked: false,
    });
    expect(E2E_TOKENS.revoked).toMatchObject({
      token: "topo_e2e_revoked_token",
      scopes: ["read"],
      revoked: true,
    });
    for (const spec of Object.values(E2E_TOKENS)) {
      expect(spec.scopes).toHaveLength(1);
      expect(API_TOKEN_SCOPES).toContain(spec.scopes[0]);
    }
  });

  it("names the extra projects and their cases", () => {
    expect(E2E_PROJECTS.harborBeta.name).toBe("Harbor Beta");
    expect(E2E_PROJECTS.harborBeta.caseKey).toBe("BETA-1");
    expect(E2E_PROJECTS.foreign.name).toBe("Foreign Project");
    expect(E2E_PROJECTS.foreign.caseKey).toBe("FOR-1");
  });
});
