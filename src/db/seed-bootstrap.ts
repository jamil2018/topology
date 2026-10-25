import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { hashToken, tokenLookupHashes } from "../lib/ci-auth";
import { MIN_PASSWORD_LENGTH } from "../lib/password";
import { ensureMembership } from "../lib/workspace";
import { db } from "./index";
import { apiTokens, users } from "./schema";

export async function bootstrapFirstAdmin() {
  const email = process.env.DEMO_USER_EMAIL ?? "demo@topology.local";
  const password = process.env.DEMO_USER_PASSWORD ?? "topology-demo";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEMO_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  const [user] =
    existing != null
      ? [existing]
      : await db
          .insert(users)
          .values({
            name: "Demo Operator",
            email,
            passwordHash,
            emailVerified: new Date(),
          })
          .returning();

  const { workspace } = await ensureMembership(user.id, "admin", {
    create: true,
  });
  const workspaceId = workspace.id;

  const demoToken = process.env.TOPOLOGY_API_TOKEN?.trim();
  if (demoToken) {
    const hashes = tokenLookupHashes(demoToken);
    const existingToken = await db.query.apiTokens.findFirst({
      where: inArray(apiTokens.tokenHash, hashes),
    });
    if (!existingToken) {
      await db.insert(apiTokens).values({
        workspaceId,
        name: "Local demo CLI token",
        tokenHash: hashToken(demoToken),
        tokenPrefix: demoToken.slice(0, 12),
        scope: "read,ci-write,agent",
        userId: user.id,
      });
    }
  }

  return { user, workspace, workspaceId, email, password, demoToken };
}
