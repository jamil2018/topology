"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { BellIcon } from "@phosphor-icons/react";
import { useProjectActions } from "./project-actions";
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
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { signal, headers: projectId ? { "x-topology-project-id": projectId } : {} });
      if (!response.ok) throw new Error("Could not load notifications");
      const data = await response.json();
      if (!signal?.aborted && version === loadVersion.current) { setItems(data.notifications ?? []); setUnread(data.unreadCount ?? 0); setError(null); }
    } catch { if (!signal?.aborted && version === loadVersion.current) setError("Could not load notifications. Try again."); }
    finally { if (!signal?.aborted && version === loadVersion.current) setLoading(false); }
  }, [projectId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
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
  const visible = onlyUnread ? items.filter((item) => !item.readAt) : items;
  return <>
    <Button size="sm" variant="secondary" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onPress={() => { setOpen(true); void load(); }}><BellIcon size={16} />{unread ? <span className="text-xs">{unread}</span> : null}</Button>
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}><Modal.Container placement="center" size="lg"><Modal.Dialog>
      <Modal.Header className="pe-12"><Modal.Heading>Notifications</Modal.Heading><Modal.CloseTrigger aria-label="Close notifications" /></Modal.Header>
      <Modal.Body>
        <div role="group" aria-label="Notification filter" className="mb-3 flex gap-2"><Button size="sm" variant={onlyUnread ? "primary" : "secondary"} onPress={() => setOnlyUnread(true)}>Unread</Button><Button size="sm" variant={!onlyUnread ? "primary" : "secondary"} onPress={() => setOnlyUnread(false)}>All</Button></div>
        {error ? <p role="alert" className="topo-feedback">{error}<button onClick={() => void load()}>Retry</button></p> : null}
        {loading ? <p role="status">Loading notifications…</p> : null}
        {!loading && !error && !visible.length ? <p className="py-6 text-sm text-[color:var(--topo-muted)]">{onlyUnread ? "You’re caught up." : "No notifications yet."}</p> : null}
        <ul className="divide-y divide-[color:var(--topo-line)]">{visible.map((item) => <li key={item.id} className="space-y-2 py-3"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-[color:var(--topo-muted)]">{item.body}</p><div className="flex items-center gap-3 text-xs">{item.href ? <Link className="underline" href={item.openHref || item.href} onClick={() => setOpen(false)}>Open item</Link> : <span>Item no longer available</span>}{!item.readAt ? <Button size="sm" variant="tertiary" isDisabled={Boolean(pending)} onPress={() => void markRead(item.id)}>Mark read</Button> : null}</div></li>)}</ul>
      </Modal.Body>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </>;
}
