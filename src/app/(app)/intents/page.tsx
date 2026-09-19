import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import {
  IntentsWorkspace,
  type IntentListItem,
} from "@/components/intents-workspace";
import { resolveActiveProject } from "@/lib/project";
import { listIntentsWithMeta } from "@/lib/quality-graph";
import { listSavedViews } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Intents · Topology",
};

export default async function IntentsPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const params = await searchParams;
  const [intents, views] = await Promise.all([
    listIntentsWithMeta(ctx.project.id) as Promise<IntentListItem[]>,
    listSavedViews(ctx.project.id, "intents", session.user.id),
  ]);

  return (
    <IntentsWorkspace
      initial={intents}
      selectedId={params.intent ?? null}
      initialViews={views}
    />
  );
}
