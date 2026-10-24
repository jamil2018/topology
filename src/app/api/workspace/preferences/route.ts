import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { dbErrorResponse, readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";

const prefsSchema = z.object({
  qualityGraphEnabled: z.boolean(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = prefsSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let updated;
  try {
    [updated] = await db
      .update(workspaces)
      .set({
        qualityGraphEnabled: parsed.data.qualityGraphEnabled,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, access.ctx.project.id))
      .returning();
  } catch (err) {
    return dbErrorResponse(err, "Could not save preference");
  }

  if (!updated) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json({
    workspace: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      qualityGraphEnabled: updated.qualityGraphEnabled,
    },
  });
}
