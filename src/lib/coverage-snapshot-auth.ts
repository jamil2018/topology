import { auth } from "@/auth";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";

export async function authorizeCoverageSnapshotAccess(
  request: Request,
): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const ci = await authenticateCiRequest(request);
    if (ci.ok) {
      return { ok: true, workspaceId: ci.workspaceId };
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const view = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.view",
  });
  if (view.ok) {
    return { ok: true, workspaceId: view.ctx.project.id };
  }

  const automation = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.manage",
  });
  if (automation.ok) {
    return { ok: true, workspaceId: automation.ctx.project.id };
  }

  return { ok: false, status: 403, error: view.error };
}

export async function authorizeNotificationsAccess(
  request: Request,
  userId: string,
) {
  const access = await requireProjectAccess(userId, { request });
  if (!access.ok) {
    return access;
  }
  return access;
}
