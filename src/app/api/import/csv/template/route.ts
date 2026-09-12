import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildCasesCsvTemplate } from "@/lib/csv";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csv = buildCasesCsvTemplate();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="topology-cases-template.csv"',
    },
  });
}
