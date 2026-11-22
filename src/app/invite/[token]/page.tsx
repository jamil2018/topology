import type { ReactNode } from "react";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { InviteAcceptClient } from "@/components/invite-accept-client";
import { db } from "@/db";
import { workspaceInvites } from "@/db/schema";
import { eq } from "drizzle-orm";

type Props = { params: Promise<{ token: string }> };

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="topology-shell flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <BrandMark size={28} />
        {children}
      </div>
    </div>
  );
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const session = await auth();
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.token, token),
    with: { workspace: true },
  });

  if (!invite || invite.status !== "pending") {
    return (
      <InviteShell>
        <div className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-5 text-sm text-[color:var(--topo-muted)]">
          This invite is missing, revoked, or already accepted.
        </div>
      </InviteShell>
    );
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteShell>
        <div className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-5 text-sm text-[color:var(--topo-muted)]">
          This invite has expired. Ask an admin to send a new one.
        </div>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <InviteAcceptClient
        token={token}
        signedInEmail={session?.user?.email ?? null}
        invite={{
          email: invite.email,
          role: invite.role,
          workspace: { name: invite.workspace.name },
          expiresAt: invite.expiresAt.toISOString(),
        }}
      />
    </InviteShell>
  );
}
