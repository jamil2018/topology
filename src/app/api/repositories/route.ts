import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { ensureRepository } from "@/lib/git-sync";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  remoteUrl: z.string().min(1).max(2048),
  provider: z.enum(["github", "gitlab", "other"]).optional().default("github"),
  defaultBranch: z.string().min(1).max(200).optional().default("main"),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.repositories.findMany({
    where: eq(repositories.workspaceId, access.ctx.project.id),
    orderBy: [asc(repositories.remoteUrl)],
  });
  return NextResponse.json({ repositories: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const repository = await ensureRepository(access.ctx.project.id, {
      remoteUrl: parsed.data.remoteUrl,
      provider: parsed.data.provider,
      defaultBranch: parsed.data.defaultBranch,
    });
    return NextResponse.json({ repository }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not create repository" },
      { status: 409 },
    );
  }
}
