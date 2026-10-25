import { hash } from "bcryptjs";
import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { needsFirstRunSetup } from "@/lib/first-run";
import { isUniqueViolation, readJsonBody } from "@/lib/http-errors";
import { passwordSchema } from "@/lib/password";
import { ensureMembership } from "@/lib/workspace";

const setupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: passwordSchema,
});

export async function GET() {
  return NextResponse.json({ needsSetup: await needsFirstRunSetup() });
}

export async function POST(request: Request) {
  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = setupSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.select({ value: count() }).from(users);
      if (Number(row?.value ?? 0) > 0) {
        return null;
      }
      const passwordHash = await hash(parsed.data.password, 10);
      const [user] = await tx
        .insert(users)
        .values({
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          passwordHash,
          emailVerified: new Date(),
        })
        .returning();
      return user;
    });

    if (!created) {
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 409 },
      );
    }

    await ensureMembership(created.id, "admin", { create: true });
    await recordAuditEvent({
      action: "setup.admin_created",
      actorId: created.id,
      actorEmail: created.email,
      request,
      targetType: "user",
      targetId: created.id,
    });

    return NextResponse.json({
      ok: true,
      user: { id: created.id, email: created.email, name: created.name },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not complete setup" }, { status: 500 });
  }
}
