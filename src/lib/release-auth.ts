import { auth } from "@/auth";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";

/**
 * Session (UI, releases.view) or Bearer API token (CLI).
 */
export async function authorizeReleaseRead(request: Request): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (session?.user?.id) {
    const access = await requireProjectAccess(session.user.id, {
      request,
      action: "releases.view",
    });
    if (!access.ok) {
      return { ok: false, status: access.status, error: access.error };
    }
    return { ok: true, workspaceId: access.ctx.project.id };
  }

  const token = await authenticateCiRequest(request);
  if (!token.ok) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, workspaceId: token.workspaceId };
}
