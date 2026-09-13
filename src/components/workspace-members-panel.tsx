"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Bone } from "./skeletons";

type RoleOption = {
  id: string;
  name: string;
  isSystem: boolean;
  systemKey: string | null;
  archivedAt: string | null;
};

type Member = {
  id: string;
  role: "admin" | "member" | "viewer";
  roleId: string | null;
  customRole: { id: string; name: string } | null;
  user: { id: string; name: string | null; email: string };
};

type Invite = {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  roleId: string | null;
  customRole: { id: string; name: string } | null;
  token: string;
  expiresAt: string;
};

export function WorkspaceMembersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [canAdmin, setCanAdmin] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("Topology");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const activeRoles = roles.filter((r) => !r.archivedAt);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [wsRes, rolesRes] = await Promise.all([
        fetch("/api/workspace"),
        fetch("/api/roles"),
      ]);
      const data = await wsRes.json();
      const rolesData = await rolesRes.json();
      if (!wsRes.ok) throw new Error(data.error ?? "Failed to load workspace");
      if (!rolesRes.ok) {
        throw new Error(rolesData.error ?? "Failed to load roles");
      }
      setWorkspaceName(data.workspace.name);
      setMembers(data.members);
      setInvites(data.invites);
      setCanAdmin(Boolean(data.me?.canAdmin));
      const nextRoles = (rolesData.roles as RoleOption[]).filter(
        (r) => !r.archivedAt,
      );
      setRoles(nextRoles);
      setRoleId((prev) => {
        if (prev && nextRoles.some((r) => r.id === prev)) return prev;
        const member = nextRoles.find((r) => r.systemKey === "member");
        return member?.id ?? nextRoles[0]?.id ?? "";
      });
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
        body: JSON.stringify({ email: email.trim(), roleId }),
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

  async function changeRole(userId: string, nextRoleId: string) {
    setError(null);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, roleId: nextRoleId }),
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
          Assign a system or custom role per member. Invites are accepted via
          OAuth or email after signing in as the invited address.
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
        {members.map((m) => {
          const selected =
            m.roleId ??
            activeRoles.find((r) => r.systemKey === m.role)?.id ??
            "";
          return (
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
                  value={selected}
                  onChange={(e) => void changeRole(m.user.id, e.target.value)}
                  className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs"
                >
                  {activeRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                  {m.customRole?.name ?? m.role}
                </span>
              )}
            </li>
          );
        })}
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
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
            >
              {activeRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              isDisabled={sending || !email.trim() || !roleId}
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
                {i.email} · {i.customRole?.name ?? i.role} · expires{" "}
                {new Date(i.expiresAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
