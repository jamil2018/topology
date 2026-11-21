"use client";
import { CaseBrowserPanel } from "./case-browser-panel";
import { ResponsiveInspector } from "./responsive-inspector";
import { useListPage, useQueryState } from "./use-list-page";
import type { PaginatedList } from "@/lib/list-pagination";
import { useProjectActions } from "./project-actions";

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
  initialPage,
  suggestedKey,
  selectedCase = null,
  counts,
  folders,
  initialViews = [],
  projectPrefix = "CASE",
  selectedCaseKey = null,
}: {
  initialCases: CaseRow[];
  initialPage?: PaginatedList<CaseRow>;
  suggestedKey?: string;
  selectedCase?: CaseRow | null;
  counts?: { folderId: string | null; total: number }[];
  folders: Folder[];
  initialViews?: SavedViewRow[];
  projectPrefix?: string;
  selectedCaseKey?: string | null;
}) {
  const { can } = useProjectActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [pending, startTransition] = useTransition();
  const [folderFilter, setFolderFilter] = useQueryState<FolderTreeSelection>("folder", "all", (value) => value);
  const [treeCollapsed, setTreeCollapsed] = useState(true);
  const [browserPanel, setBrowserPanel] = useState<"folders" | "cases" | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [folderActionId, setFolderActionId] = useState<string | null>(null);
  const [search, setSearch] = useQueryState("q", "", String);
  const [statusFilter, setStatusFilter] = useQueryState("status", "all", String);
  const [priorityFilter, setPriorityFilter] = useQueryState("priority", "all", String);
  const [sort, setSort] = useQueryState<CaseListSort>("sort", "key", (value) => ["key", "title", "folder", "priority", "status"].includes(value) ? value as CaseListSort : "key");
  const [sortDir, setSortDir] = useQueryState<CaseListSortDir>("dir", "asc", (value) => value === "desc" ? "desc" : "asc");
  const [page, setPage] = useQueryState("page", 1, (value) => Math.max(1, Number(value) || 1), false);
  const [caseFieldDefs, setCaseFieldDefs] = useState<
    Array<{
      key: string;
      label: string;
      type: string;
      options?: string[];
    }>
  >([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<
    Record<string, string>
  >(() => {
    const next: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!value || value === "all") continue;
      if (key.startsWith("cf.")) next[key.slice(3)] = value;
      else if (key.startsWith("cf_")) next[key.slice(3)] = value;
    }
    return next;
  });
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
    if (selectedCase) return selectedCase;
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
  const lastOpenKey = useRef<string | null>(null);
  useEffect(() => {
    if (historyCase) { lastOpenKey.current = historyCase.key; return; }
    const key = lastOpenKey.current;
    if (!key) return;
    lastOpenKey.current = null;
    const frame = requestAnimationFrame(() => {
      const opener = [...document.querySelectorAll<HTMLButtonElement>('[data-case-key]')]
        .find(button => button.dataset.caseKey === key && button.getClientRects().length > 0);
      (opener ?? document.querySelector<HTMLInputElement>('[aria-label="Search cases"]'))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [historyCase]);
  const [inspectorContainer, setInspectorContainer] = useState<HTMLDialogElement | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingCase, setPendingCase] = useState<CaseRow | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve(
      fetch("/api/custom-fields?entity=case", { signal: controller.signal }),
    )
      .then(async (res) => {
        if (!res || !res.ok) return;
        const data = await res.json().catch(() => ({}));
        const fields = (data.fields ?? []) as Array<{
          key: string;
          label: string;
          type: string;
          options?: string[];
        }>;
        setCaseFieldDefs(
          fields.filter(
            (f) => f.type === "select" || f.type === "boolean" || f.type === "text",
          ),
        );
      })
      .catch(() => {
        /* ignore abort / load errors */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};
    const params = new URLSearchParams(paramsKey);
    for (const [key, value] of params.entries()) {
      if (!value || value === "all") continue;
      if (key.startsWith("cf.")) next[key.slice(3)] = value;
      else if (key.startsWith("cf_")) next[key.slice(3)] = value;
    }
    setCustomFieldFilters(next);
  }, [paramsKey]);

  function setCustomFieldFilter(key: string, value: string) {
    setActiveViewId(null);
    setCustomFieldFilters((prev) => {
      const next = { ...prev };
      if (!value || value === "all") delete next[key];
      else next[key] = value;
      return next;
    });
    const url = new URL(window.location.href);
    const param = `cf.${key}`;
    if (!value || value === "all") url.searchParams.delete(param);
    else url.searchParams.set(param, value);
    url.searchParams.delete("page");
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  }

  const queryParams = new URLSearchParams({
    folder: folderFilter,
    q: search,
    status: statusFilter,
    priority: priorityFilter,
    sort,
    dir: sortDir,
    page: String(page),
    limit: "50",
  });
  for (const [key, value] of Object.entries(customFieldFilters)) {
    if (value && value !== "all") queryParams.set(`cf.${key}`, value);
  }
  const query = queryParams.toString();
  const remote = useListPage<CaseRow>("/api/cases", query, initialPage, "cases");
  const listedCases = remote.data?.items ?? initialCases;
  const [caseOverrides, setCaseOverrides] = useState<Record<string, CaseRow>>(
    {},
  );
  const [removedCaseIds, setRemovedCaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lastListed, setLastListed] = useState(listedCases);
  if (lastListed !== listedCases) { setLastListed(listedCases); setCaseOverrides({}); }
  const displayCases = useMemo(() => {
    const known = new Set(listedCases.map((row) => row.id));
    const merged = listedCases.map((row) => {
      const over = caseOverrides[row.id];
      return over ? { ...row, ...over } : row;
    });
    const extras = Object.values(caseOverrides).filter((row) => !known.has(row.id));
    const combined = !initialPage && extras.length > 0 ? [...extras, ...merged] : merged;
    return combined.filter((row) => !removedCaseIds.has(row.id));
  }, [initialPage, listedCases, caseOverrides, removedCaseIds]);
  const [optimisticCases, addOptimisticCases] = useOptimistic(
    displayCases,
    (current, patch: BulkPatch & { ids: string[] }) =>
      applyBulkPatch(current, patch.ids, patch, folders),
  );
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
  const [visitedCases, setVisitedCases] = useState(new Map<string, CaseRow>());
  const [appliedParams, setAppliedParams] = useState(paramsKey);
  if (appliedParams !== paramsKey) {
    const previousCase = new URLSearchParams(appliedParams).get("case");
    setAppliedParams(paramsKey);
    if (searchParams.get("new") === "1") setShowCreate(true);
    const caseParam = searchParams.get("case");
    const candidates = [...(selectedCase ? [selectedCase] : []), ...listedCases, ...visitedCases.values()];
    const target = caseParam ? candidates.find((row) => row.id === caseParam || row.key === caseParam) : null;
    if (caseParam !== previousCase && (target || !caseParam)) {
      if (editorDirty && historyCase?.id !== target?.id) {
        setPendingCase(target ?? null);
        unsavedModal.open();
      } else setHistoryCase(target ?? null);
    }
  }
  function keepEditing() {
    setPendingCase(null);
    unsavedModal.close();
    const query = new URLSearchParams(window.location.search);
    if (historyCase) query.set("case", historyCase.key); else query.delete("case");
    window.history.replaceState(null, "", `/cases${query.size ? `?${query}` : ""}`);
  }
  const [caseToDelete, setCaseToDelete] = useState<CaseRow | null>(null);
  const [caseDeletePending, setCaseDeletePending] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderPending, setFolderPending] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const folderCounts = useMemo(() => {
    if (counts) return new Map(counts.filter((item) => item.folderId).map((item) => [item.folderId!, item.total]));
    const result = new Map<string, number>();
    for (const row of optimisticCases) {
      if (!row.folder?.id) continue;
      result.set(row.folder.id, (result.get(row.folder.id) ?? 0) + 1);
    }
    return result;
  }, [optimisticCases, counts]);

  const unfiledCount = useMemo(
    () => counts?.find((row) => row.folderId === null)?.total ?? optimisticCases.filter((row) => !row.folder).length,
    [optimisticCases, counts],
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

  const localPage = useMemo(
    () => paginateCases(filteredSorted, page, CASE_WORKSPACE_PAGE_SIZE),
    [filteredSorted, page],
  );

  const pageData = remote.data ? { ...remote.data, items: optimisticCases } : localPage;
  const totalCases = counts ? counts.reduce((sum, item) => sum + item.total, 0) : initialCases.length;
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
    () => suggestedKey ?? nextCaseKey(projectPrefix, displayCases.map((row) => row.key)),
    [suggestedKey, projectPrefix, displayCases],
  );

  const openCreate = useCallback(() => {
    if (!can("cases.create")) return;
    setCreateKey(generatedKey);
    setShowCreate(true);
    folderModal.close();
  }, [can, folderModal, generatedKey]);

  const openFocused = useCallback(() => {
    if (focusedRow) requestOpen(focusedRow);
  }, [editorDirty, focusedRow, historyCase]);

  function openFocusedField(field: "status" | "priority") {
    if (!focusedRow) return;
    const node = document.querySelector<HTMLElement>(
      caseFieldShortcutSelector(focusedRow.id, field),
    );
    if (!can("cases.edit")) return;
    node?.focus();
    if (node instanceof HTMLSelectElement) {
      try { node.showPicker?.(); } catch { /* Keyboard arrows remain available. */ }
    } else node?.click();
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
    setBrowserPanel(null);
    if (row) setVisitedCases((previous) => new Map(previous).set(row.key, row));
    setHistoryCase(row);
    setEditorDirty(false);
    setPendingCase(null);
    const query = new URLSearchParams(window.location.search);
    if (row) query.set("case", row.key); else query.delete("case");
    // Keep the workspace mounted: route navigation can discard an edit begun
    // while the server response for the inspector is still in flight.
    window.history.pushState(null, "", `/cases${query.size ? `?${query}` : ""}`);
  }

  function requestOpen(row: CaseRow) {
    setBrowserPanel(null);
    if (historyCase?.id === row.id) {
      inspectorContainer?.querySelector<HTMLButtonElement>('[aria-label="Close case editor"]')?.focus({ preventScroll: true });
      return;
    }
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

  const mutationLocks = useRef(new Set<string>());
  async function bulkUpdate(patch: BulkPatch) {
    if (!can("cases.edit") || selectedIds.size === 0 || mutationLocks.current.size) return;
    const ids = Array.from(selectedIds);
    mutationLocks.current.add("bulk");
    setBulkPending(true);
    setError(null);
    startTransition(async () => {
      addOptimisticCases({ ...patch, ids });
      try {
        const response = await fetch("/api/cases", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseIds: ids, ...patch }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Bulk update failed");
        setCaseOverrides((previous) => {
          const next = { ...previous };
          for (const row of applyBulkPatch(displayCases, ids, patch, folders)) {
            if (ids.includes(row.id)) next[row.id] = row;
          }
          return next;
        });
        setSelectedIds(new Set());
        setBulkTags("");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save changes. Try again.");
      } finally {
        mutationLocks.current.delete("bulk");
        setBulkPending(false);
      }
    });
  }

  async function inlinePatch(id: string, patch: CaseInlinePatch) {
    if (!can("cases.edit") || mutationLocks.current.has(id) || mutationLocks.current.has("bulk")) return;
    mutationLocks.current.add(id);
    setError(null);
    startTransition(async () => {
      addOptimisticCases({ ...patch, ids: [id] });
      try {
        const response = await fetch(`/api/cases/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to update case");
        const row = applyBulkPatch(displayCases, [id], patch, folders).find((item) => item.id === id);
        if (row) setCaseOverrides((previous) => ({ ...previous, [id]: row }));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save changes. Try again.");
      } finally {
        mutationLocks.current.delete(id);
      }
    });
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
      } else if (detail.type === "duplicate") {
        const row =
          displayCases.find((item) => item.id === detail.id) ??
          (historyCase?.id === detail.id ? historyCase : null);
        if (row) void duplicateCase(row);
      }
    }
    window.addEventListener(TOPOLOGY_CASE_COMMAND, onCommand);
    return () => window.removeEventListener(TOPOLOGY_CASE_COMMAND, onCommand);
  });

  async function submitFolder() {
    if (!can("folders.manage")) return;
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
    if (!can("folders.manage")) return;
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
    if (!can("folders.manage")) return;
    setShowCreate(false);
    setFolderModalMode("create");
    setCreateParentId(parentId);
    setFolderActionId(null);
    setFolderName("");
    setFolderError(null);
    folderModal.open();
  }

  function openRenameFolder(folderId?: string) {
    if (!can("folders.manage")) return;
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
    if (!can("folders.manage")) return;
    const target =
      (folderId ? folders.find((folder) => folder.id === folderId) : null) ??
      selectedFolder;
    if (!target) return;
    setFolderActionId(target.id);
    deleteModal.open();
  }

  function openDeleteCase(row: CaseRow) {
    if (!can("cases.delete")) return;
    setError(null);
    setCaseToDelete(row);
    caseDeleteModal.open();
  }

  async function duplicateCase(row: CaseRow) {
    if (!can("cases.create") || mutationLocks.current.has(`clone:${row.id}`)) {
      return;
    }
    if (historyCase?.id === row.id && editorDirty) {
      const proceed = window.confirm(
        "This case has unsaved changes. Duplicate the saved version anyway?",
      );
      if (!proceed) return;
    }
    mutationLocks.current.add(`clone:${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${row.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to duplicate case",
        );
        return;
      }
      const cloned = data.case as CaseRow;
      mergeCase(cloned);
      commitOpen(cloned);
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to duplicate case");
    } finally {
      mutationLocks.current.delete(`clone:${row.id}`);
    }
  }

  async function dropCasesOnFolder(folderId: string | null, caseIds: string[]) {
    if (!can("cases.edit") || caseIds.length === 0) return;
    if (caseIds.length === 1) {
      await inlinePatch(caseIds[0]!, { folderId });
      return;
    }
    const ids = caseIds;
    if (mutationLocks.current.size) return;
    mutationLocks.current.add("bulk");
    setBulkPending(true);
    setError(null);
    startTransition(async () => {
      addOptimisticCases({ folderId, ids });
      try {
        const response = await fetch("/api/cases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseIds: ids, folderId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Bulk update failed",
          );
        }
        setCaseOverrides((previous) => {
          const next = { ...previous };
          for (const row of applyBulkPatch(
            displayCases,
            ids,
            { folderId },
            folders,
          )) {
            if (ids.includes(row.id)) next[row.id] = row;
          }
          return next;
        });
        setSelectedIds(new Set());
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not move cases. Try again.",
        );
      } finally {
        mutationLocks.current.delete("bulk");
        setBulkPending(false);
      }
    });
  }

  async function deleteCase() {
    if (!can("cases.delete")) return;
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
    if (!can("cases.create") || mutationLocks.current.has("import")) return;
    mutationLocks.current.add("import");
    try {
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
    } catch { setError("Could not confirm the import. Check the case list before retrying."); }
    finally { mutationLocks.current.delete("import"); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow=""
        title="Test cases"
        description="Write test cases and organize them into folders."
        meta={
          <StatusChip mono>
            {totalCases} cases · {folders.length} folders
          </StatusChip>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5"
              isDisabled={!can("cases.create")}
              onPress={openCreate}
            >
              <PlusIcon size={14} weight="bold" />
              New case
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              isDisabled={!can("folders.manage")}
              onPress={() => openCreateFolder(null)}
            >
              <FolderPlusIcon size={14} weight="bold" />
              New folder
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger className="button button--sm button--secondary inline-flex items-center gap-1.5">
                <FileCsvIcon size={14} weight="bold" />
                Import / export
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
                    id="import" isDisabled={!can("cases.create")}
                    textValue="Import CSV"
                    className="gap-2"
                  >
                    <FileArrowUpIcon size={14} weight="bold" />
                    Import CSV
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="vendors" isDisabled={!can("cases.create")}
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

      <Modal.Backdrop isOpen={folderModal.isOpen} onOpenChange={folderModal.setOpen} isDismissable={!folderPending}>
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


      <Modal.Backdrop isOpen={deleteModal.isOpen} onOpenChange={deleteModal.setOpen} isDismissable={!folderPending}>
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


      <Modal.Backdrop isOpen={caseDeleteModal.isOpen} onOpenChange={caseDeleteModal.setOpen} isDismissable={!caseDeletePending}>
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

          {caseFieldDefs.map((field) => {
            const options =
              field.type === "boolean"
                ? ["true", "false"]
                : field.type === "select"
                  ? (field.options ?? [])
                  : [];
            if (field.type === "text") {
              return (
                <label
                  key={field.key}
                  className="flex w-[9rem] flex-col gap-1 text-xs text-[color:var(--topo-muted)]"
                >
                  {field.label}
                  <Input
                    aria-label={field.label}
                    value={customFieldFilters[field.key] ?? ""}
                    placeholder="Any"
                    onChange={(e) =>
                      setCustomFieldFilter(field.key, e.target.value)
                    }
                  />
                </label>
              );
            }
            return (
              <Select
                key={field.key}
                className="w-[9rem]"
                variant="secondary"
                value={customFieldFilters[field.key] ?? "all"}
                onChange={(value) => {
                  if (value == null) return;
                  setCustomFieldFilter(field.key, String(value));
                }}
              >
                <Label className="text-xs text-[color:var(--topo-muted)]">
                  {field.label}
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
                    {options.map((option) => (
                      <ListBox.Item
                        key={option}
                        id={option}
                        textValue={option}
                      >
                        {option}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            );
          })}
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

      {remote.error ? <div role="alert" className="topo-feedback">{remote.error} <button onClick={remote.retry}>Retry</button></div> : null}
      {remote.loading ? <p role="status" className="text-xs text-[color:var(--topo-muted)]">Updating cases…</p> : null}
      <AnimatePresence>
        {showCreate && can("cases.create") ? (
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
        className={`topo-cases-grid grid gap-3${historyCase ? " topo-cases-grid--inspecting" : ""}`}
      >
        <CaseBrowserPanel kind="folders" collapsed={Boolean(historyCase)} open={browserPanel === "folders"} onOpenChange={(open) => setBrowserPanel(current => open ? "folders" : current === "folders" ? null : current)}>
          <FolderTreePane
            folders={folders}
            folderCounts={folderCounts}
            unfiledCount={unfiledCount}
            totalCount={totalCases}
            selected={activeFolderFilter}
            collapsed={treeCollapsed}
            inline={Boolean(historyCase)}
            onToggleCollapsed={() => setTreeCollapsed((value) => !value)}
            onSelect={(id) => {
              setActiveViewId(null);
              setFolderFilter(id);
              setTreeCollapsed(true);
              if (historyCase) {
                setBrowserPanel("cases");
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Search cases"]')?.focus({ preventScroll: true }));
              }
            }}
            onCreateRoot={() => openCreateFolder(null)}
            onCreateSubfolder={(parentId) => openCreateFolder(parentId)}
            onRename={(folderId) => openRenameFolder(folderId)}
            onDelete={(folderId) => openDeleteFolder(folderId)}
            onDropCases={(folderId, caseIds) => {
              void dropCasesOnFolder(folderId, caseIds);
            }}
          />
        </CaseBrowserPanel>
        <CaseBrowserPanel kind="cases" collapsed={Boolean(historyCase)} open={browserPanel === "cases"} onOpenChange={(open) => setBrowserPanel(current => open ? "cases" : current === "cases" ? null : current)}>
        <CasesTable
          cases={pageData.items}
          totalCases={totalCases}
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
          onDuplicate={(row) => void duplicateCase(row)}
          onInlinePatch={(id, patch) => void inlinePatch(id, patch)}
          onPageChange={setPage}
        />
        </CaseBrowserPanel>

        {historyCase ? (
          <ResponsiveInspector onContainer={setInspectorContainer} label={`Case ${historyCase.key}`} onClose={requestClosePeek}>
          <CaseEditPanel
            key={historyCase.id}
            caseId={historyCase.id}
            caseKey={historyCase.key}
            caseTitle={historyCase.title}
            folders={folders}
            flatFolders={flatFolders}
            onClose={requestClosePeek}
            onDirtyChange={setEditorDirty}
            onDuplicated={(next) => {
              mergeCase(next);
              commitOpen(next);
              startTransition(() => router.refresh());
            }}
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
      <Modal.Backdrop UNSTABLE_portalContainer={inspectorContainer ?? undefined} isOpen={unsavedModal.isOpen} onOpenChange={(open) => { if (open) unsavedModal.open(); else keepEditing(); }}>
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
                  onPress={keepEditing}
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
          </ResponsiveInspector>
        ) : null}
      </div>
    </div>
  );
}
