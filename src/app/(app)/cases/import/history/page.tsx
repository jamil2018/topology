import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HistoryImportPanel } from "@/components/history-import-panel";
import { ctxHasAction, requireProjectAccess } from "@/lib/project";

export const metadata: Metadata = { title: "Import run history · Topology" };

export default async function HistoryImportPage() {
  const actorId = (await auth())?.user?.id;
  if (!actorId) redirect("/login");
  const access = await requireProjectAccess(actorId, { action: "runs.create" });
  if (!access.ok || !ctxHasAction(access.ctx, "cases.view")) redirect("/cases/import");
  return <HistoryImportPanel projectId={access.ctx.project.id} canApply={ctxHasAction(access.ctx, "runs.edit")} />;
}
