import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenHasScope } from "./api-token-scopes";
import {
  envApiTokenBypassAllowed,
  generateApiToken,
  hashToken,
  hashTokenLegacySha256,
  mismatchedCiProjectHeader,
  tokenLookupHashes,
} from "./ci-auth";

const TOKEN_WS = "3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf";
const OTHER_WS = "8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7";

function requestWithProject(projectId?: string) {
  const headers = new Headers();
  if (projectId !== undefined) {
    headers.set("x-topology-project-id", projectId);
  }
  return new Request("http://x", { headers });
}

describe("hashToken", () => {
  it("returns HMAC-SHA256 of the token with AUTH_SECRET", () => {
    const token = "topo_demo_token_local_dev_only";
    const pepper = process.env.AUTH_SECRET ?? "";
    expect(hashToken(token)).toBe(
      createHmac("sha256", pepper).update(token, "utf8").digest("hex"),
    );
    expect(hashToken(token)).not.toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });
});

describe("tokenLookupHashes", () => {
  it("tries HMAC first and includes legacy sha256", () => {
    const token = "topo_legacy";
    expect(tokenLookupHashes(token)).toEqual([
      hashToken(token),
      hashTokenLegacySha256(token),
    ]);
  });
});

describe("generateApiToken", () => {
  it("creates topo_ tokens with matching prefix and HMAC hash", () => {
    const generated = generateApiToken();
    expect(generated.token).toMatch(/^topo_[a-f0-9]{48}$/);
    expect(generated.prefix).toBe(generated.token.slice(0, 12));
    expect(generated.hash).toBe(hashToken(generated.token));
  });

  it("generates unique tokens", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe("tokenHasScope", () => {
  it("treats ci-write and agent as including read", () => {
    expect(tokenHasScope("ci-write", "read")).toBe(true);
    expect(tokenHasScope("agent", "read")).toBe(true);
    expect(tokenHasScope("read", "read")).toBe(true);
    expect(tokenHasScope("read", "ci-write")).toBe(false);
    expect(tokenHasScope("ci-write", "agent")).toBe(false);
  });
});

describe("mismatchedCiProjectHeader", () => {
  it("ignores a missing header", () => {
    expect(mismatchedCiProjectHeader(requestWithProject(), TOKEN_WS)).toBeNull();
  });

  it("allows a UUID equal to the token workspace, ignoring case and trim", () => {
    expect(
      mismatchedCiProjectHeader(requestWithProject(TOKEN_WS), TOKEN_WS),
    ).toBeNull();
    expect(
      mismatchedCiProjectHeader(
        requestWithProject(`  ${TOKEN_WS.toUpperCase()}  `),
        TOKEN_WS,
      ),
    ).toBeNull();
  });

  it("rejects a foreign, malformed, or empty header with 403", () => {
    for (const header of [OTHER_WS, "not-a-uuid", "", "   "]) {
      expect(mismatchedCiProjectHeader(requestWithProject(header), TOKEN_WS)).toEqual(
        {
          ok: false,
          status: 403,
          error: "x-topology-project-id does not match token",
        },
      );
    }
  });
});

describe("envApiTokenBypassAllowed", () => {
  it("is off unless non-production and the explicit flag is set", () => {
    expect(
      envApiTokenBypassAllowed({
        NODE_ENV: "development",
        TOPOLOGY_ALLOW_ENV_API_TOKEN: "1",
      }),
    ).toBe(true);
    expect(
      envApiTokenBypassAllowed({
        NODE_ENV: "production",
        TOPOLOGY_ALLOW_ENV_API_TOKEN: "1",
      }),
    ).toBe(false);
    expect(
      envApiTokenBypassAllowed({
        NODE_ENV: "test",
        TOPOLOGY_ALLOW_ENV_API_TOKEN: undefined,
      }),
    ).toBe(false);
  });
});

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findToken: vi.fn(),
  updateWhere: vi.fn(),
  ensureDefaultWorkspace: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: mocks.findUser },
      apiTokens: { findFirst: mocks.findToken },
    },
    update: () => ({
      set: () => ({
        where: mocks.updateWhere,
      }),
    }),
  },
}));

vi.mock("@/lib/workspace", () => ({
  ensureDefaultWorkspace: mocks.ensureDefaultWorkspace,
}));

describe("authenticateCiRequest", () => {
  const storedToken = "topo_stored_token_for_tests";
  const previousEnvToken = process.env.TOPOLOGY_API_TOKEN;
  const previousAllow = process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN;

  beforeEach(() => {
    mocks.findUser.mockReset();
    mocks.findToken.mockReset();
    mocks.updateWhere.mockReset();
    mocks.ensureDefaultWorkspace.mockReset();
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.ensureDefaultWorkspace.mockResolvedValue({ id: TOKEN_WS });
    delete process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN;
    process.env.TOPOLOGY_API_TOKEN = "topo_env_should_not_bypass";
  });

  afterEach(() => {
    if (previousEnvToken === undefined) {
      delete process.env.TOPOLOGY_API_TOKEN;
    } else {
      process.env.TOPOLOGY_API_TOKEN = previousEnvToken;
    }
    if (previousAllow === undefined) {
      delete process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN;
    } else {
      process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN = previousAllow;
    }
  });

  it("does not accept TOPOLOGY_API_TOKEN from env without the explicit flag", async () => {
    mocks.findToken.mockResolvedValue(undefined);
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: "Bearer topo_env_should_not_bypass" },
      }),
    );
    expect(mocks.ensureDefaultWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Invalid API token",
    });
  });

  it("uses a stored token workspace and does not write when the header mismatches", async () => {
    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
      scope: "ci-write",
      revokedAt: null,
      expiresAt: null,
    });
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: {
          Authorization: `Bearer ${storedToken}`,
          "x-topology-project-id": OTHER_WS,
        },
      }),
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "x-topology-project-id does not match token",
    });
    expect(mocks.ensureDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });

  it("uses the stored token workspace when the header is absent", async () => {
    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
      scope: "read,ci-write",
      revokedAt: null,
      expiresAt: null,
    });
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: `Bearer ${storedToken}` },
      }),
    );
    expect(result).toEqual({
      ok: true,
      userId: "user-2",
      workspaceId: TOKEN_WS,
      tokenId: "tok-1",
      scopes: ["read", "ci-write"],
    });
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.ensureDefaultWorkspace).not.toHaveBeenCalled();
  });

  it("rejects revoked, expired, and under-scoped tokens", async () => {
    const { authenticateCiRequest } = await import("./ci-auth");
    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
      scope: "read",
      revokedAt: new Date(),
      expiresAt: null,
    });
    expect(
      await authenticateCiRequest(
        new Request("http://x", {
          headers: { Authorization: `Bearer ${storedToken}` },
        }),
      ),
    ).toMatchObject({ ok: false, status: 401, error: "API token revoked" });

    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
      scope: "read",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await authenticateCiRequest(
        new Request("http://x", {
          headers: { Authorization: `Bearer ${storedToken}` },
        }),
      ),
    ).toMatchObject({ ok: false, status: 401, error: "API token expired" });

    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
      scope: "read",
      revokedAt: null,
      expiresAt: null,
    });
    expect(
      await authenticateCiRequest(
        new Request("http://x", {
          headers: { Authorization: `Bearer ${storedToken}` },
        }),
        { requiredScope: "ci-write" },
      ),
    ).toMatchObject({
      ok: false,
      status: 403,
      error: "Token scope insufficient",
    });
  });

  it("accepts the env token only with TOPOLOGY_ALLOW_ENV_API_TOKEN=1", async () => {
    process.env.TOPOLOGY_ALLOW_ENV_API_TOKEN = "1";
    process.env.TOPOLOGY_API_TOKEN = "topo_env_bypass";
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: "Bearer topo_env_bypass" },
      }),
    );
    expect(mocks.ensureDefaultWorkspace).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      userId: "user-1",
      workspaceId: TOKEN_WS,
    });
  });
});
