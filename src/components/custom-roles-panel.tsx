"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { Bone } from "./skeletons";
import type { Action, ActionGroup } from "@/lib/permissions";

type RoleRow = {
  id: string;
  name: string;
  description: string;
  actions: Action[];
  isSystem: boolean;
  systemKey: string | null;
  archivedAt: string | null;
  memberCount: number;
};

type Catalog = {
  actions: Action[];
  groups: ActionGroup[];
  labels: Record<string, string>;
};

const emptyForm = {
  name: "",
  description: "",
  actions: [] as Action[],
};

export function CustomRolesPanel() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const customRoles = useMemo(
    () => roles.filter((r) => !r.isSystem && !r.archivedAt),
    [roles],
  );
  const systemRoles = useMemo(
    () => roles.filter((r) => r.isSystem && !r.archivedAt),
    [roles],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load roles");
      setRoles(data.roles);
      setCatalog(data.catalog);
      setCanManage(Boolean(data.me?.canManageRoles));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setForm({
      ...emptyForm,
      actions: ["cases.view", "runs.view", "reports.view", "settings.view"],
    });
    setMsg(null);
  }

  function startEdit(role: RoleRow) {
    setCreating(false);
    setEditingId(role.id);
    setForm({
      name: role.name,
      description: role.description,
      actions: [...role.actions],
    });
    setMsg(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function toggleAction(action: Action) {
    setForm((prev) => {
      const has = prev.actions.includes(action);
      return {
        ...prev,
        actions: has
          ? prev.actions.filter((a) => a !== action)
          : [...prev.actions, action],
      };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/roles", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          creating
            ? form
            : {
                id: editingId,
                name: form.name,
                description: form.description,
                actions: form.actions,
              },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Save failed",
        );
      }
      setMsg(creating ? "Role created" : "Role updated");
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRole(id: string) {
    setError(null);
    const res = await fetch(`/api/roles?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Archive failed");
      return;
    }
    setMsg("Role archived");
    if (editingId === id) cancelForm();
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading roles">
        <Bone className="h-4 w-48" />
        <Bone className="h-20 w-full" />
      </div>
    );
  }

  const showForm = creating || editingId != null;
  const editingRole = editingId
    ? roles.find((r) => r.id === editingId)
    : null;
  const formLockedName = Boolean(editingRole?.isSystem);

  return (
    <div id="custom-roles" className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Custom roles
          </h3>
          <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
            Named action sets beyond Admin, Member, and Viewer. Assign them on
            the Members list above.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" variant="secondary" onPress={startCreate}>
            New role
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {msg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}

      {systemRoles.length > 0 ? (
        <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
          {systemRoles.map((role) => (
            <li
              key={role.id}
              className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[color:var(--topo-ink)]">
                  {role.name}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
                    system
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  {role.description || `${role.actions.length} actions`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[color:var(--topo-muted)]">
                  {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                </span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() => startEdit(role)}
                  >
                    Edit actions
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {customRoles.length === 0 && !showForm ? (
        <div className="rounded-md border border-dashed border-[color:var(--topo-line)] bg-[color:var(--topo-surface)]/60 px-3 py-3">
          <p className="text-xs text-[color:var(--topo-muted)]">
            {canManage
              ? "No custom roles yet. Create one to grant a tailored action set."
              : "No custom roles in this project."}
          </p>
        </div>
      ) : null}

      {customRoles.length > 0 ? (
        <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
          {customRoles.map((role) => (
            <li
              key={role.id}
              className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[color:var(--topo-ink)]">
                  {role.name}
                </div>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  {role.description || `${role.actions.length} actions`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-[color:var(--topo-muted)]">
                  {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                </span>
                {canManage ? (
                  <>
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() => startEdit(role)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onPress={() => void archiveRole(role.id)}
                    >
                      Archive
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showForm && catalog ? (
        <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              {creating ? "New custom role" : `Edit ${form.name || "role"}`}
            </h4>
            <Button size="sm" variant="tertiary" onPress={cancelForm}>
              Cancel
            </Button>
          </div>

          {!formLockedName ? (
            <label className="block space-y-1 text-sm">
              <span className="text-[color:var(--topo-muted)]">Name</span>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                placeholder="Release captain"
              />
            </label>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span className="text-[color:var(--topo-muted)]">Description</span>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
              placeholder="What this role is for"
            />
          </label>

          <div className="space-y-3">
            {catalog.groups.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--topo-muted)]">
                  {group.label}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.actions.map((action) => {
                    const checked = form.actions.includes(action);
                    return (
                      <label
                        key={action}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-[color:var(--topo-line)] px-2 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleAction(action)}
                        />
                        <span>
                          <span className="block text-[color:var(--topo-ink)]">
                            {catalog.labels[action] ?? action}
                          </span>
                          <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                            {action}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              isDisabled={saving || (!formLockedName && !form.name.trim())}
              onPress={() => void save()}
            >
              {saving ? "Saving…" : creating ? "Create role" : "Save changes"}
            </Button>
            <span className="font-mono text-[11px] text-[color:var(--topo-muted)]">
              {form.actions.length} action{form.actions.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
