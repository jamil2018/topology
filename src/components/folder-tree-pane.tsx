"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
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
import { CASE_DRAG_MIME, FOLDER_DRAG_MIME } from "./cases-model";

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
  onReparentFolder?: (folderId: string, parentId: string | null) => void;
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

function parseFolderDragId(event: DragEvent): string | null {
  const raw = event.dataTransfer.getData(FOLDER_DRAG_MIME);
  return raw.trim() || null;
}

function acceptCaseDrag(event: DragEvent) {
  const types = Array.from(event.dataTransfer.types);
  return types.includes(CASE_DRAG_MIME) || types.includes("text/plain");
}

function acceptFolderDrag(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes(FOLDER_DRAG_MIME);
}

type FolderTreeRowProps = {
  node: FolderTreeNode;
  depth: number;
  isOpen: boolean;
  isSelected: boolean;
  isDrop: boolean;
  count: number;
  toggleExpanded: (id: string) => void;
  selected: FolderTreeSelection;
  onSelect: (id: FolderTreeSelection) => void;
  folderCounts: Map<string, number>;
  onCreateSubfolder: (parentId: string) => void;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onDropCases?: (folderId: string | null, caseIds: string[]) => void;
  onReparentFolder?: (folderId: string, parentId: string | null) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  expanded: Set<string>;
};

/** Single folder node — memoized so sibling selection does not re-render the tree. */
const FolderTreeRow = memo(function FolderTreeRow({
  node,
  depth,
  isOpen,
  isSelected,
  isDrop,
  count,
  toggleExpanded,
  selected,
  onSelect,
  folderCounts,
  onCreateSubfolder,
  onRename,
  onDelete,
  onDropCases,
  onReparentFolder,
  dropTarget,
  setDropTarget,
  expanded,
}: FolderTreeRowProps) {
  const { can } = useProjectActions();
  const hasChildren = node.children.length > 0;
  const canDragFolder = Boolean(onReparentFolder) && can("folders.manage");

  return (
    <div>
      <div
        className={`group flex items-start gap-0.5 rounded-md pr-1 ${
          isDrop
            ? "topo-selected-surface ring-1 ring-[color:var(--topo-accent)]"
            : isSelected
              ? "topo-selected-surface"
              : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable={canDragFolder}
        onDragStart={(event) => {
          if (!canDragFolder) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(FOLDER_DRAG_MIME, node.id);
          event.dataTransfer.setData("text/plain", node.id);
        }}
        onDragOver={(event) => {
          const folderDrag = acceptFolderDrag(event);
          const caseDrag = acceptCaseDrag(event);
          if (folderDrag && onReparentFolder && can("folders.manage")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dropTarget !== node.id) setDropTarget(node.id);
            return;
          }
          if (!onDropCases || !can("cases.edit") || !caseDrag) {
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
          event.preventDefault();
          setDropTarget(null);
          const folderId = parseFolderDragId(event);
          if (
            folderId &&
            onReparentFolder &&
            can("folders.manage") &&
            folderId !== node.id
          ) {
            onReparentFolder(folderId, node.id);
            return;
          }
          if (!onDropCases || !can("cases.edit")) return;
          const ids = parseCaseDragIds(event);
          if (ids.length > 0) onDropCases(node.id, ids);
        }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={
              isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`
            }
            aria-expanded={isOpen}
            onPress={() => toggleExpanded(node.id)}
            className="mt-0.5 h-6 w-5 min-h-6 min-w-5 shrink-0 rounded text-[color:var(--topo-muted)] hover:bg-transparent hover:text-[color:var(--topo-ink)]"
          >
            {isOpen ? (
              <CaretDownIcon size={12} weight="bold" />
            ) : (
              <CaretRightIcon size={12} weight="bold" />
            )}
          </Button>
        ) : (
          <span aria-hidden="true" className="mt-0.5 h-6 w-5 shrink-0" />
        )}
        <Button
          type="button"
          variant="ghost"
          aria-current={isSelected ? "true" : undefined}
          onPress={() => onSelect(node.id)}
          className="flex h-auto min-h-0 min-w-0 flex-1 items-start justify-start gap-1.5 whitespace-normal rounded-md bg-transparent px-1 py-1 text-left text-sm text-inherit hover:bg-transparent"
        >
          {isOpen || isSelected ? (
            <FolderOpenIcon
              size={14}
              weight="duotone"
              className="mt-0.5 shrink-0 text-[color:var(--topo-accent)]"
            />
          ) : (
            <FolderIcon
              size={14}
              weight="duotone"
              className="mt-0.5 shrink-0 text-[color:var(--topo-muted)]"
            />
          )}
          <span className="min-w-0 flex-1 break-words whitespace-normal font-medium text-wrap">
            {node.name}
          </span>
          <span className="mt-0.5 shrink-0 font-mono text-xs text-[color:var(--topo-muted)]">
            {count}
          </span>
        </Button>
        <div className="mt-0.5 flex shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={`New subfolder in ${node.name}`}
            isDisabled={!can("folders.manage")}
            className="size-6 min-h-6 min-w-6 rounded text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-[color:var(--topo-ink)]"
            onPress={() => onCreateSubfolder(node.id)}
          >
            <FolderPlusIcon size={12} weight="bold" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={`Rename ${node.name}`}
            isDisabled={!can("folders.manage")}
            className="size-6 min-h-6 min-w-6 rounded text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-[color:var(--topo-ink)]"
            onPress={() => onRename(node.id)}
          >
            <PencilSimpleIcon size={12} weight="bold" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={`Delete ${node.name}`}
            isDisabled={!can("folders.manage")}
            className="size-6 min-h-6 min-w-6 rounded text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-panel)] hover:text-red-600 dark:hover:text-red-400"
            onPress={() => onDelete(node.id)}
          >
            <TrashIcon size={12} weight="bold" />
          </Button>
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
          onReparentFolder={onReparentFolder}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      ) : null}
    </div>
  );
});

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
  onReparentFolder,
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
  onReparentFolder?: (folderId: string, parentId: string | null) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <FolderTreeRow
          key={node.id}
          node={node}
          depth={depth}
          isOpen={expanded.has(node.id)}
          isSelected={selected === node.id}
          isDrop={dropTarget === node.id}
          count={folderCounts.get(node.id) ?? 0}
          toggleExpanded={toggleExpanded}
          selected={selected}
          onSelect={onSelect}
          folderCounts={folderCounts}
          onCreateSubfolder={onCreateSubfolder}
          onRename={onRename}
          onDelete={onDelete}
          onDropCases={onDropCases}
          onReparentFolder={onReparentFolder}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          expanded={expanded}
        />
      ))}
    </>
  );
}

export const FolderTreePane = memo(function FolderTreePane({
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
  onReparentFolder,
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
    sync();
    media.addEventListener("change", sync);
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

  // rerender-functional-setstate: stable expand toggle
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const navClass =
    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors";

  const treeBody = (
    <nav aria-label="Folders" className="space-y-0.5 p-1.5">
      <div
        onDragOver={(event) => {
          if (
            !onReparentFolder ||
            !can("folders.manage") ||
            !acceptFolderDrag(event)
          ) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dropTarget !== "root") setDropTarget("root");
        }}
        onDragLeave={() => {
          if (dropTarget === "root") setDropTarget(null);
        }}
        onDrop={(event) => {
          if (!onReparentFolder || !can("folders.manage")) return;
          event.preventDefault();
          setDropTarget(null);
          const folderId = parseFolderDragId(event);
          if (folderId) onReparentFolder(folderId, null);
        }}
      >
        <Button
          type="button"
          variant="ghost"
          aria-current={selected === "all" ? "true" : undefined}
          onPress={() => onSelect("all")}
          className={`${navClass} h-auto min-h-0 ${
            dropTarget === "root"
              ? "topo-selected-surface ring-1 ring-[color:var(--topo-accent)]"
              : selected === "all"
                ? "topo-selected-surface"
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
        </Button>
      </div>
      <div
        onDragOver={(event) => {
          if (acceptFolderDrag(event)) return;
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
          if (acceptFolderDrag(event) || parseFolderDragId(event)) return;
          if (!onDropCases || !can("cases.edit")) return;
          event.preventDefault();
          setDropTarget(null);
          const ids = parseCaseDragIds(event);
          if (ids.length > 0) onDropCases(null, ids);
        }}
      >
        <Button
          type="button"
          variant="ghost"
          aria-current={selected === "unfiled" ? "true" : undefined}
          onPress={() => onSelect("unfiled")}
          className={`${navClass} h-auto min-h-0 ${
            dropTarget === "unfiled"
              ? "topo-selected-surface ring-1 ring-[color:var(--topo-accent)]"
              : selected === "unfiled"
                ? "topo-selected-surface"
                : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
          }`}
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
        </Button>
      </div>

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
          onReparentFolder={onReparentFolder}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      )}
    </nav>
  );

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--topo-line)] px-2.5 py-2">
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto min-h-0 min-w-0 flex-1 items-center justify-start gap-2 rounded-md bg-transparent px-1 py-0.5 text-left hover:bg-transparent lg:pointer-events-none"
          onPress={inline ? undefined : onToggleCollapsed}
          isDisabled={inline}
          aria-expanded={inline ? undefined : !collapsed}
          aria-controls={inline ? undefined : "cases-folder-tree-mobile"}
        >
          <span className="font-medium text-xs tracking-[0.12em] text-[color:var(--topo-muted)]">
            Folders
          </span>
          <span
            className={
              inline
                ? "hidden"
                : "truncate text-xs text-[color:var(--topo-muted)] lg:hidden"
            }
          >
            {selectionLabel}
          </span>
          <span
            className={
              inline ? "hidden" : "ml-auto text-[color:var(--topo-muted)] lg:hidden"
            }
          >
            {collapsed ? (
              <CaretRightIcon size={12} weight="bold" />
            ) : (
              <CaretDownIcon size={12} weight="bold" />
            )}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          className="size-6 min-h-6 min-w-6 shrink-0 text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-surface)]"
          aria-label="New folder"
          isDisabled={!can("folders.manage")}
          onPress={onCreateRoot}
        >
          <PlusIcon size={13} weight="bold" />
        </Button>
      </div>

      {/* Inline/popup: parent popup owns scroll. Desktop rail: this pane scrolls. */}
      <div
        className={
          inline
            ? undefined
            : "hidden min-h-0 flex-1 overflow-y-auto lg:block"
        }
      >
        {treeBody}
      </div>
      <Modal.Backdrop
        isOpen={!inline && compact && !collapsed}
        onOpenChange={(open) => {
          if (!open && !collapsed) onToggleCollapsed();
        }}
      >
        <Modal.Container placement="center" size="sm" className="justify-start p-0">
          <Modal.Dialog aria-label="Case folders">
            <Modal.Header>
              <Modal.Heading>Case folders</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body id="cases-folder-tree-mobile">{treeBody}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </aside>
  );
});
