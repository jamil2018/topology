"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProjectActions } from "./project-actions";
import { Button, Modal } from "@heroui/react";
import {
  dispatchShortcut,
  GO_CHORD_MS,
  hrefForGoShortcut,
  isGoPrefix,
  matchGoChord,
  matchShortcut,
  SHORTCUTS,
  type ShortcutId,
  TOPOLOGY_SHORTCUT,
} from "@/lib/shortcuts";
import { openCommandPalette } from "./command-palette";

export const TOPOLOGY_OPEN_CHEATSHEET = "topology:open-cheatsheet";

export function openCheatSheet() {
  window.dispatchEvent(new Event(TOPOLOGY_OPEN_CHEATSHEET));
}

export function useShortcut(
  id: ShortcutId,
  handler: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function onEvent(event: Event) {
      const detail = (event as CustomEvent<{ id?: ShortcutId }>).detail;
      if (detail?.id === id) handler();
    }
    window.addEventListener(TOPOLOGY_SHORTCUT, onEvent);
    return () => window.removeEventListener(TOPOLOGY_SHORTCUT, onEvent);
  }, [id, handler, enabled]);
}

export function ShortcutLayer() {
  const { can } = useProjectActions();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const goPending = useRef(false);
  const goTimer = useRef<number | null>(null);

  const clearGo = useCallback(() => {
    goPending.current = false;
    if (goTimer.current != null) {
      window.clearTimeout(goTimer.current);
      goTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (open) {
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          close();
        }
        return;
      }
      if (goPending.current) {
        const goId = matchGoChord(event);
        clearGo();
        if (goId) {
          event.preventDefault();
          const href = hrefForGoShortcut(goId);
          if (href) router.push(href);
          return;
        }
      } else if (isGoPrefix(event)) {
        event.preventDefault();
        goPending.current = true;
        goTimer.current = window.setTimeout(clearGo, GO_CHORD_MS);
        return;
      }
      const id = matchShortcut(event, pathname);
      if (!id) return;
      if (id === "escape") {
        dispatchShortcut(id);
        return;
      }
      if (id === "create" && !can(pathname.startsWith("/runs") ? "runs.create" : "cases.create")) return;
      if (["edit", "status", "priority"].includes(id) && !can("cases.edit")) return;
      if (["pass", "fail", "blocked", "skipped", "assign"].includes(id) && !can("runs.edit")) return;
      event.preventDefault();
      if (id === "cheat-sheet") {
        setOpen(true);
        return;
      }
      dispatchShortcut(id);
      if (id === "create") {
        if (pathname.startsWith("/cases")) return;
        if (pathname.startsWith("/runs")) {
          router.push("/runs/new");
          return;
        }
        router.push("/cases?new=1");
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOPOLOGY_OPEN_CHEATSHEET, onOpenEvent);
    return () => {
      clearGo();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOPOLOGY_OPEN_CHEATSHEET, onOpenEvent);
    };
  }, [clearGo, close, open, pathname, router, can]);

  const groups = groupShortcuts();

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
      <Modal.Container placement="center" size="lg">
        <Modal.Dialog aria-labelledby={titleId} className="w-full overflow-hidden rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--topo-line)] px-4 py-3">
              <div>
                <Modal.Heading
                  id={titleId}
                  className="text-sm font-semibold text-[color:var(--topo-ink)]"
                >
                  Keyboard shortcuts
                </Modal.Heading>
                <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                  Single keys, plus G then a letter to go. Ignored while
                  typing in inputs. Press ? to close.
                </p>
              </div>
              <Button
                ref={closeRef}
                type="button"
                size="sm"
                variant="secondary"
                onPress={close}
                className="text-xs text-[color:var(--topo-muted)]"
              >
                Close
              </Button>
            </div>
            <div className="max-h-[min(24rem,55vh)] overflow-y-auto px-4 py-3">
              {groups.map((group) => (
                <section key={group.name} className="mb-4 last:mb-0">
                  <h3 className="mb-1.5 text-xs font-medium text-[color:var(--topo-muted)]">
                    {group.name}
                  </h3>
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-[color:var(--topo-ink)]">
                          {item.label}
                        </span>
                        <span className="flex gap-1">
                          {item.keys.map((key) => (
                            <kbd
                              key={key}
                              className="rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--topo-ink)]"
                            >
                              {key}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                    {group.name === "Global" ? (
                      <>
                        <li className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[color:var(--topo-ink)]">
                            Command palette
                          </span>
                          <span className="flex gap-1">
                            <kbd className="rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--topo-ink)]">
                              ⌘K
                            </kbd>
                          </span>
                        </li>
                        <li className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[color:var(--topo-ink)]">
                            Toggle sidebar
                          </span>
                          <span className="flex gap-1">
                            <kbd className="rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--topo-ink)]">
                              ⌘B
                            </kbd>
                          </span>
                        </li>
                      </>
                    ) : null}
                  </ul>
                </section>
              ))}
              <p className="pt-1 text-xs text-[color:var(--topo-muted)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inline h-auto p-0 underline-offset-2 hover:underline"
                  onPress={() => {
                    close();
                    openCommandPalette();
                  }}
                >
                  Open the command palette
                </Button>{" "}
                for navigation, import, and search.
              </p>
            </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function groupShortcuts() {
  const order: string[] = [];
  const map = new Map<string, typeof SHORTCUTS>();
  for (const item of SHORTCUTS) {
    if (!map.has(item.group)) {
      order.push(item.group);
      map.set(item.group, []);
    }
    map.get(item.group)!.push(item);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}
