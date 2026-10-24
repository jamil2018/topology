import { createHash, createHmac, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import {
  API_TOKEN_SCOPES,
  parseTokenScopes,
  tokenHasScope,
  type ApiTokenScope,
} from "@/lib/api-token-scopes";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export {
  API_TOKEN_SCOPES,
  isApiTokenScope,
  parseTokenScopes,
  serializeTokenScopes,
  tokenHasScope,
  type ApiTokenScope,
} from "@/lib/api-token-scopes";

function tokenPepper(): string {
  return (
    process.env.TOPOLOGY_TOKEN_PEPPER?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

export function hashTokenLegacySha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** HMAC-SHA256 with AUTH_SECRET or TOPOLOGY_TOKEN_PEPPER. */
export function hashToken(token: string): string {
  const pepper = tokenPepper();
  if (!pepper) {
    throw new Error(
      "AUTH_SECRET or TOPOLOGY_TOKEN_PEPPER is required to hash API tokens",
    );
  }
  return createHmac("sha256", pepper).update(token, "utf8").digest("hex");
}

export function tokenLookupHashes(token: string): string[] {
  const hashes = [hashTokenLegacySha256(token)];
  const pepper = tokenPepper();
  if (pepper) {
    hashes.unshift(hashToken(token));
  }
  return [...new Set(hashes)];
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `topo_${randomBytes(24).toString("hex")}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashToken(token),
  };
}

export const CI_PROJECT_HEADER = "x-topology-project-id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CiAuthFailure = { ok: false; status: number; error: string };

export type CiAuthSuccess = {
  ok: true;
  userId: string | null;
  workspaceId: string;
  tokenId: string | null;
  scopes: ApiTokenScope[];
};

/**
 * An absent header is not a scope. A present header must be a UUID equal to
 * the token workspace. A foreign or malformed id is rejected; it is never
 * used as the workspace.
 */
export function mismatchedCiProjectHeader(
  request: Request,
  workspaceId: string,
): CiAuthFailure | null {
  const raw = request.headers.get(CI_PROJECT_HEADER);
  if (raw == null) return null;
  const header = raw.trim();
  if (
    UUID_RE.test(header) &&
    header.toLowerCase() === workspaceId.toLowerCase()
  ) {
    return null;
  }
  return {
    ok: false,
    status: 403,
    error: "x-topology-project-id does not match token",
  };
}

export function envApiTokenBypassAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.NODE_ENV !== "production" && env.TOPOLOGY_ALLOW_ENV_API_TOKEN === "1"
  );
}

export async function authenticateCiRequest(
  request: Request,
  options?: { requiredScope?: ApiTokenScope },
): Promise<CiAuthSuccess | CiAuthFailure> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  if (envApiTokenBypassAllowed() && process.env.TOPOLOGY_API_TOKEN) {
    if (token === process.env.TOPOLOGY_API_TOKEN) {
      const demoEmail = process.env.DEMO_USER_EMAIL ?? "demo@topology.local";
      const user = await db.query.users.findFirst({
        where: eq(users.email, demoEmail),
      });
      const workspace = await ensureDefaultWorkspace();
      const rejected = mismatchedCiProjectHeader(request, workspace.id);
      if (rejected) return rejected;
      if (
        options?.requiredScope &&
        !tokenHasScope("read,ci-write,agent", options.requiredScope)
      ) {
        return { ok: false, status: 403, error: "Token scope insufficient" };
      }
      return {
        ok: true,
        userId: user?.id ?? null,
        workspaceId: workspace.id,
        tokenId: null,
        scopes: [...API_TOKEN_SCOPES],
      };
    }
  }

  const hashes = tokenLookupHashes(token);
  const row = await db.query.apiTokens.findFirst({
    where: inArray(apiTokens.tokenHash, hashes),
  });

  if (!row) {
    return { ok: false, status: 401, error: "Invalid API token" };
  }

  if (row.revokedAt) {
    return { ok: false, status: 401, error: "API token revoked" };
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, error: "API token expired" };
  }

  const scopes = parseTokenScopes(row.scope);
  if (
    options?.requiredScope &&
    !tokenHasScope(row.scope, options.requiredScope)
  ) {
    return { ok: false, status: 403, error: "Token scope insufficient" };
  }

  const rejected = mismatchedCiProjectHeader(request, row.workspaceId);
  if (rejected) return rejected;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id));

  return {
    ok: true,
    userId: row.userId,
    workspaceId: row.workspaceId,
    tokenId: row.id,
    scopes,
  };
}
