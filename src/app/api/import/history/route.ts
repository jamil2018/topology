import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { maxHistoryBundleBytes, parseHistoryBundle } from "@/lib/import/history-format";
import { applyHistoricalRun, previewHistoricalRun } from "@/lib/import/history";
import { ctxHasAction, requireProjectAccess } from "@/lib/project";

class HistoryBundleTooLarge extends Error {}

async function readBundle(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > maxHistoryBundleBytes) throw new HistoryBundleTooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Provide a JSON history bundle");
  let size = 0;
  let raw = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxHistoryBundleBytes) {
        await reader.cancel();
        throw new HistoryBundleTooLarge();
      }
      raw += decoder.decode(value, { stream: true });
    }
    return parseHistoryBundle(JSON.parse(raw + decoder.decode()));
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const actorId = (await auth())?.user?.id;
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(actorId, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!ctxHasAction(access.ctx, "cases.view")) return NextResponse.json({ error: "Missing permission: cases.view" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "preview";
  if (mode !== "preview" && mode !== "apply") return NextResponse.json({ error: "Choose preview or apply" }, { status: 400 });
  if (mode === "apply" && !ctxHasAction(access.ctx, "runs.edit")) {
    return NextResponse.json({ error: "Missing permission: runs.edit" }, { status: 403 });
  }
  let bundle: Awaited<ReturnType<typeof readBundle>>;
  try {
    bundle = await readBundle(request);
  } catch (error) {
    if (error instanceof HistoryBundleTooLarge) return NextResponse.json({ error: "History bundle exceeds 8 MiB" }, { status: 413 });
    const message = error instanceof z.ZodError
      ? error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "bundle"} ${issue.message}`).join(". ")
      : "Provide a valid UTF-8 JSON history bundle";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (mode === "apply" && params.get("digest") !== bundle.digest) {
    return NextResponse.json({ error: "Preview this bundle before applying it", code: "HISTORY_PREVIEW_REQUIRED" }, { status: 409 });
  }

  const { provider, namespace } = bundle;
  const scope = { workspaceId: access.ctx.project.id, actorId, provider, namespace };
  const valid = [];
  const invalid = [];
  const operation = mode === "apply" ? applyHistoricalRun : previewHistoricalRun;
  for (const entry of bundle.entries) {
    if ("run" in entry && entry.run) valid.push(await operation(scope, entry.run, entry.digest));
    else invalid.push(entry);
  }
  return NextResponse.json({ digest: bundle.digest, provider, namespace, runs: valid, invalid });
}
