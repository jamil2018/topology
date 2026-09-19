import { NextResponse } from "next/server";
import {
  parseQualityQuery,
  validateQualityQuery,
  type QualityQuery,
} from "@topology/domain";
import { auth } from "@/auth";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";
import {
  executeQualityQuery,
  knownFieldsFor,
} from "@/lib/query-compile";

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

type QueryBody = {
  dsl?: string;
  query?: unknown;
  limit?: number;
};

function resolveQuery(
  body: QueryBody,
):
  | { ok: true; query: QualityQuery; dsl?: string }
  | { ok: false; error: string; issues?: unknown } {
  if (typeof body.dsl === "string" && body.dsl.trim()) {
    const parsed = parseQualityQuery(body.dsl);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, issues: parsed.issues };
    }
    return { ok: true, query: parsed.query, dsl: body.dsl.trim() };
  }

  if (body.query !== undefined) {
    const validated = validateQualityQuery(body.query);
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.issues.map((i) => i.message).join("; "),
        issues: validated.issues,
      };
    }
    return { ok: true, query: validated.query };
  }

  return {
    ok: false,
    error: "Provide dsl (string) or query (QualityQuery AST)",
  };
}

/**
 * POST /api/query
 * Body: { dsl?: string, query?: QualityQuery, limit?: number }
 *
 * Auth: session (intents.view) or Bearer API token.
 */
export async function POST(request: Request) {
  const access = await resolveWorkspaceId(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  let body: QueryBody;
  try {
    body = (await request.json()) as QueryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resolved = resolveQuery(body);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, issues: resolved.issues },
      { status: 400 },
    );
  }

  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? body.limit
      : undefined;

  const executed = await executeQualityQuery(
    access.workspaceId,
    resolved.query,
    { limit },
  );
  if (!executed.ok) {
    return NextResponse.json(
      {
        error: executed.error,
        issues: executed.issues,
        knownFields: knownFieldsFor(resolved.query.entity),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    entity: executed.result.entity,
    query: resolved.query,
    dsl: resolved.dsl,
    plan: executed.result.plan,
    rows: executed.result.rows,
    count: executed.result.rows.length,
  });
}
