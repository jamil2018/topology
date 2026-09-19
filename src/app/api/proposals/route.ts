import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isProposalActorType,
  validateProposalPayload,
} from "@topology/domain";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import {
  createProposal,
  getAiProvider,
  isAiProviderEnabled,
  listProposals,
  ProposalApplyError,
  reviewProposal,
  toProposalListItem,
} from "@/lib/proposals";

const createSchema = z.object({
  payload: z.unknown(),
  entityType: z.string().min(1).max(64).optional(),
  actorType: z.enum(["user", "agent", "model"]).optional(),
  model: z.string().max(120).nullable().optional(),
  inputRefs: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "proposals.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  if (
    status &&
    status !== "pending" &&
    status !== "accepted" &&
    status !== "rejected"
  ) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const proposals = await listProposals(access.ctx.project.id, { status });
  return NextResponse.json({
    proposals,
    aiProvider: getAiProvider(),
    aiEnabled: isAiProviderEnabled(),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "proposals.create",
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

  const validated = validateProposalPayload(parsed.data.payload);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Invalid proposal payload", issues: validated.issues },
      { status: 400 },
    );
  }

  const actorType = parsed.data.actorType ?? "user";
  if (!isProposalActorType(actorType)) {
    return NextResponse.json({ error: "Invalid actorType" }, { status: 400 });
  }

  const row = await createProposal({
    workspaceId: access.ctx.project.id,
    payload: validated.payload,
    entityType: parsed.data.entityType,
    actorType,
    model: parsed.data.model ?? null,
    inputRefs: parsed.data.inputRefs,
    createdById: session.user.id,
  });

  return NextResponse.json(
    { proposal: toProposalListItem(row) },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "proposals.review",
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await reviewProposal({
      workspaceId: access.ctx.project.id,
      proposalId: parsed.data.id,
      decision: parsed.data.status,
      approvedById: session.user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProposalApplyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
