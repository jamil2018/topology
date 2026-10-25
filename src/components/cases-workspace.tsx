"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Button,
  Dropdown,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { AnimatePresence } from "motion/react";
import {
  CaretDownIcon,
  FileArrowDownIcon,
  FileArrowUpIcon,
  FileCsvIcon,
  FolderPlusIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import {
  filterAndSortCases,
  paginateCases,
  type CaseListSort,
  type CaseListSortDir,
} from "@/lib/case-list";
import {
  buildFolderTree,
  flattenFolderTree,
} from "@/lib/folder-tree";
import { parseCaseViewConfig } from "@/lib/saved-views";
import { CaseCreateDialog } from "./case-create-dialog";
import { CaseEditPanel } from "./case-edit-panel";
import { CasesBulkBar } from "./cases-bulk-bar";
import {
  applyBulkPatch,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_WORKSPACE_PAGE_SIZE,
  caseFieldShortcutSelector,
  caseHref,
  formatStatusLabel,
  nextCaseKey,
  selectionRangeIds,
  type BulkPatch,
  type CaseInlinePatch,
  type CaseRow,
  type Folder,
} from "./cases-model";
import { CasesTable } from "./cases-table";
import {
  FolderTreePane,
  type FolderTreeSelection,
} from "./folder-tree-pane";
import { PageHeader } from "./page-header";
import { SavedViewsBar, type SavedViewRow } from "./saved-views-bar";
import { StatusChip } from "./status-chip";
import { useShortcut } from "./shortcut-layer";
import {
  publishPaletteFocus,
  TOPOLOGY_CASE_COMMAND,
  type CaseCommandDetail,
} from "./command-palette";

export function CasesWorkspace({
  initialCases,
  folders,
  initialViews = [],
  projectPrefix = "CASE",
  selectedCaseKey = null,
}: {
  initialCases: CaseRow[];
  folders: Folder[];
  initialViews?: SavedViewRow[];
  projectPrefix?: string;
  selectedCaseKey?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [pending, startTransition] = useTransition();
  const [folderFilter, setFolderFilter] = useState<FolderTreeSelection>(
    () => (searchParams.get("folder") as FolderTreeSelection | null) ?? "all",
  );
  const [treeCollapsed, setTreeCollapsed] = useState(true);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [folderActionId, setFolderActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sort, setSort] = useState<CaseListSort>("key");
  const [sortDir, setSortDir] = useState<CaseListSortDir>("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(
    () => searchParams.get("new") === "1",
  );
  const [createKey, setCreateKey] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkTags, setBulkTags] = useState("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [historyCase, setHistoryCase] = useState<CaseRow | null>(() => {
    if (selectedCaseKey) {
      return initialCases.find((row) => row.key === selectedCaseKey) ?? null;
    }
    const caseParam = searchParams.get("case");
    if (!caseParam) return null;
    return (
      initialCases.find((row) => row.id === caseParam || row.key === caseParam) ??
      null
    );
  });
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingCase, setPendingCase] = useState<CaseRow | null>(null);
  const [caseOverrides, setCaseOverrides] = useState<Record<string, CaseRow>>(
    {},
  );
  const [removedCaseIds, setRemovedCaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const displayCases = useMemo(() => {
    const known = new Set(initialCases.map((row) => row.id));
    const merged = initialCases.map((row) => {
      const over = caseOverrides[row.id];
      return over ? { ...row, ...over } : row;
    });
    const extras = Object.values(caseOverrides).filter((row) => !known.has(row.id));
    const combined = extras.length > 0 ? [...extras, ...merged] : merged;
    return combined.filter((row) => !removedCaseIds.has(row.id));
  }, [initialCases, caseOverrides, removedCaseIds]);
  const [optimisticCases, addOptimisticCases] = useOptimistic(
    displayCases,
    (current, patch: BulkPatch & { ids: string[] }) =>
      applyBulkPatch(current, patch.ids, patch, folders),
  );
  const [appliedParams, setAppliedParams] = useState(paramsKey);
  if (appliedParams !== paramsKey) {
    setAppliedParams(paramsKey);
    if (searchParams.get("new") === "1") setShowCreate(true);
    const folderParam = searchParams.get("folder");
    if (folderParam) setFolderFilter(folderParam);
    const caseParam = searchParams.get("case");
    if (caseParam) {
      const found = initialCases.find(
        (row) => row.id === caseParam || row.key === caseParam,
      );
      if (found) setHistoryCase(found);
    }
  }
  const [folderModalMode, setFolderModalMode] = useState<"create" | "rename">(
    "create",
  );
  const folderModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setFolderName("");
        setFolderError(null);
        setFolderModalMode("create");
        setCreateParentId(null);
        setFolderActionId(null);
      }
    },
  });
  const deleteModal = useOverlayState();
  const caseDeleteModal = useOverlayState();
  const unsavedModal = useOverlayState();
  const [caseToDelete, setCaseToDelete] = useState<CaseRow | null>(null);
  const [caseDeletePending, setCaseDeletePending] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderPending, setFolderPending] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of optimisticCases) {
      if (!row.folder?.id) continue;
      counts.set(row.folder.id, (counts.get(row.folder.id) ?? 0) + 1);
    }
    return counts;
  }, [optimisticCases]);

  const unfiledCount = useMemo(
    () => optimisticCases.filter((row) => !row.folder).length,
    [optimisticCases],
  );

  const flatFolders = useMemo(
    () => flattenFolderTree(buildFolderTree(folders)),
    [folders],
  );

  const selectedFolder =
    folderFilter === "all" || folderFilter === "unfiled"
      ? null
      : (folders.find((folder) => folder.id === folderFilter) ?? null);

  const actionFolder =
    (folderActionId
      ? folders.find((folder) => folder.id === folderActionId)
      : null) ?? selectedFolder;

  const activeFolderFilter: FolderTreeSelection =
    folderFilter === "unfiled"
      ? "unfiled"
      : selectedFolder
        ? selectedFolder.id
        : "all";

  const selectedFolderCount = actionFolder
    ? (folderCounts.get(actionFolder.id) ?? 0)
    : 0;

  const childFolderCount = actionFolder
    ? folders.filter((folder) => folder.parentId === actionFolder.id).length
    : 0;

  const filteredSorted = useMemo(
    () =>
      filterAndSortCases(
        optimisticCases,
        activeFolderFilter,
        search,
        sort,
        sortDir,
        statusFilter,
        priorityFilter,
      ),
    [
      optimisticCases,
      activeFolderFilter,
      search,
      sort,
      sortDir,
      statusFilter,
      priorityFilter,
    ],
  );

  const pageData = useMemo(
    () => paginateCases(filteredSorted, page, CASE_WORKSPACE_PAGE_SIZE),
    [filteredSorted, page],
  );

  const hasSearch = search.trim().length > 0;
  const pageIds = pageData.items.map((row) => row.id);
  const [cursor, setCursor] = useState(0);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const cursorIndex =
    pageData.items.length === 0
      ? 0
      : Math.min(cursor, pageData.items.length - 1);
  const focusedRow = pageData.items[cursorIndex] ?? null;

  const generatedKey = useMemo(
    () => nextCaseKey(projectPrefix, displayCases.map((row) => row.key)),
    [projectPrefix, displayCases],
  );

  const openCreate = useCallback(() => {
    setCreateKey(generatedKey);
    setShowCreate(true);
    folderModal.close();
  }, [folderModal, generatedKey]);

  const openFocused = useCallback(() => {
    if (focusedRow) requestOpen(focusedRow);
  }, [editorDirty, focusedRow, historyCase]);

  function openFocusedField(field: "status" | "priority") {
    if (!focusedRow) return;
    const node = document.querySelector<HTMLElement>(
      caseFieldShortcutSelector(focusedRow.id, field),
    );
    node?.click();
  }

  function extendSelection(delta: number) {
    const items = pageData.items;
    if (items.length === 0) return;
    const from = selectionAnchor ?? cursorIndex;
    const next = Math.min(items.length - 1, Math.max(0, cursorIndex + delta));
    if (selectionAnchor == null) setSelectionAnchor(cursorIndex);
    const ids = selectionRangeIds(
      items.map((row) => row.id),
      from,
      next,
    );
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      for (const id of ids) copy.add(id);
      return copy;
    });
    setCursor(next);
  }

  useShortcut("create", openCreate);
  useShortcut(
    "nav-next",
    useCallback(() => {
      setCursor((index) => Math.min(pageData.items.length - 1, index + 1));
    }, [pageData.items.length]),
  );
  useShortcut(
    "nav-prev",
    useCallback(() => {
      setCursor((index) => Math.max(0, index - 1));
    }, []),
  );
  useShortcut("open", openFocused);
  useShortcut("edit", openFocused);
  useShortcut(
    "select",
    useCallback(() => {
      if (!focusedRow) return;
      setSelectionAnchor(cursorIndex);
      toggleSelect(focusedRow.id);
    }, [cursorIndex, focusedRow]),
  );
  useShortcut(
    "nav-next-extend",
    useCallback(() => extendSelection(1), [cursorIndex, pageData.items, selectionAnchor]),
  );
  useShortcut(
    "nav-prev-extend",
    useCallback(() => extendSelection(-1), [cursorIndex, pageData.items, selectionAnchor]),
  );
  useShortcut(
    "status",
    useCallback(() => openFocusedField("status"), [focusedRow]),
  );
  useShortcut(
    "priority",
    useCallback(() => openFocusedField("priority"), [focusedRow]),
  );
  useShortcut(
    "escape",
    useCallback(() => {
      if (
        folderModal.isOpen ||
        deleteModal.isOpen ||
        caseDeleteModal.isOpen ||
        unsavedModal.isOpen
      ) {
        return;
      }
      if (document.querySelector('[aria-expanded="true"]')) return;
      if (showCreate) {
        setShowCreate(false);
        return;
      }
      if (historyCase) requestClosePeek();
    }, [
      caseDeleteModal.isOpen,
      deleteModal.isOpen,
      editorDirty,
      folderModal.isOpen,
      historyCase,
      showCreate,
      unsavedModal.isOpen,
    ]),
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const listFilterKey = `${folderFilter}|${search}|${sort}|${sortDir}|${statusFilter}|${priorityFilter}`;
  const [pageFilterKey, setPageFilterKey] = useState(listFilterKey);
  if (pageFilterKey !== listFilterKey) {
    setPageFilterKey(listFilterKey);
    if (page !== 1) setPage(1);
  } else if (page !== pageData.page) {
    setPage(pageData.page);
  }

  const rangeStart =
    pageData.total === 0
      ? 0
      : (pageData.page - 1) * CASE_WORKSPACE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    pageData.page * CASE_WORKSPACE_PAGE_SIZE,
    pageData.total,
  );

  function toggleSort(next: CaseListSort) {
    setActiveViewId(null);
    if (sort === next) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSort(next);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function applySavedView(view: SavedViewRow) {
    const config = parseCaseViewConfig(JSON.stringify(view.config));
    setFolderFilter(config.folderFilter as FolderTreeSelection);
    setSearch(config.search);
    setStatusFilter(config.statusFilter);
    setPriorityFilter(config.priorityFilter);
    setSort(config.sort);
    setSortDir(config.sortDir);
    setActiveViewId(view.id);
  }

  function mergeCase(row: CaseRow) {
    setCaseOverrides((prev) => ({ ...prev, [row.id]: row }));
  }

  function commitOpen(row: CaseRow | null) {
    setHistoryCase(row);
    setEditorDirty(false);
    setPendingCase(null);
    if (row) {
      startTransition(() => router.push(caseHref(row.key)));
    } else {
      startTransition(() => router.push("/cases"));
    }
  }

  function requestOpen(row: CaseRow) {
    if (historyCase && editorDirty && historyCase.id !== row.id) {
      setPendingCase(row);
      unsavedModal.open();
      return;
    }
    commitOpen(row);
  }

  function requestClosePeek() {
    if (historyCase && editorDirty) {
      setPendingCase(null);
      unsavedModal.open();
      return;
    }
    commitOpen(null);
  }

  async function bulkUpdate(patch: BulkPatch) {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    setError(null);
    const resPromise = fetch("/api/cases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseIds: ids,
        ...patch,
      }),
    });
    startTransition(async () => {
      addOptimisticCases({ ...patch, ids });
      const res = await resPromise;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Bulk update failed",
        );
        setBulkPending(false);
        return;
      }
      setCaseOverrides((prev) => {
        const source = [...displayCases, ...Object.values(prev)];
        const applied = applyBulkPatch(source, ids, patch, folders);
        const next = { ...prev };
        for (const row of applied) {
          if (ids.includes(row.id)) next[row.id] = row;
        }
        return next;
      });
      setSelectedIds(new Set());
      setBulkTags("");
      setBulkPending(false);
    });
  }

  async function inlinePatch(id: string, patch: CaseInlinePatch) {
    setError(null);
    const ids = [id];
    startTransition(() => {
      addOptimisticCases({ ...patch, ids });
    });
    setCaseOverrides((prev) => {
      const source = displayCases;
      const applied = applyBulkPatch(source, ids, patch, folders);
      const next = { ...prev };
      const row = applied.find((item) => item.id === id);
      if (row) next[id] = row;
      return next;
    });
    const res = await fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to update case",
      );
      startTransition(() => router.refresh());
    }
  }

  useEffect(() => {
    if (!focusedRow) {
      publishPaletteFocus({ kind: "none" });
      return;
    }
    publishPaletteFocus({
      kind: "case",
      id: focusedRow.id,
      key: focusedRow.key,
      title: focusedRow.title,
      status: focusedRow.status,
      priority: focusedRow.priority,
      selectedIds: Array.from(selectedIds),
    });
    return () => publishPaletteFocus({ kind: "none" });
  }, [focusedRow, selectedIds]);

  useEffect(() => {
    function onCommand(event: Event) {
      const detail = (event as CustomEvent<CaseCommandDetail>).detail;
      if (!detail?.id) return;
      if (detail.type === "status") {
        void inlinePatch(detail.id, { status: detail.value });
      } else if (detail.type === "priority") {
        void inlinePatch(detail.id, { priority: detail.value });
      }
    }
    window.addEventListener(TOPOLOGY_CASE_COMMAND, onCommand);
    return () => window.removeEventListener(TOPOLOGY_CASE_COMMAND, onCommand);
  });

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
        if (!actionFolder) {
          setFolderError("Select a folder to rename");
          return;
        }
        const res = await fetch(`/api/folders/${actionFolder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFolderError(
            typeof data.error === "string"
              ? data.error
              : "Failed to rename folder",
          );
          return;
        }
        setFolderName("");
        setFolderActionId(null);
        folderModal.close();
        startTransition(() => router.refresh());
        return;
      }

      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: createParentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFolderError(
          typeof data.error === "string"
            ? data.error
            : "Failed to create folder",
        );
        return;
      }
      setFolderName("");
      setCreateParentId(null);
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
    if (!actionFolder) return;
    setError(null);
    setFolderPending(true);
    try {
      const res = await fetch(`/api/folders/${actionFolder.id}`, {
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
      if (folderFilter === actionFolder.id) setFolderFilter("all");
      setFolderActionId(null);
      deleteModal.close();
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to delete folder");
    } finally {
      setFolderPending(false);
    }
  }

  function openCreateFolder(parentId: string | null = null) {
    setShowCreate(false);
    setFolderModalMode("create");
    setCreateParentId(parentId);
    setFolderActionId(null);
    setFolderName("");
    setFolderError(null);
    folderModal.open();
  }

  function openRenameFolder(folderId?: string) {
    const target =
      (folderId ? folders.find((folder) => folder.id === folderId) : null) ??
      selectedFolder;
    if (!target) return;
    setShowCreate(false);
    setFolderModalMode("rename");
    setFolderActionId(target.id);
    setCreateParentId(null);
    setFolderName(target.name);
    setFolderError(null);
    folderModal.open();
  }

  function openDeleteFolder(folderId?: string) {
    const target =
      (folderId ? folders.find((folder) => folder.id === folderId) : null) ??
      selectedFolder;
    if (!target) return;
    setFolderActionId(target.id);
    deleteModal.open();
  }

  function openDeleteCase(row: CaseRow) {
    setError(null);
    setCaseToDelete(row);
    caseDeleteModal.open();
  }

  async function deleteCase() {
    if (!caseToDelete) return;
    const target = caseToDelete;
    setError(null);
    setCaseDeletePending(true);
    try {
      const res = await fetch(`/api/cases/${target.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete case",
        );
        return;
      }
      setRemovedCaseIds((prev) => new Set(prev).add(target.id));
      setSelectedIds((prev) => {
        if (!prev.has(target.id)) return prev;
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setCaseOverrides((prev) => {
        if (!(target.id in prev)) return prev;
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      if (historyCase?.id === target.id) commitOpen(null);
      setCaseToDelete(null);
      caseDeleteModal.close();
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to delete case");
    } finally {
      setCaseDeletePending(false);
    }
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
        title="Test Cases"
        description="Organize suites in folders, author cases, and import from CSV or other TCM tools."
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
              onPress={openCreate}
            >
              <PlusIcon size={14} weight="bold" />
              New case
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onPress={() => openCreateFolder(null)}
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
                    } else if (key === "vendors") {
                      router.push("/cases/import");
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
                  <Dropdown.Item
                    id="vendors"
                    textValue="Import from TestRail, Qase, Zephyr, Xray"
                    className="gap-2"
                  >
                    <FileArrowUpIcon size={14} weight="bold" />
                    Import TestRail / Qase / Zephyr / Xray
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
                  {folderModalMode === "rename"
                    ? "Rename folder"
                    : createParentId
                      ? "New subfolder"
                      : "New folder"}
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {folderModalMode === "rename"
                    ? "Update the suite folder name."
                    : createParentId
                      ? `Create inside “${
                          folders.find((folder) => folder.id === createParentId)
                            ?.name ?? "folder"
                        }”.`
                      : "Name a suite folder to organize cases. Nest subfolders from the tree."}
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
                      : createParentId
                        ? "Create subfolder"
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
                  {actionFolder
                    ? `Delete “${actionFolder.name}”? ${
                        selectedFolderCount === 0
                          ? "No cases are in this folder."
                          : selectedFolderCount === 1
                            ? "1 case in this folder will move to unfiled."
                            : `${selectedFolderCount} cases in this folder will move to unfiled.`
                      }${
                        childFolderCount > 0
                          ? ` ${childFolderCount} subfolder${
                              childFolderCount === 1 ? "" : "s"
                            } will move to the root.`
                          : ""
                      }`
                    : "Select a folder to delete."}
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={folderPending}
                  onPress={() => {
                    setFolderActionId(null);
                    deleteModal.close();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={folderPending || !actionFolder}
                  onPress={() => void deleteFolder()}
                >
                  {folderPending ? "Deleting…" : "Delete folder"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={caseDeleteModal}>
        <Modal.Backdrop isDismissable={!caseDeletePending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Delete case
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {caseToDelete
                    ? `Delete “${caseToDelete.key}”? This cannot be undone. Activity and run results for this case are also removed.`
                    : "Select a case to delete."}
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={caseDeletePending}
                  onPress={() => {
                    setCaseToDelete(null);
                    caseDeleteModal.close();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={caseDeletePending || !caseToDelete}
                  onPress={() => void deleteCase()}
                >
                  {caseDeletePending ? "Deleting…" : "Delete case"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={unsavedModal}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Discard unsaved changes?
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  This case has edits that have not been saved.
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  onPress={() => {
                    setPendingCase(null);
                    unsavedModal.close();
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    unsavedModal.close();
                    commitOpen(pendingCase);
                  }}
                >
                  Discard
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            className="w-[8.5rem]"
            variant="secondary"
            value={statusFilter}
            onChange={(value) => {
              if (value == null) return;
              setActiveViewId(null);
              setStatusFilter(String(value));
            }}
          >
            <Label className="text-xs text-[color:var(--topo-muted)]">
              Status
            </Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All">
                  All
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {CASE_STATUSES.map((status) => (
                  <ListBox.Item
                    key={status}
                    id={status}
                    textValue={formatStatusLabel(status)}
                  >
                    {formatStatusLabel(status)}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            className="w-[8rem]"
            variant="secondary"
            value={priorityFilter}
            onChange={(value) => {
              if (value == null) return;
              setActiveViewId(null);
              setPriorityFilter(String(value));
            }}
          >
            <Label className="text-xs text-[color:var(--topo-muted)]">
              Priority
            </Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All">
                  All
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {CASE_PRIORITIES.map((priority) => (
                  <ListBox.Item key={priority} id={priority} textValue={priority}>
                    {priority}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <SavedViewsBar
          className="min-w-0 sm:justify-end"
          entity="cases"
          initialViews={initialViews}
          activeViewId={activeViewId}
          canSave
          buildConfig={() => ({
            folderFilter: activeFolderFilter,
            search,
            statusFilter,
            priorityFilter,
            sort,
            sortDir,
          })}
          onApply={applySavedView}
          onSaved={(view) => setActiveViewId(view.id)}
        />
      </div>

      <AnimatePresence>
        {someSelected ? (
          <CasesBulkBar
            selectedCount={selectedIds.size}
            bulkPending={bulkPending}
            bulkTags={bulkTags}
            folders={folders}
            flatFolders={flatFolders}
            onBulkTags={setBulkTags}
            onBulkUpdate={(patch) => void bulkUpdate(patch)}
            onClear={() => setSelectedIds(new Set())}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCreate ? (
          <CaseCreateDialog
            folders={folders}
            flatFolders={flatFolders}
            initialKey={createKey || generatedKey}
            initialFolderId={selectedFolder?.id ?? ""}
            pending={pending}
            onError={(message) => setError(message || null)}
            onCancel={() => setShowCreate(false)}
            onCreated={(row) => {
              mergeCase(row);
              setShowCreate(false);
              commitOpen(row);
              startTransition(() => router.refresh());
            }}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={`grid gap-3 ${
          historyCase
            ? "lg:grid-cols-[15rem_minmax(0,1fr)_minmax(20rem,26rem)]"
            : "lg:grid-cols-[15rem_minmax(0,1fr)]"
        }`}
      >
        <div className="lg:sticky lg:top-3 lg:self-start">
          <FolderTreePane
            folders={folders}
            folderCounts={folderCounts}
            unfiledCount={unfiledCount}
            totalCount={optimisticCases.length}
            selected={activeFolderFilter}
            collapsed={treeCollapsed}
            onToggleCollapsed={() => setTreeCollapsed((value) => !value)}
            onSelect={(id) => {
              setActiveViewId(null);
              setFolderFilter(id);
              setTreeCollapsed(true);
            }}
            onCreateRoot={() => openCreateFolder(null)}
            onCreateSubfolder={(parentId) => openCreateFolder(parentId)}
            onRename={(folderId) => openRenameFolder(folderId)}
            onDelete={(folderId) => openDeleteFolder(folderId)}
          />
        </div>
        <CasesTable
          cases={pageData.items}
          totalCases={optimisticCases.length}
          folders={folders}
          flatFolders={flatFolders}
          search={search}
          hasSearch={hasSearch}
          matchCount={pageData.total}
          sort={sort}
          sortDir={sortDir}
          selectedIds={selectedIds}
          allPageSelected={allPageSelected}
          activeId={historyCase?.id ?? null}
          cursorIndex={cursorIndex}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={pageData.total}
          page={pageData.page}
          totalPages={pageData.totalPages}
          showPagination={pageData.total > CASE_WORKSPACE_PAGE_SIZE}
          onSearch={(value) => {
            setActiveViewId(null);
            setSearch(value);
          }}
          onToggleSort={toggleSort}
          onToggleSelect={toggleSelect}
          onToggleSelectPage={toggleSelectPage}
          onOpen={requestOpen}
          onDelete={openDeleteCase}
          onInlinePatch={(id, patch) => void inlinePatch(id, patch)}
          onPageChange={setPage}
        />

        {historyCase ? (
          <CaseEditPanel
            key={historyCase.id}
            caseId={historyCase.id}
            caseKey={historyCase.key}
            caseTitle={historyCase.title}
            folders={folders}
            flatFolders={flatFolders}
            onClose={requestClosePeek}
            onDirtyChange={setEditorDirty}
            onSaved={(next) => {
              mergeCase({
                id: next.id,
                key: next.key,
                title: next.title,
                priority: next.priority,
                status: next.status,
                tags: next.tags,
                folder: next.folder,
              });
              setHistoryCase((prev) =>
                prev && prev.id === next.id ? { ...prev, ...next } : prev,
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
