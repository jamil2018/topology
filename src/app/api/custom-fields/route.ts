import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { customFieldDefs } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { validateFieldDef } from "@/lib/tcm/custom-fields";

const createSchema = z.object({
  entity: z.enum(["case", "result"]),
  key: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean", "select", "date"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const rows = await db.query.customFieldDefs.findMany({
    where: and(
      eq(customFieldDefs.workspaceId, access.ctx.project.id),
      entity === "case" || entity === "result"
        ? eq(customFieldDefs.entity, entity)
        : undefined,
    ),
    orderBy: [asc(customFieldDefs.position), asc(customFieldDefs.label)],
  });
  return NextResponse.json({
    fields: rows.map((d) => ({
      ...d,
      options: d.optionsJson ? JSON.parse(d.optionsJson) : [],
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "project.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }
  const checked = validateFieldDef(parsed.data);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.errors[0] }, { status: 400 });
  }
  const [field] = await db
    .insert(customFieldDefs)
    .values({
      workspaceId: access.ctx.project.id,
      entity: parsed.data.entity,
      key: checked.def.key,
      label: checked.def.label,
      type: checked.def.type,
      optionsJson:
        checked.def.type === "select"
          ? JSON.stringify(checked.def.options ?? [])
          : null,
      required: parsed.data.required,
    })
    .returning();
  return NextResponse.json({ field }, { status: 201 });
}
