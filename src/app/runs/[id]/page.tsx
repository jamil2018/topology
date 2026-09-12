import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { RunExecutor } from "@/components/run-executor";
import { getRunWithResults } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export default async function RunDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const run = await getRunWithResults(id);
  if (!run) notFound();

  return (
    <HubShell userEmail={session.user.email}>
      <RunExecutor
        run={{
          id: run.id,
          name: run.name,
          status: run.status,
          description: run.description,
          results: run.results.map((r) => ({
            id: r.id,
            status: r.status,
            notes: r.notes,
            linkedIssues: (r.linkedIssues ?? []).map((i) => ({
              id: i.id,
              provider: i.provider,
              remoteKey: i.remoteKey,
              url: i.url,
              title: i.title,
              remoteStatus: i.remoteStatus,
              needsRetest: i.needsRetest,
            })),
            case: {
              id: r.case?.id ?? r.caseId ?? r.id,
              key: r.case?.key ?? r.externalKey ?? "AUTO",
              title: r.case?.title ?? r.title ?? "Untitled",
              steps: r.case?.steps ?? "",
              expectedResult: r.case?.expectedResult ?? "",
            },
          })),
        }}
      />
    </HubShell>
  );
}
