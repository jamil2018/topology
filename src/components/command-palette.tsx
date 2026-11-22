"use client";
import { Button, Input } from "@heroui/react";
import { useProjectActions } from "./project-actions";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FocusScope } from "react-aria";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BugIcon,
  ChartBarIcon,
  ChartLineIcon,
  CirclesFourIcon,
  CopyIcon,
  FlagIcon,
  FolderIcon,
  GearIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PlayCircleIcon,
  PlugsIcon,
  SparkleIcon,
  TargetIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { visiblePalettePages } from "@/lib/nav-diet";
import { formatStatusLabel } from "@/lib/format-labels";
import {
  dispatchShortcut,
  isRunExecutorPath,
} from "@/lib/shortcuts";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
} from "./cases-model";
import { useQualityGraph } from "./quality-graph-provider";
import { CommandPaletteResultsSkeleton } from "./skeletons";

type SearchHit = {
  cases: Array<{
    id: string;
    key: string;
    title: string;
    snippet?: string | null;
    matchField?: string;
  }>;
  runs: Array<{
    id: string;
    name: string;
    status: string;
    snippet?: string | null;
  }>;
  folders: Array<{ id: string; name: string; snippet?: string | null }>;
  comments: Array<{
    id: string;
    resultId: string;
    runId: string;
    snippet: string;
    matchField?: string;
  }>;
  requirements?: Array<{
    id: string;
    key: string;
    title: string;
    snippet?: string | null;
    matchField?: string;
  }>;
  intents?: Array<{
    id: string;
    key: string;
    title: string;
    snippet?: string | null;
    matchField?: string;
  }>;
  risks?: Array<{
    id: string;
    key: string;
    title: string;
    snippet?: string | null;
    matchField?: string;
  }>;
  plans?: Array<{
    id: string;
    name: string;
    status?: string;
    snippet?: string | null;
  }>;
  milestones?: Array<{
    id: string;
    name: string;
    status?: string;
    snippet?: string | null;
  }>;
  triage?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    snippet?: string | null;
  }>;
  proposals?: Array<{
    id: string;
    name: string;
    status?: string;
    entityType?: string;
    snippet?: string | null;
  }>;
  releases?: Array<{
    id: string;
    name: string;
    status?: string;
    snippet?: string | null;
  }>;
};

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  badge?: string;
  snippet?: string;
  group: string;
  Icon: Icon;
  run: () => void;
};

const EMPTY_HITS: SearchHit = {
  cases: [],
  runs: [],
  folders: [],
  comments: [],
  plans: [],
  milestones: [],
  triage: [],
  proposals: [],
  releases: [],
};

function matchFieldBadge(entity: string, matchField?: string): string {
  if (!matchField) return entity;
  if (matchField === "key") return `${entity} · Key`;
  if (matchField === "step") return `${entity} · Step`;
  if (matchField === "title") return `${entity} · Title`;
  if (matchField === "description") return `${entity} · Description`;
  if (matchField === "behavior") return `${entity} · Behavior`;
  if (matchField === "comment") return "Comment";
  if (matchField === "case") return entity;
  return entity;
}

const PAGE_ICONS: Record<string, CommandItem["Icon"]> = {
  "/": CirclesFourIcon,
  "/cases": ListChecksIcon,
  "/plans": FlagIcon,
  "/runs": PlayCircleIcon,
  "/automation": ChartLineIcon,
  "/triage": BugIcon,
  "/reports": ChartLineIcon,
  "/settings": GearIcon,
  "/intents": TargetIcon,
  "/impact": ChartBarIcon,
  "/milestones": FlagIcon,
  "/releases": FlagIcon,
  "/journeys": FolderIcon,
  "/requirements": FolderIcon,
  "/risks": BugIcon,
  "/components": CirclesFourIcon,
  "/proposals": SparkleIcon,
  "/connect": PlugsIcon,
};

export const TOPOLOGY_OPEN_PALETTE = "topology:open-palette";
export const TOPOLOGY_PALETTE_FOCUS = "topology:palette-focus";
export const TOPOLOGY_CASE_COMMAND = "topology:case-command";

export type PaletteEntityFocus =
  | {
      kind: "case";
      id: string;
      key: string;
      title: string;
      status: string;
      priority: string;
      selectedIds: string[];
    }
  | { kind: "none" };

export type CaseCommandDetail =
  | { type: "status"; id: string; value: string }
  | { type: "priority"; id: string; value: string }
  | { type: "duplicate"; id: string };

let paletteFocus: PaletteEntityFocus = { kind: "none" };

export function publishPaletteFocus(next: PaletteEntityFocus) {
  paletteFocus = next;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOPOLOGY_PALETTE_FOCUS));
}

export function getPaletteFocus(): PaletteEntityFocus {
  return paletteFocus;
}

export function dispatchCaseCommand(detail: CaseCommandDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CaseCommandDetail>(TOPOLOGY_CASE_COMMAND, { detail }),
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new Event(TOPOLOGY_OPEN_PALETTE));
}

export function CommandPalette() {
  const { can } = useProjectActions();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const [focus, setFocus] = useState<PaletteEntityFocus>(paletteFocus);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit>(EMPTY_HITS);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    setHits(EMPTY_HITS);
    setSearching(false);
    setSearchError(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPalette =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (isPalette) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    function onFocusChange() {
      setFocus(paletteFocus);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOPOLOGY_OPEN_PALETTE, onOpenEvent);
    window.addEventListener(TOPOLOGY_PALETTE_FOCUS, onFocusChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOPOLOGY_OPEN_PALETTE, onOpenEvent);
      window.removeEventListener(TOPOLOGY_PALETTE_FOCUS, onFocusChange);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setSearching(false);
      setSearchError(null);
      setHits(EMPTY_HITS);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: unknown;
            };
            throw new Error(
              typeof data.error === "string" ? data.error : "Search failed",
            );
          }
          return res.json();
        })
        .then((data) => {
          if (cancelled || !data) return;
          setHits({
            cases: data.cases ?? [],
            runs: data.runs ?? [],
            folders: data.folders ?? [],
            comments: data.comments ?? [],
            plans: data.plans ?? [],
            milestones: data.milestones ?? [],
            triage: data.triage ?? [],
            proposals: data.proposals ?? [],
            releases: data.releases,
            requirements: data.requirements,
            intents: data.intents,
            risks: data.risks,
          });
          setSearchError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setHits(EMPTY_HITS);
          setSearchError(
            err instanceof Error && err.message
              ? err.message
              : "Search failed",
          );
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, searchRetryKey]);

  const items = useMemo(() => {
    const list: CommandItem[] = [];
    const q = query.trim().toLowerCase();
    const resolvedHits = trimmedQuery ? hits : EMPTY_HITS;

    const contextual: CommandItem[] = [];
    if (focus.kind === "case") {
      const caseId = focus.id;
      const caseKey = focus.key;
      for (const status of CASE_STATUSES) {
        contextual.push({
          id: `ctx-status-${status}`,
          label: `Set ${caseKey} status to ${formatStatusLabel(status)}`,
          hint: "Status",
          group: "Focused",
          Icon: ListChecksIcon,
          run: () => {
            dispatchCaseCommand({ type: "status", id: caseId, value: status });
            close();
          },
        });
      }
      for (const priority of CASE_PRIORITIES) {
        contextual.push({
          id: `ctx-priority-${priority}`,
          label: `Set ${caseKey} priority to ${priority}`,
          hint: "Priority",
          group: "Focused",
          Icon: FlagIcon,
          run: () => {
            dispatchCaseCommand({
              type: "priority",
              id: caseId,
              value: priority,
            });
            close();
          },
        });
      }
      const runIds =
        focus.selectedIds.length > 0 ? focus.selectedIds : [focus.id];
      const runLabel =
        focus.selectedIds.length > 1
          ? `Start run from ${focus.selectedIds.length} selected`
          : `Start run with ${caseKey}`;
      contextual.push({
        id: "ctx-start-run",
        label: runLabel,
        hint: "Selection",
        group: "Focused",
        Icon: PlayCircleIcon,
        run: () => {
          router.push(`/runs/new?cases=${runIds.join(",")}`);
          close();
        },
      });
      contextual.push({
        id: "ctx-duplicate-case",
        label: `Duplicate ${caseKey}`,
        hint: "Copy",
        group: "Focused",
        Icon: CopyIcon,
        run: () => {
          dispatchCaseCommand({ type: "duplicate", id: caseId });
          close();
        },
      });
    }
    if (isRunExecutorPath(pathname)) {
      contextual.push({
        id: "ctx-assign",
        label: "Assign focused result",
        hint: "A",
        group: "Focused",
        Icon: UserIcon,
        run: () => {
          dispatchShortcut("assign");
          close();
        },
      });
    }

    for (const action of contextual) {
      if (action.id.startsWith("ctx-status") || action.id.startsWith("ctx-priority")) { if (!can("cases.edit")) continue; }
      if (action.id === "ctx-duplicate-case" && !can("cases.create")) continue;
      if (action.id === "ctx-start-run" && !can("runs.create")) continue;
      if (action.id === "ctx-assign" && !can("runs.edit")) continue;
      if (
        !q ||
        action.label.toLowerCase().includes(q) ||
        (action.hint ?? "").toLowerCase().includes(q)
      ) {
        list.push(action);
      }
    }

    const actions: CommandItem[] = [
      {
        id: "action-new-case",
        label: "Create case",
        hint: "New",
        group: "Actions",
        Icon: PlusIcon,
        run: () => {
          router.push("/cases?new=1");
          close();
        },
      },
      {
        id: "action-start-run",
        label: "Start run",
        hint: "New",
        group: "Actions",
        Icon: PlayCircleIcon,
        run: () => {
          router.push("/runs/new");
          close();
        },
      },
      {
        id: "action-import-cases",
        label: "Import cases",
        hint: "TestRail / Qase / Zephyr / Xray",
        group: "Actions",
        Icon: ListChecksIcon,
        run: () => {
          router.push("/cases/import");
          close();
        },
      },
      {
        id: "action-file-issue",
        label: "File issue",
        hint: "Triage",
        group: "Actions",
        Icon: BugIcon,
        run: () => {
          router.push("/triage");
          close();
        },
      },
      {
        id: "action-connect-ci",
        label: "Import CI",
        hint: "JUnit / reporters",
        group: "Actions",
        Icon: ChartLineIcon,
        run: () => {
          router.push("/settings?section=integrations#ci");
          close();
        },
      },
      {
        id: "action-connect-agent",
        label: "Connect agent",
        hint: "MCP / API token",
        group: "Actions",
        Icon: PlugsIcon,
        run: () => {
          router.push("/settings?section=integrations#agent");
          close();
        },
      },
    ];

    for (const action of actions) {
      if (["action-new-case", "action-import-cases"].includes(action.id) && !can("cases.create")) continue;
      if (action.id === "action-start-run" && !can("runs.create")) continue;
      if (action.id === "action-file-issue" && !can("triage.manage")) continue;
      if (action.id === "action-connect-ci" && !can("automation.manage")) continue;
      if (action.id === "action-connect-agent" && !can("settings.view")) continue;
      if (
        !q ||
        action.label.toLowerCase().includes(q) ||
        (action.hint ?? "").toLowerCase().includes(q)
      ) {
        list.push(action);
      }
    }

    const pages = visiblePalettePages(qualityGraphEnabled).map((page) => ({
      ...page,
      hint: page.hint ?? "",
      Icon: PAGE_ICONS[page.href] ?? ListChecksIcon,
    }));

    for (const page of pages) {
      if (
        !q ||
        page.label.toLowerCase().includes(q) ||
        page.hint.toLowerCase().includes(q)
      ) {
        list.push({
          id: `page-${page.href}`,
          label: page.label,
          hint: page.hint,
          group: "Navigate",
          Icon: page.Icon,
          run: () => {
            router.push(page.href);
            close();
          },
        });
      }
    }

    for (const c of resolvedHits.cases) {
      list.push({
        id: `case-${c.id}`,
        label: `${c.key} · ${c.title}`,
        badge: matchFieldBadge("Case", c.matchField),
        snippet: c.snippet && c.snippet !== c.title ? c.snippet : undefined,
        group: "Jump",
        Icon: ListChecksIcon,
        run: () => {
          router.push(`/cases?case=${c.id}`);
          close();
        },
      });
    }
    for (const r of resolvedHits.runs) {
      list.push({
        id: `run-${r.id}`,
        label: r.name,
        badge: "Run",
        hint: formatStatusLabel(r.status),
        snippet:
          r.snippet && r.snippet !== r.name ? r.snippet : undefined,
        group: "Jump",
        Icon: PlayCircleIcon,
        run: () => {
          router.push(`/runs/${r.id}`);
          close();
        },
      });
    }
    for (const f of resolvedHits.folders) {
      list.push({
        id: `folder-${f.id}`,
        label: f.name,
        badge: "Folder",
        group: "Jump",
        Icon: FolderIcon,
        run: () => {
          router.push(`/cases?folder=${f.id}`);
          close();
        },
      });
    }
    for (const comment of resolvedHits.comments) {
      list.push({
        id: `comment-${comment.id}`,
        label: "Result comment",
        badge: "Comment",
        snippet: comment.snippet || undefined,
        group: "Jump",
        Icon: BugIcon,
        run: () => {
          router.push(`/runs/${comment.runId}?result=${comment.resultId}`);
          close();
        },
      });
    }
    for (const plan of resolvedHits.plans ?? []) {
      list.push({
        id: `plan-${plan.id}`,
        label: plan.name,
        badge: plan.status ? `Plan · ${plan.status}` : "Plan",
        snippet:
          plan.snippet && plan.snippet !== plan.name ? plan.snippet : undefined,
        group: "Jump",
        Icon: FlagIcon,
        run: () => {
          router.push(`/plans/${plan.id}`);
          close();
        },
      });
    }
    for (const milestone of resolvedHits.milestones ?? []) {
      list.push({
        id: `milestone-${milestone.id}`,
        label: milestone.name,
        badge: milestone.status
          ? `Milestone · ${milestone.status}`
          : "Milestone",
        snippet:
          milestone.snippet && milestone.snippet !== milestone.name
            ? milestone.snippet
            : undefined,
        group: "Jump",
        Icon: FlagIcon,
        run: () => {
          router.push(`/milestones?milestone=${milestone.id}`);
          close();
        },
      });
    }
    for (const item of resolvedHits.triage ?? []) {
      list.push({
        id: `triage-${item.id}`,
        label: item.title,
        badge: `Triage · ${item.priority}`,
        snippet:
          item.snippet && item.snippet !== item.title
            ? item.snippet
            : undefined,
        group: "Jump",
        Icon: BugIcon,
        run: () => {
          router.push(`/triage#failure-${item.id}`);
          close();
        },
      });
    }
    for (const req of resolvedHits.requirements ?? []) {
      list.push({
        id: `requirement-${req.id}`,
        label: `${req.key} · ${req.title}`,
        badge: matchFieldBadge("Requirement", req.matchField),
        snippet:
          req.snippet && req.snippet !== req.title ? req.snippet : undefined,
        group: "Jump",
        Icon: FolderIcon,
        run: () => {
          router.push(`/requirements?requirement=${req.id}`);
          close();
        },
      });
    }
    for (const intent of resolvedHits.intents ?? []) {
      list.push({
        id: `intent-${intent.id}`,
        label: `${intent.key} · ${intent.title}`,
        badge: matchFieldBadge("Intent", intent.matchField),
        snippet:
          intent.snippet && intent.snippet !== intent.title
            ? intent.snippet
            : undefined,
        group: "Jump",
        Icon: TargetIcon,
        run: () => {
          router.push(`/intents?intent=${intent.id}`);
          close();
        },
      });
    }
    for (const risk of resolvedHits.risks ?? []) {
      list.push({
        id: `risk-${risk.id}`,
        label: `${risk.key} · ${risk.title}`,
        badge: matchFieldBadge("Risk", risk.matchField),
        snippet:
          risk.snippet && risk.snippet !== risk.title ? risk.snippet : undefined,
        group: "Jump",
        Icon: BugIcon,
        run: () => {
          router.push(`/risks?risk=${risk.id}`);
          close();
        },
      });
    }
    for (const proposal of resolvedHits.proposals ?? []) {
      list.push({
        id: `proposal-${proposal.id}`,
        label: proposal.name,
        badge: proposal.status
          ? `Proposal · ${proposal.status}`
          : "Proposal",
        snippet:
          proposal.snippet && proposal.snippet !== proposal.name
            ? proposal.snippet
            : undefined,
        group: "Jump",
        Icon: SparkleIcon,
        run: () => {
          router.push(`/proposals?proposal=${proposal.id}`);
          close();
        },
      });
    }
    for (const release of resolvedHits.releases ?? []) {
      list.push({
        id: `release-${release.id}`,
        label: release.name,
        badge: "Release",
        snippet:
          release.snippet && release.snippet !== release.name
            ? release.snippet
            : undefined,
        group: "Jump",
        Icon: FlagIcon,
        run: () => {
          router.push(`/releases/${release.id}`);
          close();
        },
      });
    }

    return list;
  }, [can, close, focus, hits, pathname, qualityGraphEnabled, query, router, trimmedQuery]);

  const safeActive =
    items.length === 0 ? 0 : Math.min(active, items.length - 1);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[safeActive]?.run();
    }
  }

  let lastGroup = "";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 px-3 pt-[12vh] sm:pt-[14vh]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <FocusScope contain restoreFocus autoFocus>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="flex items-center gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
              <MagnifyingGlassIcon
                size={16}
                className="shrink-0 text-[color:var(--topo-muted)]"
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Create, start a run, file issue, or jump…"
                className="min-w-0 flex-1 border-0 bg-transparent shadow-none outline-none"
                aria-label="Command search"
              />
              <kbd className="hidden rounded border border-[color:var(--topo-line)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--topo-muted)] sm:inline">
                esc
              </kbd>
            </div>
            {searchError && !searching ? (
              <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-1.5 text-xs text-[color:var(--topo-muted)]">
                <span role="alert" className="min-w-0 truncate">
                  {searchError}
                </span>
                <Button
                  type="button"
                  className="shrink-0 font-medium text-[color:var(--topo-accent)]"
                  onPress={() => setSearchRetryKey((n) => n + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {searching && items.length === 0 ? (
              <div
                role="status"
                aria-busy="true"
                aria-live="polite"
                aria-label="Searching"
              >
                <CommandPaletteResultsSkeleton />
              </div>
            ) : (
            <ul
              className="max-h-[min(22rem,50vh)] overflow-y-auto py-1.5"
              role="listbox"
              aria-label="Commands"
              aria-busy={searching || undefined}
              aria-activedescendant={
                items[safeActive] ? `cmd-${items[safeActive].id}` : undefined
              }
            >
              {items.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
                  {searchError
                    ? "Search unavailable"
                    : "No matching commands"}
                </li>
              ) : (
                items.map((item, index) => {
                  const showGroup = item.group !== lastGroup;
                  lastGroup = item.group;
                  const Icon = item.Icon;
                  const selected = index === safeActive;
                  return (
                    <li key={item.id}>
                      {showGroup ? (
                        <p className="px-3 pb-1 pt-2 text-xs font-medium text-[color:var(--topo-muted)]">
                          {item.group}
                        </p>
                      ) : null}
                      {/*
                        Listbox options must use role="option". HeroUI Button forces
                        role="button", so keep a pressable option element here.
                      */}
                      <div
                        id={`cmd-${item.id}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={selected}
                        className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "topo-selected-surface"
                            : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-chip)]"
                        }`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => item.run()}
                      >
                        <Icon
                          size={15}
                          weight={selected ? "fill" : "regular"}
                          className={
                            selected
                              ? "shrink-0 self-start text-[color:var(--topo-accent)]"
                              : "shrink-0 self-start text-[color:var(--topo-muted)]"
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <span className="min-w-0 truncate">{item.label}</span>
                          {item.snippet ? (
                            <span className="mt-0.5 block truncate text-xs text-[color:var(--topo-muted)]">
                              {item.snippet}
                            </span>
                          ) : null}
                        </div>
                        {item.badge ? (
                          <span className="shrink-0 self-start rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--topo-muted)]">
                            {item.badge}
                          </span>
                        ) : null}
                        {item.hint ? (
                          <span className="shrink-0 self-start font-medium text-xs text-[color:var(--topo-muted)]">
                            {item.hint}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            )}
          </motion.div>
          </FocusScope>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
