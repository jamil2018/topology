import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExploratorySessionForm } from "@/components/exploratory-session-form";
import { pageTitle } from "@/lib/format-labels";
import { requireProjectAccess } from "@/lib/project";

export const metadata: Metadata = { title: pageTitle("New exploratory session") };

export default async function ExplorePage() {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/login");
  const access = await requireProjectAccess(userId, { action: "runs.create" });
  if (!access.ok) redirect("/runs");
  return <ExploratorySessionForm />;
}
