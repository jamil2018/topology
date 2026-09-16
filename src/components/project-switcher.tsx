"use client";

import { useState, useTransition } from "react";
import { CaretDownIcon, FolderSimpleIcon } from "@phosphor-icons/react";
import { selectActiveProject } from "@/lib/project-actions";

export type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export function ProjectSwitcher({
  projects,
  activeProjectId,
  collapsed = false,
}: {
  projects: ProjectOption[];
  activeProjectId: string | null;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  function select(id: string) {
    if (id === active?.id) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await selectActiveProject(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  if (projects.length === 0) {
    return collapsed ? null : (
      <div className="mx-2 mb-2 rounded-lg border border-dashed border-[color:var(--topo-line)] px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
        No projects
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 pb-2">
        <button
          type="button"
          title={active?.name ?? "Project"}
          aria-label={`Project: ${active?.name ?? "none"}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--topo-chip)] text-[color:var(--topo-accent)]"
          onClick={() => setOpen((v) => !v)}
        >
          <FolderSimpleIcon size={16} weight="fill" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-2 mb-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[color:var(--topo-chip)]"
      >
        <FolderSimpleIcon
          size={16}
          weight="fill"
          className="shrink-0 text-[color:var(--topo-accent)]"
        />
        <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--topo-ink)]">
          {active?.name ?? "Select project"}
        </span>
        <CaretDownIcon
          size={12}
          weight="bold"
          className="shrink-0 text-[color:var(--topo-muted)]"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] py-1 shadow-lg"
        >
          {projects.map((project) => {
            const selected = project.id === active?.id;
            return (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex w-full flex-col px-2.5 py-1.5 text-left text-sm ${
                  selected
                    ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
                }`}
                onClick={() => select(project.id)}
              >
                <span className="truncate font-medium">{project.name}</span>
                <span className="truncate font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {project.slug} · {project.role}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-1 px-1 text-[11px] text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
