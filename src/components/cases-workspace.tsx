"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Button,
  Input,
  TextArea,
  Chip,
  Label,
  TextField,
  ListBox,
  Select,
  ComboBox,
  Modal,
  Dropdown,
  useOverlayState,
} from "@heroui/react";
import { motion, AnimatePresence } from "motion/react";
import {
  CaretDownIcon,
  DotsThreeVerticalIcon,
  FileArrowDownIcon,
  FileArrowUpIcon,
  FileCsvIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  CASE_LIST_PAGE_SIZE,
  filterAndSortCases,
  paginateCases,
  type CaseListSort,
  type CaseListSortDir,
} from "@/lib/case-list";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type Folder = { id: string; name: string };
type CaseRow = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: Folder | null;
};

const priorities = ["P0", "P1", "P2", "P3"] as const;
const statuses = ["draft", "ready", "blocked", "deprecated"] as const;

const sortColumns: { id: CaseListSort; label: string }[] = [
  { id: "key", label: "Key" },
  { id: "title", label: "Title" },
  { id: "folder", label: "Folder" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
];

export function CasesWorkspace({
  initialCases,
  folders,
}: {
  initialCases: CaseRow[];
  folders: Folder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CaseListSort>("key");
  const [sortDir, setSortDir] = useState<CaseListSortDir>("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<"create" | "rename">(
    "create",
  );
  const folderModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setFolderName("");
        setFolderError(null);
        setFolderModalMode("create");
      }
    },
  });
  const deleteModal = useOverlayState();
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderPending, setFolderPending] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    key: "",
    title: "",
    description: "",
    priority: "P2",
    status: "draft",
    folderId: "",
    tags: "",
  });

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of initialCases) {
      if (!c.folder?.id) continue;
      counts.set(c.folder.id, (counts.get(c.folder.id) ?? 0) + 1);
    }
    return counts;
  }, [initialCases]);

  const selectedFolder =
    folderFilter === "all"
      ? null
      : (folders.find((f) => f.id === folderFilter) ?? null);

  const activeFolderFilter = selectedFolder ? selectedFolder.id : "all";

  const selectedFolderCount = selectedFolder
    ? (folderCounts.get(selectedFolder.id) ?? 0)
    : 0;

  const filteredSorted = useMemo(
    () =>
      filterAndSortCases(
        initialCases,
        activeFolderFilter,
        search,
        sort,
        sortDir,
      ),
    [initialCases, activeFolderFilter, search, sort, sortDir],
  );

  const pageData = useMemo(
    () => paginateCases(filteredSorted, page, CASE_LIST_PAGE_SIZE),
    [filteredSorted, page],
  );

  const hasSearch = search.trim().length > 0;

  useEffect(() => {
    setPage(1);
  }, [folderFilter, search, sort, sortDir]);

  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);

  const rangeStart =
    pageData.total === 0 ? 0 : (pageData.page - 1) * CASE_LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(pageData.page * CASE_LIST_PAGE_SIZE, pageData.total);

  function toggleSort(next: CaseListSort) {
    if (sort === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(next);
      setSortDir("asc");
    }
  }

  async function createCase() {
    setError(null);
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: form.key,
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: form.status,
        folderId: form.folderId || null,
        tags: form.tags
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Failed to create case",
      );
      return;
    }
    setShowCreate(false);
    setForm({
      key: "",
      title: "",
      description: "",
      priority: "P2",
      status: "draft",
      folderId: "",
      tags: "",
    });
    startTransition(() => router.refresh());
  }

  async function submitFolder() {
    const name = folderName.trim();
    if (!name) {
      setFolderError("Folder name is required");
      return;
    }
    setFolderError(null);
    setError(null);
    setFolderPending(true);
    try {
      if (folderModalMode === "rename") {
        if (!selectedFolder) {
          setFolderError("Select a folder to rename");
          return;
        }
        const res = await fetch(`/api/folders/${selectedFolder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message =
            typeof data.error === "string"
              ? data.error
              : "Failed to rename folder";
          setFolderError(message);
          return;
        }
        setFolderName("");
        folderModal.close();
        startTransition(() => router.refresh());
        return;
      }

      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "Failed to create folder";
        setFolderError(message);
        return;
      }
      setFolderName("");
      folderModal.close();
      if (typeof data.folder?.id === "string") {
        setFolderFilter(data.folder.id);
      }
      startTransition(() => router.refresh());
    } catch {
      setFolderError(
        folderModalMode === "rename"
          ? "Failed to rename folder"
          : "Failed to create folder",
      );
    } finally {
      setFolderPending(false);
    }
  }

  async function deleteFolder() {
    if (!selectedFolder) return;
    setError(null);
    setFolderPending(true);
    try {
      const res = await fetch(`/api/folders/${selectedFolder.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete folder",
        );
        return;
      }
      setFolderFilter("all");
      deleteModal.close();
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to delete folder");
    } finally {
      setFolderPending(false);
    }
  }

  function openCreateFolder() {
    setShowCreate(false);
    setFolderModalMode("create");
    setFolderName("");
    setFolderError(null);
    folderModal.open();
  }

  function openRenameFolder() {
    if (!selectedFolder) return;
    setShowCreate(false);
    setFolderModalMode("rename");
    setFolderName(selectedFolder.name);
    setFolderError(null);
    folderModal.open();
  }

  async function importCsv(file: File) {
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/import/csv", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Suites"
        title="Cases"
        description="Organize suites in folders, author cases, and import or export CSV."
        meta={
          <StatusChip mono>
            {initialCases.length} cases · {folders.length} folders
          </StatusChip>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5"
              onPress={() => {
                setShowCreate((v) => !v);
                folderModal.close();
              }}
            >
              <PlusIcon size={14} weight="bold" />
              New case
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onPress={openCreateFolder}
            >
              <FolderPlusIcon size={14} weight="bold" />
              New folder
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger className="button button--sm button--secondary inline-flex items-center gap-1.5">
                <FileCsvIcon size={14} weight="bold" />
                CSV
                <CaretDownIcon size={12} weight="bold" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end" className="min-w-[12.5rem]">
                <Dropdown.Menu
                  aria-label="CSV actions"
                  onAction={(key) => {
                    if (key === "template") {
                      window.open("/api/import/csv/template", "_blank");
                    } else if (key === "export") {
                      window.open("/api/import/csv", "_blank");
                    } else if (key === "import") {
                      csvFileInputRef.current?.click();
                    }
                  }}
                >
                  <Dropdown.Item
                    id="template"
                    textValue="Download template"
                    className="gap-2"
                  >
                    <FileArrowDownIcon size={14} weight="bold" />
                    Download template
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="export"
                    textValue="Export CSV"
                    className="gap-2"
                  >
                    <FileArrowDownIcon size={14} weight="bold" />
                    Export CSV
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="import"
                    textValue="Import CSV"
                    className="gap-2"
                  >
                    <FileArrowUpIcon size={14} weight="bold" />
                    Import CSV
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.Root>
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCsv(file);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <Modal.Root state={folderModal}>
        <Modal.Backdrop isDismissable={!folderPending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  {folderModalMode === "rename" ? "Rename folder" : "New folder"}
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {folderModalMode === "rename"
                    ? "Update the suite folder name."
                    : "Name a suite folder to organize cases."}
                </p>
              </Modal.Header>
              <Modal.Body className="space-y-3 px-4 py-4">
                <TextField name="folder-name" className="w-full">
                  <Label>Folder name</Label>
                  <Input
                    placeholder="e.g. Smoke"
                    value={folderName}
                    onChange={(e) => {
                      setFolderName(e.target.value);
                      if (folderError) setFolderError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitFolder();
                      }
                    }}
                    className="w-full"
                    autoFocus
                  />
                </TextField>
                {folderError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {folderError}
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2 border-t border-[color:var(--topo-line)] px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={folderPending}
                  onPress={() => folderModal.close()}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  isDisabled={folderPending || !folderName.trim()}
                  onPress={() => void submitFolder()}
                >
                  {folderPending
                    ? folderModalMode === "rename"
                      ? "Saving…"
                      : "Creating…"
                    : folderModalMode === "rename"
                      ? "Save name"
                      : "Create folder"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={deleteModal}>
        <Modal.Backdrop isDismissable={!folderPending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Delete folder
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {selectedFolder
                    ? `Delete “${selectedFolder.name}”? ${
                        selectedFolderCount === 0
                          ? "No cases are in this folder."
                          : selectedFolderCount === 1
                            ? "1 case in this folder will move to unfiled."
                            : `${selectedFolderCount} cases in this folder will move to unfiled.`
                      }`
                    : "Select a folder to delete."}
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={folderPending}
                  onPress={() => deleteModal.close()}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={folderPending || !selectedFolder}
                  onPress={() => void deleteFolder()}
                >
                  {folderPending ? "Deleting…" : "Delete folder"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <div className="flex flex-wrap items-end gap-2">
        <ComboBox
          className="min-w-[14rem] max-w-full flex-1 sm:max-w-xs"
          variant="secondary"
          selectedKey={activeFolderFilter}
          onSelectionChange={(key) => {
            if (key == null) return;
            setFolderFilter(String(key));
          }}
          aria-label="Filter by folder"
        >
          <Label className="text-xs text-[color:var(--topo-muted)]">
            Folder
          </Label>
          <ComboBox.InputGroup>
            <Input placeholder="Search folders…" />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              <ListBox.Item
                id="all"
                textValue={`All ${initialCases.length}`}
              >
                All ({initialCases.length})
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {folders.map((f) => {
                const count = folderCounts.get(f.id) ?? 0;
                return (
                  <ListBox.Item
                    key={f.id}
                    id={f.id}
                    textValue={`${f.name} ${count}`}
                  >
                    {f.name} ({count})
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {selectedFolder ? (
          <Dropdown.Root>
            <Dropdown.Trigger
              aria-label={`Manage folder ${selectedFolder.name}`}
              className="button button--sm button--secondary inline-flex items-center gap-1"
            >
              <DotsThreeVerticalIcon size={14} weight="bold" />
              Manage
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="min-w-[11rem]">
              <Dropdown.Menu
                aria-label="Folder actions"
                onAction={(key) => {
                  if (key === "rename") {
                    openRenameFolder();
                  } else if (key === "delete") {
                    deleteModal.open();
                  }
                }}
              >
                <Dropdown.Item id="rename" textValue="Rename" className="gap-2">
                  <PencilSimpleIcon size={14} weight="bold" />
                  Rename
                </Dropdown.Item>
                <Dropdown.Item id="delete" textValue="Delete" className="gap-2">
                  <TrashIcon size={14} weight="bold" />
                  Delete
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>
        ) : null}
      </div>

      <AnimatePresence>
        {showCreate ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="key" className="w-full">
                <Label>Key</Label>
                <Input
                  placeholder="TOP-12"
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  className="w-full"
                />
              </TextField>
              <TextField name="title" className="w-full">
                <Label>Title</Label>
                <Input
                  placeholder="Case title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full"
                />
              </TextField>
            </div>
            <TextField name="description" className="w-full">
              <Label>Description</Label>
              <TextArea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="w-full"
              />
            </TextField>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Priority"
                value={form.priority}
                onChange={(value) => {
                  if (value == null) return;
                  setForm((f) => ({ ...f, priority: String(value) }));
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
                        {p}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Status"
                value={form.status}
                onChange={(value) => {
                  if (value == null) return;
                  setForm((f) => ({ ...f, status: String(value) }));
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
                        {s}
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
                value={form.folderId || "none"}
                onChange={(value) => {
                  if (value == null) return;
                  const next = String(value);
                  setForm((f) => ({
                    ...f,
                    folderId: next === "none" ? "" : next,
                  }));
                }}
              >
                <Label>Folder</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="none" textValue="None">
                      None
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
            </div>
            <TextField name="tags" className="w-full">
              <Label>Tags</Label>
              <Input
                placeholder="smoke; ui"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                className="w-full"
              />
            </TextField>
            <div className="flex gap-2">
              <Button
                variant="primary"
                isDisabled={pending || !form.key || !form.title}
                onPress={() => void createCase()}
              >
                Save case
              </Button>
              <Button variant="tertiary" onPress={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="flex flex-col gap-2 border-b border-[color:var(--topo-line)] p-2.5 sm:flex-row sm:items-center sm:gap-3">
          <TextField name="case-list-search" className="min-w-0 flex-1">
            <Label className="sr-only">Search cases</Label>
            <Input
              aria-label="Search cases"
              placeholder="Search title, key, tags, or folder"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </TextField>
          {hasSearch ? (
            <p className="shrink-0 text-xs text-[color:var(--topo-muted)]">
              {pageData.total} match
              {pageData.total === 1 ? "" : "es"}
            </p>
          ) : null}
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--topo-line)] font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
            <tr>
              {sortColumns.map((col) => {
                const active = sort === col.id;
                return (
                  <th key={col.id} className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
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
            </tr>
          </thead>
          <tbody>
            {initialCases.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-[color:var(--topo-muted)]"
                >
                  No cases yet. Create one or import a CSV.
                </td>
              </tr>
            ) : pageData.items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-[color:var(--topo-muted)]"
                >
                  No cases match this search or folder.
                </td>
              </tr>
            ) : (
              pageData.items.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.02 }}
                  className="border-b border-[color:var(--topo-line)] last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-xs text-[color:var(--topo-accent)]">
                    {c.key}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[color:var(--topo-ink)]">
                      {c.title}
                    </div>
                    {c.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Chip key={t} size="sm" variant="soft">
                            {t}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-[color:var(--topo-muted)]">
                    {c.folder?.name ?? "unfiled"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip mono>{c.priority}</StatusChip>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip tone={statusToneForRun(c.status)}>
                      {c.status}
                    </StatusChip>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>

        {pageData.total > CASE_LIST_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] px-2.5 py-2">
            <p className="text-xs text-[color:var(--topo-muted)]">
              {rangeStart}–{rangeEnd} of {pageData.total}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pageData.page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pageData.page >= pageData.totalPages}
                onPress={() =>
                  setPage((p) => Math.min(pageData.totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
