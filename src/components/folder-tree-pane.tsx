"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Button, Modal } from "@heroui/react";
import { useProjectActions } from "./project-actions";
import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FoldersIcon,
  PlusIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  buildFolderTree,
  folderAncestors,
  folderPathLabel,
  type FolderNode,
  type FolderTreeNode,
} from "@/lib/folder-tree";
import { CASE_DRAG_MIME } from "./cases-model";

export type FolderTreeSelection = "all" | "unfiled" | string;

type Props = {
  folders: FolderNode[];
  folderCounts: Map<string, number>;
  unfiledCount: number;
  totalCount: number;
  selected: FolderTreeSelection;
  onSelect: (id: FolderTreeSelection) => void;
  onCreateRoot: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onDropCases?: (folderId: string | null, caseIds: string[]) => void;
  collapsed: boolean;
  inline?: boolean;
  onToggleCollapsed: () => void;
};

function parseCaseDragIds(event: DragEvent): string[] {
  const raw =
    event.dataTransfer.getData(CASE_DRAG_MIME) ||
    event.dataTransfer.getData("text/plain");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // fall through to comma-separated ids
  }
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function acceptCaseDrag(event: DragEvent) {
  const types = Array.from(event.dataTransfer.types);
  return types.includes(CASE_DRAG_MIME) || types.includes("text/plain");
}

function TreeRows({
  nodes,
  depth,
  expanded,
  toggleExpanded,
  selected,
  onSelect,
  folderCounts,
  onCreateSubfolder,
  onRename,
  onDelete,
  onDropCases,
  dropTarget,
  setDropTarget,
}: {
  nodes: FolderTreeNode[];
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  selected: FolderTreeSelection;
  onSelect: (id: FolderTreeSelection) => void;
  folderCounts: Map<string, number>;
  onCreateSubfolder: (parentId: string) => void;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onDropCases?: (folderId: string | null, caseIds: string[]) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
}) {
  const { can } = useProjectActions();
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        const isSelected = selected === node.id;
        const count = folderCounts.get(node.id) ?? 0;
        const isDrop = dropTarget === node.id;
        return (
          <div key={node.id}>
            <div
              className={`group flex items-center gap-0.5 rounded-md pr-1 ${
                isDrop
                  ? "bg-[color:var(--topo-accent-soft)] ring-1 ring-[color:var(--topo-accent)]"
                  : isSelected
                    ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
              }`}
              style={{ paddingLeft: 4 + depth * 12 }}
              onDragOver={(event) => {
                if (!onDropCases || !can("cases.edit") || !acceptCaseDrag(event)) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropTarget !== node.id) setDropTarget(node.id);
              }}
              onDragLeave={() => {
                if (dropTarget === node.id) setDropTarget(null);
              }}
              onDrop={(event) => {
                if (!onDropCases || !can("cases.edit")) return;
                event.preventDefault();
                setDropTarget(null);
                const ids = parseCaseDragIds(event);
                if (ids.length > 0) onDropCases(node.id, ids);
              }}
            >
              {hasChildren ? (
              <button
                type="button"
                aria-label={
                  hasChildren
                    ? isOpen
                      ? `Collapse ${node.name}`
                      : `Expand ${node.name}`
                    : undefined
                }
                aria-expanded={hasChildren ? isOpen : undefined}
                disabled={!hasChildren}
                onClick={() => hasChildren && toggleExpanded(node.id)}
                className={`flex h-6 w-5 shrink-0 items-center justify-center rounded ${
                  hasChildren
                    ? "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    : "text-transparent"
                }`}
              >
                {hasChildren ? (
                  isOpen ? (
                    <CaretDownIcon size={12} weight="bold" />
                  ) : (
                    <CaretRightIcon size={12} weight="bold" />
                  )
                ) : (
                  <span className="h-2 w-2" />
                )}
              </button>
              ) : <span aria-hidden="true" className="h-6 w-5 shrink-0" />}
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm"
              >
                {isOpen || isSelected ? (
                  <FolderOpenIcon
                    size={14}
                    weight="duotone"
                    className="shrink-0 text-[color:var(--topo-accent)]"
                  />
                ) : (
                  <FolderIcon
                    size={14}
                    weight="duotone"
                    className="shrink-0 text-[color:var(--topo-muted)]"
                  />
                )}
                <span className="truncate font-medium">{node.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-[color:var(--topo-muted)]">
                  {count}
                </span>
              </button>
              <div className="flex shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button
                  type="button"
                  aria-label={`New subfolder in ${node.name}`}
                  disabled={!can("folders.manage")}
                  className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-[color:var(--topo-ink)]"
                  onClick={() => onCreateSubfolder(node.id)}
                >
                  <FolderPlusIcon size={12} weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${node.name}`}
                  disabled={!can("folders.manage")}
                  className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-[color:var(--topo-ink)]"
                  onClick={() => onRename(node.id)}
                >
                  <PencilSimpleIcon size={12} weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${node.name}`}
                  disabled={!can("folders.manage")}
                  className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => onDelete(node.id)}
                >
                  <TrashIcon size={12} weight="bold" />
                </button>
              </div>
            </div>
            {hasChildren && isOpen ? (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                selected={selected}
                onSelect={onSelect}
                folderCounts={folderCounts}
                onCreateSubfolder={onCreateSubfolder}
                onRename={onRename}
                onDelete={onDelete}
                onDropCases={onDropCases}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function FolderTreePane({
  folders,
  folderCounts,
  unfiledCount,
  totalCount,
  selected,
  onSelect,
  onCreateRoot,
  onCreateSubfolder,
  onRename,
  onDelete,
  onDropCases,
  collapsed,
  inline = false,
  onToggleCollapsed,
}: Props) {
  const { can } = useProjectActions();
  const [compact, setCompact] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCompact(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const f of folders) {
      if (f.parentId) initial.add(f.parentId);
    }
    if (selected !== "all" && selected !== "unfiled") {
      for (const a of folderAncestors(folders, selected)) {
        if (a.id !== selected) initial.add(a.id);
      }
    }
    return initial;
  });

  const selectionLabel = useMemo(() => {
    if (selected === "all") return `All cases (${totalCount})`;
    if (selected === "unfiled") return `Unfiled (${unfiledCount})`;
    return `${folderPathLabel(folders, selected)} (${folderCounts.get(selected) ?? 0})`;
  }, [selected, totalCount, unfiledCount, folders, folderCounts]);

  const ancestorKey =
    selected !== "all" && selected !== "unfiled"
      ? folderAncestors(folders, selected)
          .filter((f) => f.id !== selected)
          .map((f) => f.id)
          .join("|")
      : "";
  const [syncedAncestors, setSyncedAncestors] = useState(ancestorKey);
  if (syncedAncestors !== ancestorKey) {
    setSyncedAncestors(ancestorKey);
    if (ancestorKey) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of ancestorKey.split("|")) {
          if (id) next.add(id);
        }
        return next;
      });
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const navClass =
    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors";

  const treeBody = (
    <nav aria-label="Folders" className="space-y-0.5 p-1.5">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`${navClass} ${
          selected === "all"
            ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
            : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
        }`}
      >
        <FoldersIcon
          size={14}
          weight="duotone"
          className="shrink-0 text-[color:var(--topo-accent)]"
        />
        <span className="font-medium">All cases</span>
        <span className="ml-auto font-mono text-xs text-[color:var(--topo-muted)]">
          {totalCount}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onSelect("unfiled")}
        className={`${navClass} ${
          dropTarget === "unfiled"
            ? "bg-[color:var(--topo-accent-soft)] ring-1 ring-[color:var(--topo-accent)]"
            : selected === "unfiled"
              ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
              : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
        }`}
        onDragOver={(event) => {
          if (!onDropCases || !can("cases.edit") || !acceptCaseDrag(event)) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dropTarget !== "unfiled") setDropTarget("unfiled");
        }}
        onDragLeave={() => {
          if (dropTarget === "unfiled") setDropTarget(null);
        }}
        onDrop={(event) => {
          if (!onDropCases || !can("cases.edit")) return;
          event.preventDefault();
          setDropTarget(null);
          const ids = parseCaseDragIds(event);
          if (ids.length > 0) onDropCases(null, ids);
        }}
      >
        <FolderIcon
          size={14}
          weight="duotone"
          className="shrink-0 text-[color:var(--topo-muted)]"
        />
        <span className="font-medium">Unfiled</span>
        <span className="ml-auto font-mono text-xs text-[color:var(--topo-muted)]">
          {unfiledCount}
        </span>
      </button>

      <div className="my-1.5 border-t border-[color:var(--topo-line)]" />

      {tree.length === 0 ? (
        <p className="px-2 py-3 text-xs text-[color:var(--topo-muted)]">
          No folders yet. Create one to nest suites.
        </p>
      ) : (
        <TreeRows
          nodes={tree}
          depth={0}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selected={selected}
          onSelect={onSelect}
          folderCounts={folderCounts}
          onCreateSubfolder={onCreateSubfolder}
          onRename={onRename}
          onDelete={onDelete}
          onDropCases={onDropCases}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      )}
    </nav>
  );

  return (
    <aside className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--topo-line)] px-2.5 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left lg:pointer-events-none"
          onClick={inline ? undefined : onToggleCollapsed}
          disabled={inline}
          aria-expanded={inline ? undefined : !collapsed}
          aria-controls={inline ? undefined : "cases-folder-tree-mobile"}
        >
          <span className="font-medium text-xs tracking-[0.12em] text-[color:var(--topo-muted)]">
            Folders
          </span>
          <span className={inline ? "hidden" : "truncate text-xs text-[color:var(--topo-muted)] lg:hidden"}>
            {selectionLabel}
          </span>
          <span className={inline ? "hidden" : "ml-auto text-[color:var(--topo-muted)] lg:hidden"}>
            {collapsed ? (
              <CaretRightIcon size={12} weight="bold" />
            ) : (
              <CaretDownIcon size={12} weight="bold" />
            )}
          </span>
        </button>
        <Button
          size="sm"
          variant="tertiary"
          isIconOnly
          className="size-6 min-w-6 shrink-0 text-[color:var(--topo-ink)]"
          aria-label="New folder"
          isDisabled={!can("folders.manage")}
          onPress={onCreateRoot}
        >
          <PlusIcon size={13} weight="bold" />
        </Button>
      </div>

      <div className={inline ? "max-h-[min(70vh,32rem)] overflow-y-auto" : "hidden max-h-[min(70vh,32rem)] overflow-y-auto lg:block"}>
        {treeBody}
      </div>
      <Modal.Backdrop isOpen={!inline && compact && !collapsed} onOpenChange={(open) => { if (!open && !collapsed) onToggleCollapsed(); }}>
        <Modal.Container placement="center" size="sm" className="justify-start p-0">
          <Modal.Dialog aria-label="Case folders">
            <Modal.Header><Modal.Heading>Case folders</Modal.Heading><Modal.CloseTrigger /></Modal.Header>
            <Modal.Body id="cases-folder-tree-mobile">{treeBody}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </aside>
  );
}
