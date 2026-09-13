"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@heroui/react";

export function InviteAcceptClient({
  token,
  invite,
  signedInEmail,
}: {
  token: string;
  invite: {
    email: string;
    role: string;
    workspace: { name: string };
    expiresAt: string;
  };
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invites/${token}`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Accept failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
          Workspace invite
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[color:var(--topo-ink)]">
          Join {invite.workspace.name}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--topo-muted)]">
          Invited as <span className="font-mono">{invite.email}</span> with role{" "}
          <span className="font-mono">{invite.role}</span>. Prefer signing in with
          GitHub/Google using that email, or use email/password if OAuth is
          unavailable.
        </p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {!signedInEmail ? (
        <div className="space-y-2">
          <Button
            className="w-full"
            variant="primary"
            onPress={() =>
              signIn(undefined, { callbackUrl: `/invite/${token}` })
            }
          >
            Sign in to accept
          </Button>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
            className="block text-center text-sm text-[color:var(--topo-muted)] underline-offset-2 hover:underline"
          >
            Go to login
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--topo-muted)]">
            Signed in as <span className="font-mono">{signedInEmail}</span>
          </p>
          <Button
            className="w-full"
            variant="primary"
            isDisabled={loading}
            onPress={() => void accept()}
          >
            {loading ? "Joining…" : "Accept invite"}
          </Button>
        </div>
      )}
    </div>
  );
}
