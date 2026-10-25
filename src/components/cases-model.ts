import type { OrderedStep } from "@/lib/tcm/steps";

export const CASE_WORKSPACE_PAGE_SIZE = 50;

export const CASE_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const CASE_STATUSES = ["draft", "ready", "blocked", "deprecated"] as const;

export type Folder = { id: string; name: string; parentId: string | null };
export type FlatFolder = Folder & { depth: number };

export type CaseRow = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: { id: string; name: string } | null;
  intentId?: string | null;
  intent?: { id: string; key: string; title: string } | null;
};

export type BulkPatch = {
  status?: string;
  priority?: string;
  folderId?: string | null;
  tags?: string[];
  tagMode?: "replace" | "add";
};

export type CaseInlinePatch = {
  status?: string;
  priority?: string;
  folderId?: string | null;
};

export { formatStatusLabel } from "@/lib/format-labels";

export function projectKeyPrefix(slug: string): string {
  const cleaned = slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!cleaned) return "CASE";
  return cleaned.length <= 6 ? cleaned : cleaned.slice(0, 3);
}

export function nextCaseKey(prefix: string, keys: readonly string[]): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}-(\\d+)$`, "i");
  let max = 0;
  for (const key of keys) {
    const match = key.match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

export function caseHref(key: string): string {
  return `/cases/${encodeURIComponent(key)}`;
}

export function caseKeyFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/cases\/([^/]+)$/);
  if (!match || match[1] === "import") return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function applyBulkPatch(
  rows: CaseRow[],
  ids: Set<string> | string[],
  patch: BulkPatch,
  folders: Folder[],
): CaseRow[] {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  return rows.map((row) => {
    if (!idSet.has(row.id)) return row;
    const next: CaseRow = { ...row };
    if (patch.status) next.status = patch.status;
    if (patch.priority) next.priority = patch.priority;
    if (patch.folderId !== undefined) {
      if (patch.folderId == null) next.folder = null;
      else {
        const found = folders.find((folder) => folder.id === patch.folderId);
        next.folder = found ? { id: found.id, name: found.name } : row.folder;
      }
    }
    if (patch.tags) {
      next.tags =
        patch.tagMode === "add"
          ? Array.from(new Set([...row.tags, ...patch.tags]))
          : patch.tags;
    }
    return next;
  });
}

export function emptyStructuredStep(): OrderedStep {
  return {
    id: null,
    position: 0,
    action: "",
    expected: "",
    data: "",
    sharedStepId: null,
  };
}

export function parseTagInput(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Inclusive id range for Shift+J/K selection extend. */
export function selectionRangeIds(
  ids: readonly string[],
  from: number,
  to: number,
): string[] {
  if (ids.length === 0) return [];
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(ids.length - 1, Math.max(from, to));
  return ids.slice(start, end + 1);
}

export function caseFieldShortcutSelector(
  caseId: string,
  field: "status" | "priority",
): string {
  return `[data-case-shortcut="${caseId}:${field}"]`;
}
