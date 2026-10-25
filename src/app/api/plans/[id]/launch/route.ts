import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { launchPlan } from "@/lib/tcm/plans";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }
  let namePrefix: string | undefined;
  try {
    const body = (await request.json()) as { namePrefix?: string };
    namePrefix = body.namePrefix;
  } catch {
    namePrefix = undefined;
  }
  const launched = await launchPlan({
    workspaceId: access.ctx.project.id,
    planId: id,
    actorId: session.user.id,
    namePrefix,
  });
  if (!launched.ok) {
    return NextResponse.json(
      { error: launched.error },
      { status: launched.status },
    );
  }
  return NextResponse.json({ runs: launched.runs }, { status: 201 });
}
