"use client";

import { useMemo } from "react";
import type { Selection, SortDescriptor } from "@heroui/react";
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  TextField,
} from "@heroui/react";
import { StatusChip } from "./status-chip";
import type { CasePickerSort, PickerCase } from "@/lib/run-case-picker";

type Folder = { id: string; name: string };

const statuses = ["all", "draft", "ready", "blocked", "deprecated"] as const;
const priorities = ["all", "P0", "P1", "P2", "P3"] as const;
const sorts: { id: CasePickerSort; label: string }[] = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "title", label: "Title" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
];

const SORTABLE_COLUMNS = new Set<CasePickerSort>([
  "title",
  "priority",
  "status",
]);

function sortDescriptorFor(sort: CasePickerSort): SortDescriptor | undefined {
  if (!SORTABLE_COLUMNS.has(sort)) return undefined;
  return { column: sort, direction: "ascending" };
}

export function RunCasePickerTable({
  visible,
  folders,
  tags,
  search,
  status,
  priority,
  folderId,
  tag,
  sort,
  selectedIds,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onFolderChange,
  onTagChange,
  onSortChange,
  onSelectionChange,
  onResetToReady,
}: {
  visible: PickerCase[];
  folders: Folder[];
  tags: string[];
  search: string;
  status: string;
  priority: string;
  folderId: string;
  tag: string;
  sort: CasePickerSort;
  selectedIds: Set<string>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSortChange: (value: CasePickerSort) => void;
  onSelectionChange: (keys: Selection) => void;
  onResetToReady: () => void;
}) {
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const selectedCount = selectedIds.size;

  const tableSelectedKeys = useMemo<Selection>(() => {
    if (visibleIds.length === 0) return new Set();
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id));
    if (selectedVisible.length === visibleIds.length) return "all";
    return new Set(selectedVisible);
  }, [visibleIds, selectedIds]);

  const sortDescriptor = sortDescriptorFor(sort);

  return (
    <Table
      aria-label="Cases for this run"
      className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]"
      variant="secondary"
    >
      {/* v3 topContent: controls compose before ScrollContainer */}
      <div className="space-y-2 border-b border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/30 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-[color:var(--topo-ink)]">
            Cases for this run
          </div>
          <StatusChip mono>
            {selectedCount} selected · {visible.length} visible
          </StatusChip>
        </div>

        <TextField name="case-search" className="w-full">
          <Label>Search</Label>
          <Input
            placeholder="Title, key, ID, or tag"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full"
          />
        </TextField>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            className="w-full"
            variant="secondary"
            placeholder="Status"
            value={status}
            onChange={(value) => {
              if (value == null) return;
              onStatusChange(String(value));
            }}
          >
            <Label>Status</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {statuses.map((s) => (
                  <ListBox.Item key={s} id={s} textValue={s}>
                    {s === "all" ? "All statuses" : s}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            className="w-full"
            variant="secondary"
            placeholder="Priority"
            value={priority}
            onChange={(value) => {
              if (value == null) return;
              onPriorityChange(String(value));
            }}
          >
            <Label>Priority</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {priorities.map((p) => (
                  <ListBox.Item key={p} id={p} textValue={p}>
                    {p === "all" ? "All priorities" : p}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            className="w-full"
            variant="secondary"
            placeholder="Folder"
            value={folderId}
            onChange={(value) => {
              if (value == null) return;
              onFolderChange(String(value));
            }}
          >
            <Label>Folder / suite</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All folders">
                  All folders
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {folders.map((f) => (
                  <ListBox.Item key={f.id} id={f.id} textValue={f.name}>
                    {f.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            className="w-full"
            variant="secondary"
            placeholder="Tag"
            value={tag}
            onChange={(value) => {
              if (value == null) return;
              onTagChange(String(value));
            }}
          >
            <Label>Tag</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All tags">
                  All tags
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {tags.map((t) => (
                  <ListBox.Item key={t} id={t} textValue={t}>
                    {t}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              id="case-picker-sort-label"
              className="shrink-0 text-xs text-[color:var(--topo-muted)]"
            >
              Sort
            </span>
            <Select
              aria-labelledby="case-picker-sort-label"
              className="w-[9.5rem] shrink-0"
              variant="secondary"
              placeholder="Updated"
              value={sort}
              onChange={(value) => {
                if (value == null) return;
                onSortChange(String(value) as CasePickerSort);
              }}
            >
              <Select.Trigger className="h-9 min-h-9 py-0 md:h-8 md:min-h-8">
                <Select.Value className="text-center" />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {sorts.map((s) => (
                    <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                      {s.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <div
            className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
            role="group"
            aria-label="Case selection"
          >
            <Button size="sm" variant="tertiary" onPress={onResetToReady}>
              Reset to all ready
            </Button>
          </div>
        </div>
      </div>

      <Table.ScrollContainer className="max-h-64">
        <Table.Content
          aria-label="Case picker"
          className="min-w-[720px] text-sm"
          selectionMode="multiple"
          selectedKeys={tableSelectedKeys}
          onSelectionChange={onSelectionChange}
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) => {
            const col = String(descriptor.column);
            if (
              col === "title" ||
              col === "priority" ||
              col === "status" ||
              col === "key"
            ) {
              onSortChange(col === "key" ? "title" : (col as CasePickerSort));
            }
          }}
        >
          <Table.Header>
            <Table.Column className="w-10 pe-0">
              <Checkbox aria-label="Select all visible cases" slot="selection">
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
            </Table.Column>
            <Table.Column id="title" isRowHeader allowsSorting>
              {({ sortDirection }) => (
                <Table.SortableColumnHeader sortDirection={sortDirection}>
                  Title
                </Table.SortableColumnHeader>
              )}
            </Table.Column>
            <Table.Column id="key">Key</Table.Column>
            <Table.Column id="priority" allowsSorting>
              {({ sortDirection }) => (
                <Table.SortableColumnHeader sortDirection={sortDirection}>
                  Priority
                </Table.SortableColumnHeader>
              )}
            </Table.Column>
            <Table.Column id="status" allowsSorting>
              {({ sortDirection }) => (
                <Table.SortableColumnHeader sortDirection={sortDirection}>
                  Status
                </Table.SortableColumnHeader>
              )}
            </Table.Column>
            <Table.Column id="folder">Folder</Table.Column>
            <Table.Column id="tags">Tags</Table.Column>
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <EmptyState className="flex min-h-32 w-full flex-col items-center justify-center px-3 py-8 text-center">
                <span className="text-sm text-[color:var(--topo-muted)]">
                  No cases match these filters.
                </span>
              </EmptyState>
            )}
          >
            {visible.map((c) => (
              <Table.Row key={c.id} id={c.id}>
                <Table.Cell className="pe-0">
                  <Checkbox
                    aria-label={`Select ${c.title}`}
                    slot="selection"
                    variant="secondary"
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-medium text-[color:var(--topo-ink)]">
                    {c.title}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-[11px] text-[color:var(--topo-muted)]">
                    {c.key}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <StatusChip mono>{c.priority}</StatusChip>
                </Table.Cell>
                <Table.Cell>
                  <StatusChip mono>{c.status}</StatusChip>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[11px] text-[color:var(--topo-muted)]">
                    {c.folder?.name ?? "—"}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).length === 0 ? (
                      <span className="text-[11px] text-[color:var(--topo-muted)]">
                        —
                      </span>
                    ) : (
                      (c.tags ?? []).slice(0, 4).map((t) => (
                        <Chip key={t} size="sm" variant="soft">
                          {t}
                        </Chip>
                      ))
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>

      <Table.Footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/20 px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
        <span>
          {selectedCount} selected · {visible.length} visible
        </span>
        <span className="font-mono uppercase tracking-wide">
          Multi-select required
        </span>
      </Table.Footer>
    </Table>
  );
}
