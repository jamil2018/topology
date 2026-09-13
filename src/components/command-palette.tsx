"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BugIcon,
  ChartLineIcon,
  CirclesFourIcon,
  FolderIcon,
  GearIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PlayCircleIcon,
  PlugsIcon,
  type Icon,
} from "@phosphor-icons/react";

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

const PAGES: Array<{
  href: string;
  label: string;
  hint: string;
  Icon: CommandItem["Icon"];
}> = [
  { href: "/", label: "Hub", hint: "Pulse", Icon: CirclesFourIcon },
  { href: "/cases", label: "Test Cases", hint: "Suites", Icon: ListChecksIcon },
  { href: "/runs", label: "Test Runs", hint: "Manual", Icon: PlayCircleIcon },
  { href: "/reports", label: "Reports", hint: "Charts", Icon: ChartLineIcon },
  { href: "/triage", label: "Triage", hint: "Failures", Icon: BugIcon },
  { href: "/settings", label: "Settings", hint: "Account", Icon: GearIcon },
  { href: "/connect", label: "Connect", hint: "Agent", Icon: PlugsIcon },
  {
    href: "/automation",
    label: "Automation",
    hint: "CI",
    Icon: PlayCircleIcon,
  },
];

export const TOPOLOGY_OPEN_PALETTE = "topology:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(TOPOLOGY_OPEN_PALETTE));
}

export function CommandPalette() {
  const router = useRouter();
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
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOPOLOGY_OPEN_PALETTE, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOPOLOGY_OPEN_PALETTE, onOpenEvent);
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
          router.push("/runs?new=1");
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

    for (const page of PAGES) {
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
        hint: r.status,
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
  }, [close, hits, query, router, trimmedQuery]);

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
            <ul className="max-h-[min(22rem,50vh)] overflow-y-auto py-1.5" role="listbox">
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
