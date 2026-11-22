import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveAffectedPaths } from "@/lib/affected-resolve";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";
import { getWorkspaceImpact } from "@/lib/quality-graph";

const bodySchema = z
  .object({
    paths: z.array(z.string().min(1)).optional(),
    commitSha: z.string().min(1).optional(),
    pr: z.number().int().positive().optional(),
    repositoryId: z.uuid().optional(),
    /** When omitted, path_component_rules are loaded from the workspace DB. */
    rules: z
      .array(
        z.object({
          pattern: z.string().min(1),
          componentKey: z.string().min(1),
        }),
      )
      .optional(),
  })
  .refine(
    (data) =>
      (data.paths != null && data.paths.length > 0) ||
      Boolean(data.commitSha?.trim()) ||
      data.pr != null,
    { message: "Provide paths, commitSha, or pr" },
  );

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

  const ci = await authenticateCiRequest(request, { requiredScope: "read" });
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

  const { rules, commitSha, pr, paths, repositoryId } = parsed.data;
  const resolved = await resolveAffectedPaths(access.workspaceId, {
    paths,
    commitSha,
    pr,
    repositoryId,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const impactPaths = resolved.paths;
  const {
    impact,
    caseIds,
    rankedCases,
    suspectCoverageLinks,
    pathRulesApplied,
    unknownComponentKeys,
    rulesSource,
  } = await getWorkspaceImpact(access.workspaceId, impactPaths, rules);

  return NextResponse.json({
    paths: impactPaths,
    pathsSource: resolved.pathsSource,
    commitSha: resolved.headSha ?? commitSha ?? null,
    repositoryId: resolved.repositoryId ?? null,
    pullRequestId: resolved.pullRequestId ?? null,
    pr: pr ?? null,
    impact,
    caseIds,
    rankedCases,
    suspectCoverageLinks,
    summary: {
      components: impact.components.length,
      requirements: impact.requirements.length,
      intents: impact.intents.length,
      implementations: impact.implementations.length,
      gaps: impact.gaps.length,
      cases: caseIds.length,
    },
    pathRulesApplied,
    rulesSource,
    unknownComponentKeys,
  });
}
