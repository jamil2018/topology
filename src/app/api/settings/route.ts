import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
});

const preferencesSchema = z.object({
  themePreference: z.enum(["system", "light", "dark"]).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6).max(128),
});

const patchSchema = z.object({
  profile: profileSchema.optional(),
  preferences: preferencesSchema.optional(),
  password: passwordSchema.optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      hasPassword: Boolean(user.passwordHash),
    },
    preferences: {
      themePreference: user.themePreference,
    },
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updates: Partial<typeof users.$inferInsert> = {};

  if (parsed.data.profile?.name !== undefined) {
    updates.name = parsed.data.profile.name;
  }

  if (parsed.data.preferences?.themePreference !== undefined) {
    updates.themePreference = parsed.data.preferences.themePreference;
  }

  if (parsed.data.password) {
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Password change is only available for credential accounts" },
        { status: 400 },
      );
    }
    const valid = await compare(
      parsed.data.password.currentPassword,
      user.passwordHash,
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }
    updates.passwordHash = await hash(parsed.data.password.newPassword, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    profile: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      hasPassword: Boolean(updated.passwordHash),
    },
    preferences: {
      themePreference: updated.themePreference,
    },
  });
}
