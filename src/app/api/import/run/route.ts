import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { buildImportRows } from "@/lib/import";
import { persistImportedCases } from "@/lib/import/persist";
import { readImportBody, requireImportAccess } from "@/lib/import/request";
import { fetchVendorCases } from "@/lib/import/vendor-api";

export async function POST(request: Request) {
  const access = await requireImportAccess(request);
  if (!access.ok) return access.response;

  const parsed = await readImportBody(request);
  if (!parsed.ok) return parsed.response;

  let content = parsed.body.content;
  if (!content && parsed.body.api) {
    try {
      content = await fetchVendorCases(parsed.body.provider, parsed.body.api);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Vendor API fetch failed" },
        { status: 400 },
      );
    }
  }
  if (!content.trim()) {
    return NextResponse.json(
      { error: "file or API credentials are required" },
      { status: 400 },
    );
  }

  const built = buildImportRows(
    parsed.body.provider,
    content,
    parsed.body.mapping,
  );
  if (built.rows.length === 0) {
    return NextResponse.json(
      {
        error: "No valid rows",
        details: built.errors,
        preview: built.preview,
      },
      { status: 400 },
    );
  }

  const actorId = access.session.user.id;
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await persistImportedCases({
    workspaceId: access.workspaceId,
    actorId,
    rows: built.rows,
    dryRun: parsed.body.dryRun,
  });

  if (!parsed.body.dryRun) {
    await recordAuditEvent({
      action: "import.cases",
      actorId: access.session.user.id,
      actorEmail: access.session.user.email,
      workspaceId: access.workspaceId,
      targetType: "cases",
      request,
      metadata: {
        provider: parsed.body.provider,
        created: result.created.length,
        skipped: result.skipped.length,
      },
    });
  }

  return NextResponse.json({
    dryRun: parsed.body.dryRun,
    provider: parsed.body.provider,
    created: result.created.length,
    skipped: result.skipped,
    wouldCreate: result.wouldCreate,
    wouldSkip: result.wouldSkip,
    errors: built.errors,
    sample: built.preview.sampleMappedRows,
    cases: parsed.body.dryRun ? [] : result.created,
  });
}
