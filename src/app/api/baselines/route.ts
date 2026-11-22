import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";
import { BaselineError, captureRegressionBaseline, launchRegressionBaseline } from "@/lib/tcm/baselines";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture"), planId: z.uuid(), name: z.string().trim().min(1).max(200).optional() }),
  z.object({ action: z.literal("launch"), baselineId: z.uuid(), namePrefix: z.string().trim().min(1).max(200).optional() }),
]);

export async function POST(request: Request) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(actorId, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = inputSchema.safeParse(json.body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid baseline request" }, { status: 400 });
  const workspaceId = access.ctx.project.id;
  try {
    if (parsed.data.action === "capture") {
      const baseline = await captureRegressionBaseline({ ...parsed.data, workspaceId, actorId });
      return NextResponse.json({ baseline }, { status: 201 });
    }
    const runs = await launchRegressionBaseline({ ...parsed.data, workspaceId, actorId });
    return NextResponse.json({ runs }, { status: 201 });
  } catch (error) {
    if (!(error instanceof BaselineError)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
}
