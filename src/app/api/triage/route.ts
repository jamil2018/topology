import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { triageItems } from "@/db/schema";
import { getTriageQueue } from "@/lib/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const queue = await getTriageQueue();
  return NextResponse.json({ queue });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "snoozed", "resolved"]),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(triageItems)
    .set({
      status: parsed.data.status,
      updatedAt: new Date(),
    })
    .where(eq(triageItems.id, parsed.data.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}
