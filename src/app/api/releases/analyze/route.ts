import { NextResponse } from "next/server";
import { authorizeReleaseRead } from "@/lib/release-auth";
import { analyzeReleaseQuality } from "@/lib/release-quality";

/** Empty body → workspace mode; otherwise parse JSON. */
async function readAnalyzeBody(
  request: Request,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }
> {
  const text = await request.text();
  if (!text.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}

export async function POST(request: Request) {
  const access = await authorizeReleaseRead(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const json = await readAnalyzeBody(request);
  if (!json.ok) return json.response;

  const result = await analyzeReleaseQuality(access.workspaceId, json.body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    mode: result.mode,
    quality: result.quality,
    ...(result.mode === "workspace" ? { runId: result.runId ?? null } : {}),
  });
}
