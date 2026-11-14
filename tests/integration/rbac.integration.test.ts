import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  E2E_CUSTOM_ROLE,
  E2E_DEMO_USER,
  E2E_PRIMARY_PROJECT_NAME,
  E2E_PROJECTS,
  E2E_TOKENS,
  E2E_USERS,
} from "@/db/seed-e2e-catalog";
import { ACTION_CATALOG, SYSTEM_ROLE_ACTIONS, type Action } from "@/lib/permissions";

const hasDb = Boolean(process.env.DATABASE_URL);

const authState = vi.hoisted(() => ({
  userId: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: async () =>
    authState.userId ? { user: { id: authState.userId } } : null,
}));

type RoleName = "admin" | "member" | "viewer" | "custom" | "other";

type Fixtures = {
  projectHeader: string;
  harborId: string;
  betaId: string;
  foreignId: string;
  harborCaseId: string;
  forCaseId: string;
  betaCaseId: string;
  forCaseTitle: string;
  users: Record<RoleName, string>;
};

const ROLE_ACTIONS: Record<Exclude<RoleName, "other">, readonly Action[]> = {
  admin: ACTION_CATALOG,
  member: SYSTEM_ROLE_ACTIONS.member,
  viewer: SYSTEM_ROLE_ACTIONS.viewer,
  custom: E2E_CUSTOM_ROLE.actions,
};

describe.skipIf(!hasDb)("RBAC and IDOR (integration)", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    process.env.DEMO_USER_EMAIL ??= E2E_DEMO_USER.email;
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";
    fx = await loadFixtures();
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterEach(() => {
    authState.userId = null;
  });

  it("enforces ACTION_CATALOG for admin, member, viewer, and the custom role", async () => {
    const { requireProjectAccess } = await import("@/lib/project");

    for (const role of ["admin", "member", "viewer", "custom"] as const) {
      const allowed = new Set<string>(ROLE_ACTIONS[role]);
      for (const action of ACTION_CATALOG) {
        const access = await requireProjectAccess(fx.users[role], {
          preferredId: fx.harborId,
          action,
        });
        if (allowed.has(action)) {
          expect(access.ok, `${role} ${action}`).toBe(true);
          if (access.ok) expect(access.ctx.project.id).toBe(fx.harborId);
        } else {
          expect(access.ok, `${role} ${action}`).toBe(false);
          if (!access.ok) {
            expect(access.status, `${role} ${action}`).toBe(403);
            expect(access.error).toBe(`Missing permission: ${action}`);
          }
        }
      }
    }
  });

  it("lets an admin create a case and rejects viewer and custom creates", async () => {
    const { POST } = await import("@/app/api/cases/route");
    const stamp = Date.now();

    const created = await POST(
      sessionRequest(fx, fx.users.admin, fx.harborId, "/api/cases", {
        method: "POST",
        body: {
          key: `RBAC-${stamp}`,
          title: `RBAC admin case ${stamp}`,
        },
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      case: { id: string; key: string; workspaceId: string };
    };
    expect(createdBody.case.key).toBe(`RBAC-${stamp}`);
    expect(createdBody.case.workspaceId).toBe(fx.harborId);

    try {
      for (const role of ["viewer", "custom"] as const) {
        const denied = await POST(
          sessionRequest(fx, fx.users[role], fx.harborId, "/api/cases", {
            method: "POST",
            body: {
              key: `RBAC-${role}-${stamp}`,
              title: `${role} must not create`,
            },
          }),
        );
        expect(denied.status, role).toBe(403);
        expect(await denied.json()).toMatchObject({
          error: "Missing permission: cases.create",
        });
      }
    } finally {
      const { db } = await import("@/db");
      const { cases } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(cases).where(eq(cases.id, createdBody.case.id));
    }
  });

  it("lets the custom role view cases and runs but not settings or members", async () => {
    const { GET: getCase } = await import("@/app/api/cases/[id]/route");
    const { GET: getPlans } = await import("@/app/api/plans/route");
    const { GET: getAi } = await import("@/app/api/ai/provider/route");
    const { POST: postWorkspace } = await import("@/app/api/workspace/route");
    const { POST: postRole } = await import("@/app/api/roles/route");

    const viewed = await getCase(
      sessionRequest(
        fx,
        fx.users.custom,
        fx.harborId,
        `/api/cases/${fx.harborCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.harborCaseId }) },
    );
    expect(viewed.status).toBe(200);
    const viewedBody = (await viewed.json()) as { case: { id: string } };
    expect(viewedBody.case.id).toBe(fx.harborCaseId);

    const plans = await getPlans(
      sessionRequest(fx, fx.users.custom, fx.harborId, "/api/plans"),
    );
    expect(plans.status).toBe(200);

    const settings = await getAi(
      sessionRequest(fx, fx.users.custom, fx.harborId, "/api/ai/provider"),
    );
    expect(settings.status).toBe(403);
    expect(await settings.json()).toMatchObject({
      error: "Missing permission: settings.view",
    });

    const invite = await postWorkspace(
      sessionRequest(fx, fx.users.custom, fx.harborId, "/api/workspace", {
        method: "POST",
        body: {
          email: `rbac-custom-${Date.now()}@topology.local`,
          role: "viewer",
        },
      }),
    );
    expect(invite.status).toBe(403);
    expect(await invite.json()).toMatchObject({
      error: "Missing permission: members.invite",
    });

    const role = await postRole(
      sessionRequest(fx, fx.users.custom, fx.harborId, "/api/roles", {
        method: "POST",
        body: {
          name: `RBAC denied ${Date.now()}`,
          actions: ["cases.view"],
        },
      }),
    );
    expect(role.status).toBe(403);
    expect(await role.json()).toMatchObject({
      error: "Missing permission: roles.manage",
    });
  });

  it("accepts ci-write, rejects read and agent on junit, and rejects revoked, garbage, and expired tokens", async () => {
    const { POST } = await import("@/app/api/ci/junit/route");
    const { GET: getCiRuns } = await import("@/app/api/ci/runs/route");
    const { GET: getAgent } = await import("@/app/api/agent/route");

    const listed = await getCiRuns(
      tokenRequest("/api/ci/runs", E2E_TOKENS.read.token),
    );
    expect(listed.status).toBe(200);

    const readWrite = await POST(
      tokenRequest("/api/ci/junit", E2E_TOKENS.read.token, {
        method: "POST",
        body: junitBody("read"),
      }),
    );
    expect(readWrite.status).toBe(403);
    expect(await readWrite.json()).toMatchObject({
      error: "Token scope insufficient",
    });

    const ciWrite = await POST(
      tokenRequest("/api/ci/junit", E2E_TOKENS.ciWrite.token, {
        method: "POST",
        body: junitBody("ci"),
      }),
    );
    expect(ciWrite.status).toBe(200);
    const ciBody = (await ciWrite.json()) as { run: { id: string } };
    expect(ciBody.run.id).toBeTruthy();

    const agentWrite = await POST(
      tokenRequest("/api/ci/junit", E2E_TOKENS.agent.token, {
        method: "POST",
        body: junitBody("agent"),
      }),
    );
    expect(agentWrite.status).toBe(403);
    expect(await agentWrite.json()).toMatchObject({
      error: "Token scope insufficient",
    });

    const agentRead = await getAgent(
      tokenRequest("/api/agent?resource=cases", E2E_TOKENS.agent.token),
    );
    expect(agentRead.status).toBe(200);

    const readAgent = await getAgent(
      tokenRequest("/api/agent?resource=cases", E2E_TOKENS.read.token),
    );
    expect(readAgent.status).toBe(403);
    expect(await readAgent.json()).toMatchObject({
      error: "Token scope insufficient",
    });

    const revoked = await POST(
      tokenRequest("/api/ci/junit", E2E_TOKENS.revoked.token, {
        method: "POST",
        body: junitBody("revoked"),
      }),
    );
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({
      error: "API token revoked",
    });

    const garbage = await POST(
      tokenRequest("/api/ci/junit", "topo_not_a_real_token", {
        method: "POST",
        body: junitBody("garbage"),
      }),
    );
    expect(garbage.status).toBe(401);
    expect(await garbage.json()).toMatchObject({
      error: "Invalid API token",
    });

    const expiredToken = `topo_rbac_expired_${Date.now()}`;
    const { db } = await import("@/db");
    const { apiTokens } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { hashToken } = await import("@/lib/ci-auth");
    const [row] = await db
      .insert(apiTokens)
      .values({
        workspaceId: fx.harborId,
        userId: fx.users.admin,
        name: "RBAC expired",
        tokenHash: hashToken(expiredToken),
        tokenPrefix: expiredToken.slice(0, 12),
        scope: "ci-write",
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning();
    try {
      const expired = await POST(
        tokenRequest("/api/ci/junit", expiredToken, {
          method: "POST",
          body: junitBody("expired"),
        }),
      );
      expect(expired.status).toBe(401);
      expect(await expired.json()).toMatchObject({
        error: "API token expired",
      });
    } finally {
      await db.delete(apiTokens).where(eq(apiTokens.id, row.id));
    }
  });

  it("rejects an environment API token in production", async () => {
    const { authenticateCiRequest, envApiTokenBypassAllowed } = await import(
      "@/lib/ci-auth"
    );
    expect(
      envApiTokenBypassAllowed({
        NODE_ENV: "production",
        TOPOLOGY_ALLOW_ENV_API_TOKEN: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);

    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllow = process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN;
    const previousToken = process.env.TOPOLOGY_API_TOKEN;
    const ghost = `topo_env_only_${Date.now()}`;
    try {
      process.env.NODE_ENV = "production";
      process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN = "1";
      process.env.TOPOLOGY_API_TOKEN = ghost;
      const result = await authenticateCiRequest(
        new Request("http://127.0.0.1/api/ci/junit", {
          headers: { Authorization: `Bearer ${ghost}` },
        }),
        { requiredScope: "ci-write" },
      );
      expect(result).toEqual({
        ok: false,
        status: 401,
        error: "Invalid API token",
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAllow === undefined) {
        delete process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN;
      } else {
        process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN = previousAllow;
      }
      if (previousToken === undefined) delete process.env.TOPOLOGY_API_TOKEN;
      else process.env.TOPOLOGY_API_TOKEN = previousToken;
    }
  });

  it("hides Foreign Project case FOR-1 from the Harbor admin and Harbor Beta case BETA-1 from the member", async () => {
    const { GET, PATCH } = await import("@/app/api/cases/[id]/route");
    const { db } = await import("@/db");
    const { cases } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const ownerRead = await GET(
      sessionRequest(
        fx,
        fx.users.other,
        fx.foreignId,
        `/api/cases/${fx.forCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.forCaseId }) },
    );
    expect(ownerRead.status).toBe(200);
    expect(await ownerRead.json()).toMatchObject({
      case: { id: fx.forCaseId, key: E2E_PROJECTS.foreign.caseKey },
    });

    const betaRead = await GET(
      sessionRequest(
        fx,
        fx.users.admin,
        fx.betaId,
        `/api/cases/${fx.betaCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.betaCaseId }) },
    );
    expect(betaRead.status).toBe(200);
    expect(await betaRead.json()).toMatchObject({
      case: { key: E2E_PROJECTS.harborBeta.caseKey },
    });

    const crossHeader = await GET(
      sessionRequest(
        fx,
        fx.users.admin,
        fx.foreignId,
        `/api/cases/${fx.forCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.forCaseId }) },
    );
    expect(crossHeader.status).toBe(403);
    expect(await crossHeader.json()).toMatchObject({
      error: "No accessible project",
    });

    const sameProjectRead = await GET(
      sessionRequest(
        fx,
        fx.users.admin,
        fx.harborId,
        `/api/cases/${fx.forCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.forCaseId }) },
    );
    expect(sameProjectRead.status).toBe(404);
    expect(await sameProjectRead.json()).toMatchObject({
      error: "Case not found",
    });

    const poisonedTitle = `IDOR ${Date.now()}`;
    const sameProjectPatch = await PATCH(
      sessionRequest(
        fx,
        fx.users.admin,
        fx.harborId,
        `/api/cases/${fx.forCaseId}`,
        { method: "PATCH", body: { title: poisonedTitle } },
      ),
      { params: Promise.resolve({ id: fx.forCaseId }) },
    );
    expect(sameProjectPatch.status).toBe(404);
    expect(await sameProjectPatch.json()).toMatchObject({
      error: "Case not found",
    });

    const foreignHeaderPatch = await PATCH(
      sessionRequest(
        fx,
        fx.users.admin,
        fx.foreignId,
        `/api/cases/${fx.forCaseId}`,
        { method: "PATCH", body: { title: poisonedTitle } },
      ),
      { params: Promise.resolve({ id: fx.forCaseId }) },
    );
    expect(foreignHeaderPatch.status).toBe(403);
    expect(await foreignHeaderPatch.json()).toMatchObject({
      error: "No accessible project",
    });

    const stored = await db.query.cases.findFirst({
      where: eq(cases.id, fx.forCaseId),
    });
    expect(stored?.title).toBe(fx.forCaseTitle);
    expect(stored?.workspaceId).toBe(fx.foreignId);

    const memberCrossHeader = await GET(
      sessionRequest(
        fx,
        fx.users.member,
        fx.betaId,
        `/api/cases/${fx.betaCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.betaCaseId }) },
    );
    expect(memberCrossHeader.status).toBe(403);
    expect(await memberCrossHeader.json()).toMatchObject({
      error: "No accessible project",
    });

    const memberSameProject = await GET(
      sessionRequest(
        fx,
        fx.users.member,
        fx.harborId,
        `/api/cases/${fx.betaCaseId}`,
      ),
      { params: Promise.resolve({ id: fx.betaCaseId }) },
    );
    expect(memberSameProject.status).toBe(404);
    expect(await memberSameProject.json()).toMatchObject({
      error: "Case not found",
    });
  });
});

async function loadFixtures(): Promise<Fixtures> {
  const { db } = await import("@/db");
  const { cases, users, workspaceMembers, workspaces } = await import(
    "@/db/schema"
  );
  const { and, eq } = await import("drizzle-orm");
  const { PROJECT_HEADER } = await import("@/lib/project");

  async function userId(email: string) {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!row) {
      throw new Error(
        `Missing ${email}. Seed with TOPOLOGY_SEED_MODE=e2e.`,
      );
    }
    return row.id;
  }

  const adminId = await userId(E2E_DEMO_USER.email);
  const memberships = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, adminId),
    with: { workspace: true },
  });
  const harbor = memberships.find(
    (row) => row.workspace?.name === E2E_PRIMARY_PROJECT_NAME,
  )?.workspace;
  const beta = memberships.find(
    (row) => row.workspace?.slug === E2E_PROJECTS.harborBeta.slug,
  )?.workspace;
  if (!harbor) {
    throw new Error(`Missing project ${E2E_PRIMARY_PROJECT_NAME}`);
  }
  if (!beta) throw new Error("Harbor Beta missing for the demo admin");

  const foreign = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, E2E_PROJECTS.foreign.slug),
  });
  if (!foreign) throw new Error("Foreign Project missing");

  const harborCase = await db.query.cases.findFirst({
    where: eq(cases.workspaceId, harbor.id),
  });
  const forCase = await db.query.cases.findFirst({
    where: and(
      eq(cases.workspaceId, foreign.id),
      eq(cases.key, E2E_PROJECTS.foreign.caseKey),
    ),
  });
  const betaCase = await db.query.cases.findFirst({
    where: and(
      eq(cases.workspaceId, beta.id),
      eq(cases.key, E2E_PROJECTS.harborBeta.caseKey),
    ),
  });
  if (!harborCase) throw new Error("Harbor has no case to view");
  if (!forCase) throw new Error("FOR-1 missing");
  if (!betaCase) throw new Error("BETA-1 missing");

  return {
    projectHeader: PROJECT_HEADER,
    harborId: harbor.id,
    betaId: beta.id,
    foreignId: foreign.id,
    harborCaseId: harborCase.id,
    forCaseId: forCase.id,
    betaCaseId: betaCase.id,
    forCaseTitle: forCase.title,
    users: {
      admin: adminId,
      member: await userId(E2E_USERS.member.email),
      viewer: await userId(E2E_USERS.viewer.email),
      custom: await userId(E2E_USERS.custom.email),
      other: await userId(E2E_USERS.other.email),
    },
  };
}

function sessionRequest(
  fx: Fixtures,
  userId: string,
  projectId: string,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  authState.userId = userId;
  const method = init?.method ?? "GET";
  const hasBody = init?.body !== undefined;
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: {
      [fx.projectHeader]: projectId,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
}

function tokenRequest(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
) {
  const method = init?.method ?? "GET";
  const hasBody = init?.body !== undefined;
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
}

function junitBody(label: string) {
  const stamp = `${label}-${Date.now()}`;
  return {
    name: `RBAC junit ${stamp}`,
    source: "cli",
    results: [
      {
        externalKey: `rbac::${stamp}`,
        classname: "rbac",
        name: label,
        status: "passed",
        notes: "",
        durationMs: 1,
      },
    ],
  };
}
