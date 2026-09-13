"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Bone } from "./skeletons";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  archivedAt: string | null;
  role: "admin" | "member" | "viewer";
};

export function ProjectsPanel() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects?includeArchived=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load projects");
      setProjects(data.projects ?? []);
      setCanManage(Boolean(data.canManage));
      setActiveProjectId(data.activeProjectId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial hydrate from /api/projects (same pattern as members panel).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Create failed",
        );
      }
      setName("");
      setMsg(`Created ${data.project.name}`);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function rename(project: ProjectRow) {
    const next = window.prompt("Project name", project.name);
    if (!next || next.trim() === project.name) return;
    setBusyId(project.id);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, name: next.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Rename failed",
        );
      }
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(project: ProjectRow, archived: boolean) {
    setBusyId(project.id);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, archived }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Update failed",
        );
      }
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(project: ProjectRow) {
    if (project.slug === "default") {
      setError("Cannot delete the default project");
      return;
    }
    if (
      !window.confirm(
        `Delete project “${project.name}”? All project data will be removed.`,
      )
    ) {
      return;
    }
    setBusyId(project.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects?id=${project.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Delete failed",
        );
      }
      setMsg(`Deleted ${project.name}`);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Bone className="h-5 w-40" />
        <Bone className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Projects
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Each project isolates cases, runs, automation, milestones, reports,
          and triage. Switch from the sidebar; admins manage access here.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="text-sm text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}

      {canManage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            <span className="text-[color:var(--topo-muted)]">New project</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme QA"
              className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            variant="primary"
            isDisabled={creating || !name.trim()}
            onPress={() => void create()}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          You need admin access on a project to create or archive projects.
        </p>
      )}

      <ul className="divide-y divide-[color:var(--topo-line)] rounded-lg border border-[color:var(--topo-line)]">
        {projects.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-[color:var(--topo-muted)]">
            No projects yet.
          </li>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isAdmin = project.role === "admin";
            const archived = Boolean(project.archivedAt);
            return (
              <li
                key={project.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[color:var(--topo-ink)]">
                    {project.name}
                    {isActive ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)]">
                        active
                      </span>
                    ) : null}
                    {archived ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                        archived
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-[color:var(--topo-muted)]">
                    {project.slug} · {project.role}
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busyId === project.id}
                      onPress={() => void rename(project)}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busyId === project.id}
                      onPress={() => void setArchived(project, !archived)}
                    >
                      {archived ? "Restore" : "Archive"}
                    </Button>
                    {project.slug !== "default" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busyId === project.id}
                        onPress={() => void remove(project)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
