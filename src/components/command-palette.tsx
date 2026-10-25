"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BugIcon,
  ChartBarIcon,
  ChartLineIcon,
  CirclesFourIcon,
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

type SearchHit = {
  cases: Array<{ id: string; key: string; title: string }>;
  runs: Array<{ id: string; name: string; status: string }>;
  folders: Array<{ id: string; name: string }>;
};

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  Icon: Icon;
  run: () => void;
};

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
  | { type: "priority"; id: string; value: string };

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
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const [focus, setFocus] = useState<PaletteEntityFocus>(paletteFocus);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit>({
    cases: [],
    runs: [],
    folders: [],
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    setHits({ cases: [], runs: [], folders: [] });
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
    if (!q) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setHits({
            cases: data.cases ?? [],
            runs: data.runs ?? [],
            folders: data.folders ?? [],
          });
        })
        .catch(() => {
          /* ignore abort / network */
        });
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const items = useMemo(() => {
    const list: CommandItem[] = [];
    const q = query.trim().toLowerCase();
    const resolvedHits = trimmedQuery
      ? hits
      : { cases: [] as SearchHit["cases"], runs: [] as SearchHit["runs"], folders: [] as SearchHit["folders"] };

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
    ];

    for (const action of actions) {
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
        hint: "Case",
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
        hint: formatStatusLabel(r.status),
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
        hint: "Folder",
        group: "Jump",
        Icon: FolderIcon,
        run: () => {
          router.push(`/cases?folder=${f.id}`);
          close();
        },
      });
    }

    return list;
  }, [close, focus, hits, pathname, qualityGraphEnabled, query, router, trimmedQuery]);

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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-2xl"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="flex items-center gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
              <MagnifyingGlassIcon
                size={16}
                className="shrink-0 text-[color:var(--topo-muted)]"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Create, start a run, file issue, or jump…"
                className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--topo-ink)] outline-none placeholder:text-[color:var(--topo-muted)]"
                aria-label="Command search"
              />
              <kbd className="hidden rounded border border-[color:var(--topo-line)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--topo-muted)] sm:inline">
                esc
              </kbd>
            </div>
            <ul
              className="max-h-[min(22rem,50vh)] overflow-y-auto py-1.5"
              role="listbox"
              aria-label="Commands"
              aria-activedescendant={
                items[safeActive] ? `cmd-${items[safeActive].id}` : undefined
              }
            >
              {items.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
                  No matching commands
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
                        <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
                          {item.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        id={`cmd-${item.id}`}
                        role="option"
                        aria-selected={selected}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
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
                              ? "text-[color:var(--topo-accent)]"
                              : "text-[color:var(--topo-muted)]"
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint ? (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                            {item.hint}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
