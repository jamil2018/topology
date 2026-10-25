import { NextResponse } from "next/server";
import { previewImport } from "@/lib/import";
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

  const preview = previewImport(
    parsed.body.provider,
    content,
    parsed.body.mapping,
  );
  return NextResponse.json(preview);
}
