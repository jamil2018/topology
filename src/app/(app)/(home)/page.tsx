import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import {
  getActiveMilestoneReadiness,
  getHubPulse,
} from "@/lib/queries";
import { HubPulse } from "@/components/hub-pulse";
import { db } from "@/db";
import { releases } from "@/db/schema";
import { parseHubPersona } from "@/lib/hub-persona";
import { readHubViewCookie } from "@/lib/hub-view-pref";
import { getJourneyCoverage } from "@/lib/quality-graph";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: pageTitle("Home"),
  description:
    "Your test runs, failures, and work in progress.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ release?: string; persona?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  const workspaceId = ctx.project.id;
  const params = await searchParams;

  const [pulse, milestone, journeyCoverage, releaseRows] = await Promise.all([
    getHubPulse(workspaceId, { userId: session.user.id }),
    getActiveMilestoneReadiness(workspaceId),
    getJourneyCoverage(workspaceId),
    db.query.releases.findMany({
      where: eq(releases.workspaceId, workspaceId),
      orderBy: [desc(releases.releasedAt), desc(releases.createdAt)],
      columns: { id: true, name: true, gitTag: true, sha: true },
      limit: 20,
    }),
  ]);

  const pulseWithJourney = {
    ...pulse,
    journeyCoverage: journeyCoverage.journey,
  };

  const selectedReleaseId =
    params.release && releaseRows.some((r) => r.id === params.release)
      ? params.release
      : (releaseRows[0]?.id ?? null);

  const hasUrlView = params.view === "overview" || params.view === "home";
  const hasUrlPersona = typeof params.persona === "string";
  const jar = await cookies();
  const cookieView = readHubViewCookie(jar, workspaceId);
  const initialView = hasUrlView
    ? params.view === "overview"
      ? "overview"
      : "home"
    : (cookieView ?? "home");

  return (
    <HubPulse
      pulse={pulseWithJourney}
      milestone={milestone}
      releases={releaseRows}
      selectedReleaseId={selectedReleaseId}
      initialPersona={hasUrlPersona ? parseHubPersona(params.persona) : null}
      initialView={initialView}
      hasUrlView={hasUrlView}
      hasUrlPersona={hasUrlPersona}
    />
  );
}
