import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { getIntentReliabilityCards } from "@/lib/queries";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await context.params;
  const cards = await getIntentReliabilityCards(access.ctx.project.id, id);
  return NextResponse.json({ reliability: cards });
}
