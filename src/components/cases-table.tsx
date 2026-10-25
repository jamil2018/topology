"use client";

import Link from "next/link";
import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { motion } from "motion/react";
import { TrashIcon } from "@phosphor-icons/react";
import type { CaseListSort, CaseListSortDir } from "@/lib/case-list";
import { folderPathLabel } from "@/lib/folder-tree";
import { GuidedFirstRun } from "./guided-first-run";
import { StatusChip, statusToneForRun } from "./status-chip";
import { useQualityGraph } from "./quality-graph-provider";
import {
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

function IntentLink({
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
        className="text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)] hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        Intent {intent.key}
      </Link>
    </div>
  );
}

function InlineFieldSelect({
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
  return (
    <Select
      className={className}
      variant="secondary"
      value={value}
      onChange={(next) => {
        if (next == null) return;
        onChange(String(next));
      }}
    >
      <Label className="sr-only">{ariaLabel}</Label>
      <Select.Trigger className="min-w-0" data-case-shortcut={shortcut}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function folderOptions(folders: Folder[], flatFolders: FlatFolder[]) {
  return [
    { id: "none", label: "Unfiled" },
    ...flatFolders.map((folder) => ({
      id: folder.id,
      label: folderPathLabel(folders, folder.id),
    })),
  ];
}

function CaseInlineEdits({
  row,
  folders,
  flatFolders,
  onInlinePatch,
}: {
  row: CaseRow;
  folders: Folder[];
  flatFolders: FlatFolder[];
  onInlinePatch: (id: string, patch: CaseInlinePatch) => void;
}) {
  return (
    <>
      <InlineFieldSelect
        ariaLabel={`Folder for ${row.key}`}
        className="w-[8.5rem]"
        value={row.folder?.id ?? "none"}
        options={folderOptions(folders, flatFolders)}
        onChange={(value) =>
          onInlinePatch(row.id, { folderId: value === "none" ? null : value })
        }
      />
      <InlineFieldSelect
        ariaLabel={`Priority for ${row.key}`}
        className="w-[5.5rem]"
        shortcut={`${row.id}:priority`}
        value={row.priority}
        options={CASE_PRIORITIES.map((priority) => ({
          id: priority,
          label: priority,
        }))}
        onChange={(value) => onInlinePatch(row.id, { priority: value })}
      />
      <InlineFieldSelect
        ariaLabel={`Status for ${row.key}`}
        className="w-[7.5rem]"
        shortcut={`${row.id}:status`}
        value={row.status}
        options={CASE_STATUSES.map((status) => ({
          id: status,
          label: formatStatusLabel(status),
        }))}
        onChange={(value) => onInlinePatch(row.id, { status: value })}
      />
    </>
  );
}

export function CasesTable({
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
  onSearch,
  onToggleSort,
  onToggleSelect,
  onToggleSelectPage,
  onOpen,
  onDelete,
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
  onSearch: (value: string) => void;
  onToggleSort: (sort: CaseListSort) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectPage: () => void;
  onOpen: (row: CaseRow) => void;
  onDelete: (row: CaseRow) => void;
  onInlinePatch: (id: string, patch: CaseInlinePatch) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex flex-col gap-2 border-b border-[color:var(--topo-line)] p-2.5 sm:flex-row sm:items-center sm:gap-3">
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
        {hasSearch ? (
          <p className="shrink-0 text-xs text-[color:var(--topo-muted)]">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </p>
        ) : null}
      </div>

      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="border-b border-[color:var(--topo-line)] font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
          <tr>
            <th className="w-10 px-2 py-2">
              <input
                type="checkbox"
                aria-label="Select page"
                checked={allPageSelected}
                onChange={onToggleSelectPage}
                className="accent-[color:var(--topo-accent)]"
              />
            </th>
            {sortColumns.map((col) => {
              const active = sort === col.id;
              return (
                <th key={col.id} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onToggleSort(col.id)}
                    className={`inline-flex items-center gap-1 uppercase tracking-[0.12em] transition-colors ${
                      active
                        ? "text-[color:var(--topo-ink)]"
                        : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {col.label}
                    <span aria-hidden className="font-sans text-[9px]">
                      {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
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
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.02 }}
                className={`group border-b border-[color:var(--topo-line)] last:border-0 ${
                  activeId === row.id || cursorIndex === index
                    ? "bg-[color:var(--topo-accent-soft)]"
                    : ""
                }`}
                aria-current={cursorIndex === index ? "true" : undefined}
              >
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.key}`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggleSelect(row.id)}
                    className="accent-[color:var(--topo-accent)]"
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[color:var(--topo-accent)]">
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => onOpen(row)}
                  >
                    {row.key}
                  </button>
                  {row.intent ? <IntentLink intent={row.intent} /> : null}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => onOpen(row)}
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
                  </button>
                </td>
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <InlineFieldSelect
                    ariaLabel={`Folder for ${row.key}`}
                    className="w-[8.5rem]"
                    value={row.folder?.id ?? "none"}
                    options={folderOptions(folders, flatFolders)}
                    onChange={(value) =>
                      onInlinePatch(row.id, {
                        folderId: value === "none" ? null : value,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <InlineFieldSelect
                    ariaLabel={`Priority for ${row.key}`}
                    className="w-[5.5rem]"
                    shortcut={`${row.id}:priority`}
                    value={row.priority}
                    options={CASE_PRIORITIES.map((priority) => ({
                      id: priority,
                      label: priority,
                    }))}
                    onChange={(value) =>
                      onInlinePatch(row.id, { priority: value })
                    }
                  />
                </td>
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <InlineFieldSelect
                    ariaLabel={`Status for ${row.key}`}
                    className="w-[7.5rem]"
                    shortcut={`${row.id}:status`}
                    value={row.status}
                    options={CASE_STATUSES.map((status) => ({
                      id: status,
                      label: formatStatusLabel(status),
                    }))}
                    onChange={(value) =>
                      onInlinePatch(row.id, { status: value })
                    }
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    aria-label={`Delete ${row.key}`}
                    className="rounded p-1 text-[color:var(--topo-muted)] opacity-100 hover:bg-[color:var(--topo-chip)] hover:text-red-600 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 dark:hover:text-red-400"
                    onClick={() => onDelete(row)}
                  >
                    <TrashIcon size={12} weight="bold" />
                  </button>
                </td>
              </motion.tr>
            ))
          )}
        </tbody>
      </table>

      <ul className="divide-y divide-[color:var(--topo-line)] sm:hidden">
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
            <li
              key={row.id}
              aria-current={cursorIndex === index ? "true" : undefined}
              className={`space-y-2 px-3 py-3 ${
                activeId === row.id || cursorIndex === index
                  ? "bg-[color:var(--topo-accent-soft)]"
                  : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.key}`}
                  checked={selectedIds.has(row.id)}
                  onChange={() => onToggleSelect(row.id)}
                  className="mt-1 accent-[color:var(--topo-accent)]"
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(row)}
                >
                  <p className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {row.key}
                  </p>
                  <p className="text-sm font-medium text-[color:var(--topo-ink)]">
                    {row.title}
                  </p>
                  {row.intent ? <IntentLink intent={row.intent} /> : null}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${row.key}`}
                  className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-red-600"
                  onClick={() => onDelete(row)}
                >
                  <TrashIcon size={12} weight="bold" />
                </button>
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
                  row={row}
                  folders={folders}
                  flatFolders={flatFolders}
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
          ))
        )}
      </ul>

      {showPagination ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] px-2.5 py-2">
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
}
