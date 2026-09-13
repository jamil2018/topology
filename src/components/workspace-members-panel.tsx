"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Bone } from "./skeletons";

type Member = {
  id: string;
  role: "admin" | "member" | "viewer";
  user: { id: string; name: string | null; email: string };
};

type Invite = {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  token: string;
  expiresAt: string;
};

export function WorkspaceMembersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [canAdmin, setCanAdmin] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("Topology");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load workspace");
      setWorkspaceName(data.workspace.name);
      setMembers(data.members);
      setInvites(data.invites);
      setCanAdmin(Boolean(data.me?.canAdmin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite() {
    setSending(true);
    setMsg(null);
    setError(null);
    setLastAcceptUrl(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Invite failed",
        );
      }
      setEmail("");
      setLastAcceptUrl(data.invite.acceptUrl);
      setMsg(`Invite created for ${data.invite.email}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSending(false);
    }
  }

  async function changeRole(userId: string, next: Member["role"]) {
    setError(null);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading members">
        <div className="space-y-1.5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3 w-72 max-w-full" />
        </div>
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="space-y-1.5">
                <Bone className="h-4 w-36" />
                <Bone className="h-3 w-44" />
              </div>
              <Bone className="h-8 w-24" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          {workspaceName} members
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Roles: admin (invite + manage), member (write), viewer (read). Invites
          are accepted via OAuth or email after signing in as the invited address.
        </p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {msg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}
      {lastAcceptUrl ? (
        <p className="break-all rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1.5 font-mono text-[11px] text-[color:var(--topo-ink)]">
          {lastAcceptUrl}
        </p>
      ) : null}

      <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium text-[color:var(--topo-ink)]">
                {m.user.name ?? m.user.email}
              </div>
              <div className="font-mono text-[11px] text-[color:var(--topo-muted)]">
                {m.user.email}
              </div>
            </div>
            {canAdmin ? (
              <select
                value={m.role}
                onChange={(e) =>
                  void changeRole(m.user.id, e.target.value as Member["role"])
                }
                className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            ) : (
              <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                {m.role}
              </span>
            )}
          </li>
        ))}
      </ul>

      {canAdmin ? (
        <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] p-3">
          <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Invite by email
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-[14rem] flex-1 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
            />
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "member" | "viewer")
              }
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
            >
              <option value="member">member</option>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <Button
              size="sm"
              variant="primary"
              isDisabled={sending || !email.trim()}
              onPress={() => void invite()}
            >
              {sending ? "Creating…" : "Create invite"}
            </Button>
          </div>
        </div>
      ) : null}

      {invites.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Pending invites
          </h3>
          <ul className="space-y-1 text-xs text-[color:var(--topo-muted)]">
            {invites.map((i) => (
              <li key={i.id} className="font-mono">
                {i.email} · {i.role} · expires{" "}
                {new Date(i.expiresAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
