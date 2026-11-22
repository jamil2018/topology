"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type DragEvent,
} from "react";
import {
  Button,
  Chip,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import type { CaseListSort, CaseListSortDir } from "@/lib/case-list";
import { folderPathLabel } from "@/lib/folder-tree";
import { useLatestRef } from "@/lib/use-latest-ref";
import { GuidedFirstRun } from "./guided-first-run";
import { useProjectActions } from "./project-actions";
import { CasesTableBodySkeleton } from "./skeletons";
import { StatusChip, statusToneForRun } from "./status-chip";
import { useQualityGraph } from "./quality-graph-provider";
import { TopoCheckbox } from "./ui/topo-checkbox";
import { TopoSelect } from "./ui/topo-select";
import {
  CASE_DRAG_MIME,
  CASE_PRIORITIES,
  CASE_STATUSES,
  formatStatusLabel,
  type CaseInlinePatch,
  type CaseRow,
  type FlatFolder,
  type Folder,
} from "./cases-model";


const sortColumns: { id: CaseListSort; label: string }[] = [
  { id: "key", label: "Key" },
  { id: "title", label: "Title" },
  { id: "folder", label: "Folder" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
];

const PRIORITY_OPTIONS = CASE_PRIORITIES.map((priority) => ({
  id: priority,
  label: priority,
}));

const STATUS_OPTIONS = CASE_STATUSES.map((status) => ({
  id: status,
  label: formatStatusLabel(status),
}));

const IntentLink = memo(function IntentLink({
  intent,
}: {
  intent: { id: string; key: string };
}) {
  const { enabled } = useQualityGraph();
  if (!enabled) return null;
  return (
    <div className="mt-0.5">
      <Link
        href={`/intents?intent=${intent.id}`}
        className="text-xs uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)] hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        Intent {intent.key}
      </Link>
    </div>
  );
});

/** Compact, theme-safe select — lazy so dense rows do not mount ListBox trees idle. */
const InlineFieldSelect = memo(function InlineFieldSelect({
  ariaLabel,
  value,
  options,
  onChange,
  className,
  shortcut,
}: {
  ariaLabel: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  shortcut?: string;
}) {
  const { can } = useProjectActions();
  return (
    <TopoSelect
      ariaLabel={ariaLabel}
      className={className}
      value={value}
      onChange={onChange}
      options={options}
      isDisabled={!can("cases.edit")}
      triggerProps={shortcut ? { "data-case-shortcut": shortcut } : undefined}
      compact
      lazy
    />
  );
});

function folderOptions(folders: Folder[], flatFolders: FlatFolder[]) {
  return [
    { id: "none", label: "Unfiled" },
    ...flatFolders.map((folder) => ({
      id: folder.id,
      label: folderPathLabel(folders, folder.id),
    })),
  ];
}

const CaseInlineEdits = memo(function CaseInlineEdits({
  rowId,
  rowKey,
  folderId,
  priority,
  status,
  folderSelectOptions,
  onInlinePatch,
}: {
  rowId: string;
  rowKey: string;
  folderId: string;
  priority: string;
  status: string;
  folderSelectOptions: { id: string; label: string }[];
  onInlinePatch: (id: string, patch: CaseInlinePatch) => void;
}) {
  const onFolder = useCallback(
    (value: string) =>
      onInlinePatch(rowId, { folderId: value === "none" ? null : value }),
    [onInlinePatch, rowId],
  );
  const onPriority = useCallback(
    (value: string) => onInlinePatch(rowId, { priority: value }),
    [onInlinePatch, rowId],
  );
  const onStatus = useCallback(
    (value: string) => onInlinePatch(rowId, { status: value }),
    [onInlinePatch, rowId],
  );

  return (
    <>
      <InlineFieldSelect
        ariaLabel={`Folder for ${rowKey}`}
        className="w-[8.5rem]"
        value={folderId}
        options={folderSelectOptions}
        onChange={onFolder}
      />
      <InlineFieldSelect
        ariaLabel={`Priority for ${rowKey}`}
        className="w-[5.5rem]"
        shortcut={`${rowId}:priority`}
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={onPriority}
      />
      <InlineFieldSelect
        ariaLabel={`Status for ${rowKey}`}
        className="w-[7.5rem]"
        shortcut={`${rowId}:status`}
        value={status}
        options={STATUS_OPTIONS}
        onChange={onStatus}
      />
    </>
  );
});

type CaseTableRowProps = {
  row: CaseRow;
  index: number;
  selected: boolean;
  isActive: boolean;
  isCursor: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  folderSelectOptions: { id: string; label: string }[];
  onToggleSelect: (id: string) => void;
  onOpen: (row: CaseRow) => void;
  onDelete: (row: CaseRow) => void;
  onDuplicate?: (row: CaseRow) => void;
  onInlinePatch: (id: string, patch: CaseInlinePatch) => void;
  onDragStart: (event: DragEvent, row: CaseRow) => void;
};

/** One desktop table row — memoized so sibling selection/cursor changes skip work. */
const CaseTableRow = memo(function CaseTableRow({
  row,
  selected,
  isActive,
  isCursor,
  canEdit,
  canCreate,
  canDelete,
  folderSelectOptions,
  onToggleSelect,
  onOpen,
  onDelete,
  onDuplicate,
  onInlinePatch,
  onDragStart,
}: CaseTableRowProps) {
  const folderId = row.folder?.id ?? "none";
  const onFolder = useCallback(
    (value: string) =>
      onInlinePatch(row.id, { folderId: value === "none" ? null : value }),
    [onInlinePatch, row.id],
  );
  const onPriority = useCallback(
    (value: string) => onInlinePatch(row.id, { priority: value }),
    [onInlinePatch, row.id],
  );
  const onStatus = useCallback(
    (value: string) => onInlinePatch(row.id, { status: value }),
    [onInlinePatch, row.id],
  );

  return (
    <tr
      draggable={canEdit}
      onDragStart={(event) => onDragStart(event, row)}
      className={`topo-case-row group border-b border-[color:var(--topo-line)] last:border-0 ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${isActive || isCursor ? "topo-selected-surface" : ""}`}
      aria-current={isCursor ? "true" : undefined}
    >
      <td className="px-2 py-2">
        <TopoCheckbox
          compact
          aria-label={`Select ${row.key}`}
          isSelected={selected}
          onChange={() => onToggleSelect(row.id)}
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-[color:var(--topo-ink)]">
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 px-0 py-0 hover:underline"
          data-case-key={row.key}
          onPress={() => onOpen(row)}
        >
          {row.key}
        </Button>
        {row.intent ? <IntentLink intent={row.intent} /> : null}
      </td>
      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 px-0 py-0 text-left"
          data-case-key={row.key}
          onPress={() => onOpen(row)}
        >
          <div className="font-medium text-[color:var(--topo-ink)]">
            {row.title}
          </div>
          {row.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.tags.map((tag) => (
                <Chip key={tag} size="sm" variant="soft">
                  {tag}
                </Chip>
              ))}
            </div>
          ) : null}
        </Button>
      </td>
      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
        <InlineFieldSelect
          ariaLabel={`Folder for ${row.key}`}
          className="w-[8.5rem]"
          value={folderId}
          options={folderSelectOptions}
          onChange={onFolder}
        />
      </td>
      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
        <InlineFieldSelect
          ariaLabel={`Priority for ${row.key}`}
          className="w-[5.5rem]"
          shortcut={`${row.id}:priority`}
          value={row.priority}
          options={PRIORITY_OPTIONS}
          onChange={onPriority}
        />
      </td>
      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
        <InlineFieldSelect
          ariaLabel={`Status for ${row.key}`}
          className="w-[7.5rem]"
          shortcut={`${row.id}:status`}
          value={row.status}
          options={STATUS_OPTIONS}
          onChange={onStatus}
        />
      </td>
      <td className="px-2 py-2 text-right">
        <div className="flex items-center justify-end gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          {onDuplicate ? (
            <Button
              type="button"
              variant="ghost"
              isIconOnly
              aria-label={`Duplicate ${row.key}`}
              isDisabled={!canCreate}
              className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
              onPress={() => onDuplicate(row)}
            >
              <CopyIcon size={12} weight="bold" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={`Delete ${row.key}`}
            isDisabled={!canDelete}
            className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-red-600 dark:hover:text-red-400"
            onPress={() => onDelete(row)}
          >
            <TrashIcon size={12} weight="bold" />
          </Button>
        </div>
      </td>
    </tr>
  );
});

const CaseMobileRow = memo(function CaseMobileRow({
  row,
  selected,
  isActive,
  isCursor,
  canCreate,
  canDelete,
  folderSelectOptions,
  onToggleSelect,
  onOpen,
  onDelete,
  onDuplicate,
  onInlinePatch,
}: Omit<CaseTableRowProps, "index" | "canEdit" | "onDragStart">) {
  return (
    <li
      aria-current={isCursor ? "true" : undefined}
      className={`topo-case-row space-y-2 px-3 py-3 ${
        isActive || isCursor ? "topo-selected-surface" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <TopoCheckbox
          compact
          className="mt-1"
          aria-label={`Select ${row.key}`}
          isSelected={selected}
          onChange={() => onToggleSelect(row.id)}
        />
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 min-w-0 flex-1 justify-start px-0 py-0 text-left"
          data-case-key={row.key}
          onPress={() => onOpen(row)}
        >
          <span className="block">
            <span className="block font-mono text-xs text-[color:var(--topo-muted)]">
              {row.key}
            </span>
            <span className="block truncate text-sm font-medium text-[color:var(--topo-ink)]">
              {row.title}
            </span>
            {row.intent ? <IntentLink intent={row.intent} /> : null}
          </span>
        </Button>
        {onDuplicate ? (
          <Button
            type="button"
            variant="ghost"
            isIconOnly
            aria-label={`Duplicate ${row.key}`}
            isDisabled={!canCreate}
            className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
            onPress={() => onDuplicate(row)}
          >
            <CopyIcon size={12} weight="bold" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          isIconOnly
          aria-label={`Delete ${row.key}`}
          isDisabled={!canDelete}
          className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-red-600 dark:hover:text-red-400"
          onPress={() => onDelete(row)}
        >
          <TrashIcon size={12} weight="bold" />
        </Button>
      </div>
      {row.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 pl-6">
          {row.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="soft">
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 pl-6">
        <CaseInlineEdits
          rowId={row.id}
          rowKey={row.key}
          folderId={row.folder?.id ?? "none"}
          priority={row.priority}
          status={row.status}
          folderSelectOptions={folderSelectOptions}
          onInlinePatch={onInlinePatch}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 pl-6">
        <StatusChip mono>{row.priority}</StatusChip>
        <StatusChip tone={statusToneForRun(row.status)}>
          {formatStatusLabel(row.status)}
        </StatusChip>
      </div>
    </li>
  );
});

export const CasesTable = memo(function CasesTable({
  cases,
  totalCases,
  folders,
  flatFolders,
  search,
  hasSearch,
  matchCount,
  sort,
  sortDir,
  selectedIds,
  allPageSelected,
  activeId,
  cursorIndex,
  rangeStart,
  rangeEnd,
  total,
  page,
  totalPages,
  showPagination,
  loading = false,
  onSearch,
  onToggleSort,
  onToggleSelect,
  onToggleSelectPage,
  onOpen,
  onDelete,
  onDuplicate,
  onInlinePatch,
  onPageChange,
}: {
  cases: CaseRow[];
  totalCases: number;
  folders: Folder[];
  flatFolders: FlatFolder[];
  search: string;
  hasSearch: boolean;
  matchCount: number;
  sort: CaseListSort;
  sortDir: CaseListSortDir;
  selectedIds: Set<string>;
  allPageSelected: boolean;
  activeId: string | null;
  cursorIndex: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  page: number;
  totalPages: number;
  showPagination: boolean;
  loading?: boolean;
  onSearch: (value: string) => void;
  onToggleSort: (sort: CaseListSort) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectPage: () => void;
  onOpen: (row: CaseRow) => void;
  onDelete: (row: CaseRow) => void;
  onDuplicate?: (row: CaseRow) => void;
  onInlinePatch: (id: string, patch: CaseInlinePatch) => void;
  onPageChange: (page: number) => void;
}) {
  const { can } = useProjectActions();
  const canEdit = can("cases.edit");
  const canCreate = can("cases.create");
  const canDelete = can("cases.delete");
  const rootRef = useRef<HTMLDivElement | null>(null);
  // no-ref-current-in-render: sync via useLayoutEffect inside useLatestRef
  const selectedIdsRef = useLatestRef(selectedIds);

  const folderSelectOptions = useMemo(
    () => folderOptions(folders, flatFolders),
    [folders, flatFolders],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || cursorIndex < 0) return;
    const current = root.querySelector<HTMLElement>('[aria-current="true"]');
    if (typeof current?.scrollIntoView === "function") {
      current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [cursorIndex]);

  // rerender-defer-reads / rerender-use-ref-transient-values: drag payload reads
  // selection from a ref so beginCaseDrag stays stable across selection toggles.
  const beginCaseDrag = useCallback(
    (event: DragEvent, row: CaseRow) => {
      if (!canEdit) {
        event.preventDefault();
        return;
      }
      const current = selectedIdsRef.current;
      const ids =
        current.has(row.id) && current.size > 0
          ? Array.from(current)
          : [row.id];
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(CASE_DRAG_MIME, JSON.stringify(ids));
      event.dataTransfer.setData("text/plain", ids.join(","));
    },
    [canEdit, selectedIdsRef],
  );

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] md:h-full"
      aria-busy={loading || undefined}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-[color:var(--topo-line)] p-2.5 sm:flex-row sm:items-center sm:gap-3">
        <TextField name="case-list-search" className="min-w-0 flex-1">
          <Label className="sr-only">Search cases</Label>
          <Input
            aria-label="Search cases"
            placeholder="Search title, key, tags, or folder"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full"
          />
        </TextField>
        {hasSearch && !loading ? (
          <p className="shrink-0 text-xs text-[color:var(--topo-muted)]">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Updating cases"
          className="min-h-0 flex-1 overflow-auto"
        >
          <CasesTableBodySkeleton />
        </div>
      ) : (
        <>
      <div
        className="topo-cases-table-scroll relative hidden min-h-0 flex-1 overflow-auto md:block"
        tabIndex={0}
        role="region"
        aria-label="Case table"
      >
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[color:var(--topo-line)] text-xs text-[color:var(--topo-muted)]">
            <tr>
              <th className="w-10 px-2 py-2">
                <TopoCheckbox
                  compact
                  aria-label="Select page"
                  isSelected={allPageSelected}
                  onChange={() => onToggleSelectPage()}
                />
              </th>
              {sortColumns.map((col) => {
                const active = sort === col.id;
                return (
                  <th
                    key={col.id}
                    className="px-3 py-2 font-medium"
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onPress={() => onToggleSort(col.id)}
                      className={`inline-flex h-auto min-h-0 items-center gap-1 px-0 py-0 transition-colors ${
                        active
                          ? "text-[color:var(--topo-ink)]"
                          : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                      }`}
                    >
                      {col.label}
                      <span aria-hidden className="font-sans text-[9px]">
                        {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </Button>
                  </th>
                );
              })}
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {totalCases === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6">
                  <GuidedFirstRun
                    title="No cases yet"
                    description="Create the first case, then start a run, import CI, and file issues from triage."
                  />
                </td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-[color:var(--topo-muted)]"
                >
                  No cases match this search or folder.
                </td>
              </tr>
            ) : (
              cases.map((row, index) => (
                <CaseTableRow
                  key={row.id}
                  row={row}
                  index={index}
                  selected={selectedIds.has(row.id)}
                  isActive={activeId === row.id}
                  isCursor={cursorIndex === index}
                  canEdit={canEdit}
                  canCreate={canCreate}
                  canDelete={canDelete}
                  folderSelectOptions={folderSelectOptions}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInlinePatch={onInlinePatch}
                  onDragStart={beginCaseDrag}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[color:var(--topo-line)] md:hidden">
        {totalCases === 0 ? (
          <li className="px-3 py-6">
            <GuidedFirstRun
              title="No cases yet"
              description="Create the first case, then start a run, import CI, and file issues from triage."
            />
          </li>
        ) : cases.length === 0 ? (
          <li className="px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No cases match this search or folder.
          </li>
        ) : (
          cases.map((row, index) => (
            <CaseMobileRow
              key={row.id}
              row={row}
              selected={selectedIds.has(row.id)}
              isActive={activeId === row.id}
              isCursor={cursorIndex === index}
              canCreate={canCreate}
              canDelete={canDelete}
              folderSelectOptions={folderSelectOptions}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onInlinePatch={onInlinePatch}
            />
          ))
        )}
      </ul>
        </>
      )}

      {!loading && showPagination ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] px-2.5 py-2">
          <p className="text-xs text-[color:var(--topo-muted)]">
            {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page <= 1}
              onPress={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page >= totalPages}
              onPress={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
