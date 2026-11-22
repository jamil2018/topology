"use client";
import { Button, Input } from "@heroui/react";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CaretDownIcon, FolderSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { selectActiveProject } from "@/lib/project-actions";
import { useProjectActions } from "./project-actions";

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
  canManage,
}: {
  projects: ProjectOption[];
  activeProjectId: string | null;
  collapsed?: boolean;
  canManage?: boolean;
}) {
  const { canAdmin } = useProjectActions();
  const showNewProject = canManage ?? canAdmin;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [projects, query]);

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [open]);

  function select(id: string) {
    if (id === active?.id) {
      closeMenu(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await selectActiveProject(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeMenu(true);
    });
  }

  if (projects.length === 0) {
    if (collapsed) {
      return showNewProject ? (
        <div className="relative flex justify-center px-2 pb-2">
          <Link
            href="/settings?section=projects"
            title="New project"
            aria-label="New project"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-[color:var(--topo-line)] text-[color:var(--topo-accent)] hover:bg-[color:var(--topo-chip)]"
          >
            <PlusIcon size={16} weight="bold" />
          </Link>
        </div>
      ) : (
        <div
          className="relative flex justify-center px-2 pb-2"
          title="No projects"
        >
          <span
            aria-label="No projects"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-[color:var(--topo-line)] text-[color:var(--topo-muted)]"
          >
            <FolderSimpleIcon size={16} weight="regular" />
          </span>
        </div>
      );
    }
    return (
      <div className="mx-2 mb-2 space-y-2">
        <div className="rounded-lg border border-dashed border-[color:var(--topo-line)] px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
          No projects
        </div>
        {showNewProject ? (
          <Link
            href="/settings?section=projects"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--topo-accent)] hover:bg-[color:var(--topo-chip)]"
          >
            <PlusIcon size={12} weight="bold" />
            New project
          </Link>
        ) : null}
      </div>
    );
  }

  const listbox = open ? (
    <div
      role="listbox"
      className={`absolute z-50 mt-1 max-h-72 overflow-hidden rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-lg ${
        collapsed ? "left-0 w-56" : "left-0 right-0"
      }`}
    >
      <div className="border-b border-[color:var(--topo-line)] p-1.5">
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          className="w-full text-xs"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") return;
            e.stopPropagation();
          }}
        />
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
            No matching projects
          </p>
        ) : (
          filtered.map((project) => {
            const selected = project.id === active?.id;
            return (
              <div
                key={project.id}
                role="option"
                aria-selected={selected}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className={`flex w-full flex-col px-2.5 py-1.5 text-left text-sm ${
                    selected
                      ? "topo-selected-surface"
                      : "text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
                  }`}
                  onPress={() => select(project.id)}
                >
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="truncate font-medium text-xs opacity-70">
                    {project.slug} · {project.role}
                  </span>
                </Button>
              </div>
            );
          })
        )}
      </div>
      {showNewProject ? (
        <div className="border-t border-[color:var(--topo-line)] p-1">
          <Link
            href="/settings?section=projects"
            role="option"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[color:var(--topo-accent)] hover:bg-[color:var(--topo-chip)]"
            onClick={() => closeMenu()}
          >
            <PlusIcon size={12} weight="bold" />
            New project
          </Link>
        </div>
      ) : null}
    </div>
  ) : null;

  if (collapsed) {
    return (
      <div ref={rootRef} className="relative flex justify-center px-2 pb-2">
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          aria-label={`Project: ${active?.name ?? "none"}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          isDisabled={pending}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--topo-chip)] text-[color:var(--topo-accent)]"
          onPress={() => setOpen((v) => !v)}
        >
          <FolderSimpleIcon size={16} weight="fill" />
        </Button>
        {listbox}
        {error ? (
          <p className="absolute left-0 top-full mt-1 w-56 px-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative mx-2 mb-2">
      <Button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        isDisabled={pending}
        onPress={() => setOpen((v) => !v)}
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
      </Button>

      {listbox}

      {error ? (
        <p className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
