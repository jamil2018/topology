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

export async function authenticateCiRequest(request: Request): Promise<{
  ok: true;
  userId: string | null;
  workspaceId: string;
} | { ok: false; status: number; error: string }> {
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

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id));

  return { ok: true, userId: row.userId, workspaceId: row.workspaceId };
}
