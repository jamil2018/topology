"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import {
  PROJECT_COOKIE,
  getMembershipForProject,
} from "@/lib/project";

const projectIdSchema = z.string().uuid();

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type SelectProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

/**
 * Persist the active project for the signed-in user.
 * Membership is re-checked on the server; a foreign or archived id is rejected.
 * Setting the cookie re-renders the current route (including the shared layout)
 * so project-scoped pages pick up the new cookie in the same roundtrip.
 */
export async function selectActiveProject(
  id: string,
): Promise<SelectProjectResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = projectIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, error: "Invalid project" };
  }

  const membership = await getMembershipForProject(
    session.user.id,
    parsed.data,
  );
  if (!membership?.workspace) {
    return { ok: false, error: "No accessible project" };
  }
  if (membership.workspace.archivedAt) {
    return { ok: false, error: "Project is archived" };
  }

  const jar = await cookies();
  jar.set(PROJECT_COOKIE, membership.workspace.id, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
  });
  // Cookie writes re-render the page; refresh also refetches the long-lived
  // layout so the sidebar active project and page data stay in sync.
  refresh();

  return { ok: true, projectId: membership.workspace.id };
}
