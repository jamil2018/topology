"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { BellIcon } from "@phosphor-icons/react";
import { abortCleanup, isAbortError } from "@/lib/abort";
import { useProjectActions } from "./project-actions";
import { NotificationListSkeleton } from "./skeletons";

const REFRESH_MS = 45_000;

type Item = { id: string; title: string; body: string; readAt: string | null; href: string | null; openHref?: string | null };
export function NotificationsBell() {
  const { projectId } = useProjectActions();
  const markLock = useRef(false);
  const loadVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal, opts?: { quiet?: boolean }) => {
    const version = ++loadVersion.current;
    if (!opts?.quiet) setLoading(true);
    try {
      const response = await fetch("/api/notifications", { signal, headers: projectId ? { "x-topology-project-id": projectId } : {} });
      if (signal?.aborted || version !== loadVersion.current) return;
      if (!response.ok) throw new Error("Could not load notifications");
      const data = await response.json();
      if (signal?.aborted || version !== loadVersion.current) return;
      setItems(data.notifications ?? []); setUnread(data.unreadCount ?? 0); setError(null);
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) return;
      if (version === loadVersion.current && !opts?.quiet) setError("Could not load notifications. Try again.");
    }
    finally { if (!signal?.aborted && version === loadVersion.current && !opts?.quiet) setLoading(false); }
  }, [projectId]);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void load(controller.signal).catch((error) => {
      // Swallow AbortError if it escapes load (race with cleanup).
      if (cancelled || controller.signal.aborted || isAbortError(error)) return;
    });
    return () => {
      cancelled = true;
      // Empty-message AbortError DOMException — never abort("string") (Next overlays reasons).
      abortCleanup(controller);
    };
  }, [load]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function refreshQuietly() {
      void load(undefined, { quiet: true });
    }

    function clearPoll() {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function startPoll() {
      clearPoll();
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        intervalId = setInterval(refreshQuietly, REFRESH_MS);
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        refreshQuietly();
        startPoll();
      } else {
        clearPoll();
      }
    }

    startPoll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  function markOpenedLocally(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && !item.readAt
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnread((prev) => Math.max(0, prev - 1));
  }

  async function markRead(id: string) {
    if (markLock.current) return;
    markLock.current = true;
    setPending(id);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json", ...(projectId ? { "x-topology-project-id": projectId } : {}) }, body: JSON.stringify({ id, read: true }) });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError("Could not mark notification read. Try again."); }
    finally { markLock.current = false; setPending(null); }
  }
  async function markAllRead() {
    if (markLock.current || unread === 0) return;
    markLock.current = true;
    setPending("all");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(projectId ? { "x-topology-project-id": projectId } : {}),
        },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("Could not mark all notifications read. Try again.");
    } finally {
      markLock.current = false;
      setPending(null);
    }
  }
  const visible = onlyUnread ? items.filter((item) => !item.readAt) : items;
  return <>
    <Button size="sm" variant="secondary" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onPress={() => { setOpen(true); void load(); }}><BellIcon size={16} />{unread ? <span className="text-xs">{unread}</span> : null}</Button>
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}><Modal.Container placement="center" size="lg"><Modal.Dialog>
      <Modal.Header className="pe-12"><Modal.Heading>Notifications</Modal.Heading><Modal.CloseTrigger aria-label="Close notifications" /></Modal.Header>
      <Modal.Body>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Notification filter" className="flex gap-2">
            <Button size="sm" variant={onlyUnread ? "primary" : "secondary"} onPress={() => setOnlyUnread(true)}>Unread</Button>
            <Button size="sm" variant={!onlyUnread ? "primary" : "secondary"} onPress={() => setOnlyUnread(false)}>All</Button>
          </div>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={Boolean(pending)}
              onPress={() => void markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {error ? <p role="alert" className="topo-feedback">{error}<Button variant="ghost" size="sm" onPress={() => void load()}>Retry</Button></p> : null}
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Loading notifications">
            <NotificationListSkeleton />
          </div>
        ) : null}
        {!loading && !error && !visible.length ? <p className="py-6 text-sm text-[color:var(--topo-muted)]">{onlyUnread ? "You’re caught up." : "No notifications yet."}</p> : null}
        {!loading ? (
        <ul className="divide-y divide-[color:var(--topo-line)]">{visible.map((item) => <li key={item.id} className="space-y-2 py-3"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-[color:var(--topo-muted)]">{item.body}</p><div className="flex items-center gap-3 text-xs">{item.href ? <Link className="underline" href={item.openHref || item.href} onClick={() => { if (!item.readAt) markOpenedLocally(item.id); setOpen(false); }}>Open item</Link> : <span>Item no longer available</span>}{!item.readAt ? <Button size="sm" variant="tertiary" isDisabled={Boolean(pending)} onPress={() => void markRead(item.id)}>Mark read</Button> : null}</div></li>)}</ul>
        ) : null}
      </Modal.Body>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </>;
}
