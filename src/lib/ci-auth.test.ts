import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateApiToken,
  hashToken,
  mismatchedCiProjectHeader,
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
  it("returns sha256 hex of the token", () => {
    const token = "topo_demo_token_local_dev_only";
    expect(hashToken(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });
});

describe("generateApiToken", () => {
  it("creates topo_ tokens with matching prefix and hash", () => {
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

describe("authenticateCiRequest project header", () => {
  const envToken = "topo_demo_token_local_dev_only";
  const previousEnvToken = process.env.TOPOLOGY_API_TOKEN;

  beforeEach(() => {
    mocks.findUser.mockReset();
    mocks.findToken.mockReset();
    mocks.updateWhere.mockReset();
    mocks.ensureDefaultWorkspace.mockReset();
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.ensureDefaultWorkspace.mockResolvedValue({ id: TOKEN_WS });
    process.env.TOPOLOGY_API_TOKEN = envToken;
  });

  afterEach(() => {
    if (previousEnvToken === undefined) {
      delete process.env.TOPOLOGY_API_TOKEN;
    } else {
      process.env.TOPOLOGY_API_TOKEN = previousEnvToken;
    }
  });

  it("keeps the env-token workspace when the header is absent", async () => {
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: `Bearer ${envToken}` },
      }),
    );
    expect(mocks.ensureDefaultWorkspace).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: true,
      userId: "user-1",
      workspaceId: TOKEN_WS,
    });
  });

  it("rejects a mismatched header after resolving the env-token workspace", async () => {
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: {
          Authorization: `Bearer ${envToken}`,
          "x-topology-project-id": OTHER_WS,
        },
      }),
    );
    expect(mocks.ensureDefaultWorkspace).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "x-topology-project-id does not match token",
    });
    expect(result).not.toMatchObject({ workspaceId: OTHER_WS });
  });

  it("uses a stored token workspace and does not write when the header mismatches", async () => {
    process.env.TOPOLOGY_API_TOKEN = "other-env-token";
    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
    });
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: {
          Authorization: "Bearer stored-token",
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
    process.env.TOPOLOGY_API_TOKEN = "other-env-token";
    mocks.findToken.mockResolvedValue({
      id: "tok-1",
      userId: "user-2",
      workspaceId: TOKEN_WS,
    });
    const { authenticateCiRequest } = await import("./ci-auth");
    const result = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: "Bearer stored-token" },
      }),
    );
    expect(result).toEqual({
      ok: true,
      userId: "user-2",
      workspaceId: TOKEN_WS,
    });
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.ensureDefaultWorkspace).not.toHaveBeenCalled();
  });
});
