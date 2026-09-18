import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

export async function authenticateCiRequest(request: Request): Promise<
  | {
      ok: true;
      userId: string | null;
      workspaceId: string;
    }
  | CiAuthFailure
> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  // Local/dev escape hatch matching seeded demo token via env
  const envToken = process.env.TOPOLOGY_API_TOKEN;
  if (envToken && token === envToken) {
    const demoEmail = process.env.DEMO_USER_EMAIL ?? "demo@topology.local";
    const user = await db.query.users.findFirst({
      where: eq(users.email, demoEmail),
    });
    const workspace = await ensureDefaultWorkspace();
    const rejected = mismatchedCiProjectHeader(request, workspace.id);
    if (rejected) return rejected;
    return {
      ok: true,
      userId: user?.id ?? null,
      workspaceId: workspace.id,
    };
  }

  const hash = hashToken(token);
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
  });

  if (!row) {
    return { ok: false, status: 401, error: "Invalid API token" };
  }

  const rejected = mismatchedCiProjectHeader(request, row.workspaceId);
  if (rejected) return rejected;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id));

  return { ok: true, userId: row.userId, workspaceId: row.workspaceId };
}
