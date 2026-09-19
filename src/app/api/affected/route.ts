import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";
import { getWorkspaceImpact } from "@/lib/quality-graph";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  /** When omitted, path_component_rules are loaded from the workspace DB. */
  rules: z
    .array(
      z.object({
        pattern: z.string().min(1),
        componentKey: z.string().min(1),
      }),
    )
    .optional(),
});

async function resolveWorkspaceId(
  request: Request,
): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (session?.user?.id) {
    const access = await requireProjectAccess(session.user.id, {
      request,
      action: "intents.view",
    });
    if (!access.ok) {
      return { ok: false, status: access.status, error: access.error };
    }
    return { ok: true, workspaceId: access.ctx.project.id };
  }

  const ci = await authenticateCiRequest(request);
  if (!ci.ok) {
    return { ok: false, status: ci.status, error: ci.error };
  }
  return { ok: true, workspaceId: ci.workspaceId };
}

export async function POST(request: Request) {
  const access = await resolveWorkspaceId(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { paths, rules } = parsed.data;
  const { impact, pathRulesApplied, unknownComponentKeys, rulesSource } =
    await getWorkspaceImpact(access.workspaceId, paths, rules);

  return NextResponse.json({
    paths,
    impact,
    summary: {
      components: impact.components.length,
      requirements: impact.requirements.length,
      intents: impact.intents.length,
      implementations: impact.implementations.length,
      gaps: impact.gaps.length,
    },
    pathRulesApplied,
    rulesSource,
    unknownComponentKeys,
  });
}
