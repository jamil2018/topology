export const TOPOLOGY_SHORTCUT = "topology:shortcut";
export const GO_CHORD_MS = 1000;

export type ShortcutId =
  | "cheat-sheet"
  | "create"
  | "escape"
  | "nav-next"
  | "nav-prev"
  | "nav-next-extend"
  | "nav-prev-extend"
  | "open"
  | "select"
  | "edit"
  | "status"
  | "priority"
  | "pass"
  | "fail"
  | "blocked"
  | "skipped"
  | "assign"
  | "go-cases"
  | "go-runs"
  | "go-plans"
  | "go-triage"
  | "go-hub";

export type ShortcutDef = {
  id: ShortcutId;
  keys: string[];
  label: string;
  group: string;
};

export const GO_CHORDS: {
  key: string;
  id: Extract<
    ShortcutId,
    "go-cases" | "go-runs" | "go-plans" | "go-triage" | "go-hub"
  >;
  href: string;
}[] = [
  { key: "c", id: "go-cases", href: "/cases" },
  { key: "r", id: "go-runs", href: "/runs" },
  { key: "p", id: "go-plans", href: "/plans" },
  { key: "t", id: "go-triage", href: "/triage" },
  { key: "h", id: "go-hub", href: "/" },
];

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "cheat-sheet",
    keys: ["?"],
    label: "Keyboard shortcuts",
    group: "Global",
  },
  { id: "create", keys: ["C"], label: "Create", group: "Global" },
  { id: "escape", keys: ["Esc"], label: "Close panel", group: "Global" },
  { id: "go-cases", keys: ["G", "C"], label: "Go to test cases", group: "Go" },
  { id: "go-runs", keys: ["G", "R"], label: "Go to test runs", group: "Go" },
  { id: "go-plans", keys: ["G", "P"], label: "Go to plans", group: "Go" },
  { id: "go-triage", keys: ["G", "T"], label: "Go to triage", group: "Go" },
  { id: "go-hub", keys: ["G", "H"], label: "Go to hub", group: "Go" },
  { id: "nav-next", keys: ["J"], label: "Next item", group: "Lists" },
  { id: "nav-prev", keys: ["K"], label: "Previous item", group: "Lists" },
  { id: "open", keys: ["↵"], label: "Open focused item", group: "Lists" },
  { id: "select", keys: ["X"], label: "Toggle selection", group: "Lists" },
  {
    id: "nav-next-extend",
    keys: ["⇧J"],
    label: "Extend selection down",
    group: "Lists",
  },
  {
    id: "nav-prev-extend",
    keys: ["⇧K"],
    label: "Extend selection up",
    group: "Lists",
  },
  { id: "edit", keys: ["E"], label: "Edit focused case", group: "Cases" },
  { id: "status", keys: ["S"], label: "Status menu", group: "Cases" },
  { id: "priority", keys: ["P"], label: "Priority menu", group: "Cases" },
  { id: "pass", keys: ["P"], label: "Pass result", group: "Run executor" },
  { id: "fail", keys: ["F"], label: "Fail result", group: "Run executor" },
  { id: "blocked", keys: ["B"], label: "Block result", group: "Run executor" },
  { id: "skipped", keys: ["S"], label: "Skip result", group: "Run executor" },
  { id: "assign", keys: ["A"], label: "Focus assignee", group: "Run executor" },
];

const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='searchbox'], [role='combobox']";

type ShortcutTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

type ShortcutEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "target"
>;

/** True when a keydown should type into the focused field instead of firing an app shortcut. */
export function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as ShortcutTarget;
  if (el.isContentEditable) return true;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (typeof el.closest === "function") {
    try {
      if (el.closest(EDITABLE_SELECTOR)) return true;
    } catch {
      /* jsdom-less unit tests pass a stub closest */
    }
  }
  return false;
}

const EXECUTOR_ONLY = new Set<ShortcutId>(["fail", "blocked", "assign"]);

const RUN_EXECUTOR_PATH =
  /^\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function isRunExecutorPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && RUN_EXECUTOR_PATH.test(pathname));
}

export function isCasesWorkspacePath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  if (pathname === "/cases") return true;
  if (pathname.startsWith("/cases/import")) return false;
  return /^\/cases\/[^/]+$/.test(pathname);
}

export function isRunsListPath(pathname: string | null | undefined): boolean {
  return pathname === "/runs";
}

export function hrefForGoShortcut(id: ShortcutId): string | null {
  return GO_CHORDS.find((chord) => chord.id === id)?.href ?? null;
}

function hasModifier(event: ShortcutEventLike): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

/** True when G should start a go-chord (G then C/R/P/T/H). */
export function isGoPrefix(event: ShortcutEventLike): boolean {
  if (event.repeat || hasModifier(event) || event.shiftKey) return false;
  if (shouldIgnoreShortcutTarget(event.target)) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return key === "g";
}

/** Map the second key of a G-then-X chord. */
export function matchGoChord(event: ShortcutEventLike): ShortcutId | null {
  if (event.repeat || hasModifier(event) || event.shiftKey) return null;
  if (shouldIgnoreShortcutTarget(event.target)) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return GO_CHORDS.find((chord) => chord.key === key)?.id ?? null;
}

/**
 * Map a keydown to a shortcut id. Returns null when the event should pass
 * through (typing in a field, modifier combos, unmatched keys).
 * Escape still matches while focus is in a field so panels can close.
 */
export function matchShortcut(
  event: ShortcutEventLike,
  pathname?: string | null,
): ShortcutId | null {
  if (event.repeat) return null;
  if (hasModifier(event)) return null;

  const key = event.key;
  if (key === "Escape") return "escape";
  if (shouldIgnoreShortcutTarget(event.target)) return null;
  if (key === "?" || (key === "/" && event.shiftKey)) return "cheat-sheet";

  const k = key.length === 1 ? key.toLowerCase() : key;
  const onCases = isCasesWorkspacePath(pathname);
  const onExecutor = isRunExecutorPath(pathname);

  if (event.shiftKey) {
    if (!onCases) return null;
    if (k === "j") return "nav-next-extend";
    if (k === "k") return "nav-prev-extend";
    return null;
  }

  let id: ShortcutId | null = null;
  if (k === "c") id = "create";
  else if (k === "j") id = "nav-next";
  else if (k === "k") id = "nav-prev";
  else if (k === "Enter") id = "open";
  else if (k === "x") id = "select";
  else if (k === "e") id = onCases ? "edit" : null;
  else if (k === "p") id = onExecutor ? "pass" : onCases ? "priority" : null;
  else if (k === "s") id = onExecutor ? "skipped" : onCases ? "status" : null;
  else if (k === "f") id = "fail";
  else if (k === "b") id = "blocked";
  else if (k === "a") id = "assign";

  if (!id) return null;
  if (EXECUTOR_ONLY.has(id) && !onExecutor) return null;
  return id;
}

export type ShortcutEventDetail = { id: ShortcutId };

export function dispatchShortcut(id: ShortcutId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ShortcutEventDetail>(TOPOLOGY_SHORTCUT, { detail: { id } }),
  );
}
