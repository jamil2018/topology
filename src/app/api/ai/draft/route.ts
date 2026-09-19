import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  draftIntentsFromRequirement,
  explainChangeImpact,
  suggestDuplicateIntents,
  suggestNegativePaths,
  suggestRequirementIntentLinks,
} from "@/lib/ai-draft";
import { getWorkspaceAiProviderConfig, isAiProviderEnabled } from "@/lib/ai-provider";
import { requireProjectAccess } from "@/lib/project";

const bodySchema = z.discriminatedUnion("job", [
  z.object({
    job: z.literal("intents_from_requirement"),
    requirementId: z.string().uuid(),
    allowHeuristic: z.boolean().optional(),
  }),
  z.object({
    job: z.literal("negative_paths"),
    intentId: z.string().uuid().optional(),
    requirementId: z.string().uuid().optional(),
    allowHeuristic: z.boolean().optional(),
  }),
  z.object({
    job: z.literal("link_suggestions"),
    allowHeuristic: z.boolean().optional(),
  }),
  z.object({
    job: z.literal("duplicate_intents"),
    allowHeuristic: z.boolean().optional(),
  }),
  z.object({
    job: z.literal("change_impact"),
    paths: z.array(z.string().min(1)).optional(),
    commitSha: z.string().min(1).optional(),
    pr: z.number().int().positive().optional(),
    allowHeuristic: z.boolean().optional(),
  }),
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const heuristicQuery = searchParams.get("heuristic") === "1";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const allowHeuristic =
    heuristicQuery || parsed.data.allowHeuristic === true;
  const config = await getWorkspaceAiProviderConfig(access.ctx.project.id);

  if (!isAiProviderEnabled(config) && !allowHeuristic) {
    return NextResponse.json(
      {
        error: "In-app AI is disabled. Set TOPOLOGY_AI_PROVIDER or workspace AI settings, or pass ?heuristic=1 for offline demo.",
        code: "ai_disabled",
      },
      { status: 503 },
    );
  }

  const workspaceId = access.ctx.project.id;
  const createdById = session.user.id;

  try {
    if (parsed.data.job === "intents_from_requirement") {
      const result = await draftIntentsFromRequirement({
        workspaceId,
        requirementId: parsed.data.requirementId,
        createdById,
        config,
        allowHeuristic,
      });
      if ("disabled" in result && result.disabled) {
        return NextResponse.json({ code: "ai_disabled" }, { status: 503 });
      }
      return NextResponse.json(result, { status: 201 });
    }

    if (parsed.data.job === "negative_paths") {
      if (!parsed.data.intentId && !parsed.data.requirementId) {
        return NextResponse.json(
          { error: "intentId or requirementId required" },
          { status: 400 },
        );
      }
      const result = await suggestNegativePaths({
        workspaceId,
        intentId: parsed.data.intentId,
        requirementId: parsed.data.requirementId,
        createdById,
        config,
        allowHeuristic,
      });
      if ("disabled" in result && result.disabled) {
        return NextResponse.json({ code: "ai_disabled" }, { status: 503 });
      }
      return NextResponse.json(result, { status: 201 });
    }

    if (parsed.data.job === "duplicate_intents") {
      const result = await suggestDuplicateIntents({
        workspaceId,
        createdById,
        config,
        allowHeuristic,
      });
      if ("disabled" in result && result.disabled) {
        return NextResponse.json({ code: "ai_disabled" }, { status: 503 });
      }
      return NextResponse.json(result, { status: 201 });
    }

    if (parsed.data.job === "change_impact") {
      if (
        !(parsed.data.paths && parsed.data.paths.length > 0) &&
        !parsed.data.commitSha?.trim() &&
        parsed.data.pr == null
      ) {
        return NextResponse.json(
          { error: "Provide paths, commitSha, or pr" },
          { status: 400 },
        );
      }
      const result = await explainChangeImpact({
        workspaceId,
        paths: parsed.data.paths,
        commitSha: parsed.data.commitSha,
        pr: parsed.data.pr,
        createdById,
        config,
        allowHeuristic,
      });
      if ("disabled" in result && result.disabled) {
        return NextResponse.json({ code: "ai_disabled" }, { status: 503 });
      }
      return NextResponse.json(result, { status: 201 });
    }

    const result = await suggestRequirementIntentLinks({
      workspaceId,
      createdById,
      config,
      allowHeuristic,
    });
    if ("disabled" in result && result.disabled) {
      return NextResponse.json({ code: "ai_disabled" }, { status: 503 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
