import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { caseActivities, cases, users } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const existing = await db.query.cases.findFirst({
    where: eq(cases.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const activities = await db
    .select({
      id: caseActivities.id,
      caseId: caseActivities.caseId,
      action: caseActivities.action,
      field: caseActivities.field,
      fromValue: caseActivities.fromValue,
      toValue: caseActivities.toValue,
      summary: caseActivities.summary,
      createdAt: caseActivities.createdAt,
      actorId: caseActivities.actorId,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(caseActivities)
    .leftJoin(users, eq(caseActivities.actorId, users.id))
    .where(eq(caseActivities.caseId, id))
    .orderBy(desc(caseActivities.createdAt))
    .limit(80);

  return NextResponse.json({ activities });
}
