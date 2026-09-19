"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { BellIcon } from "@phosphor-icons/react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | Date | null;
  createdAt: string | Date;
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = (await res.json()) as {
      notifications?: NotificationItem[];
      unreadCount?: number;
    };
    setItems(data.notifications ?? []);
    setUnread(data.unreadCount ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    void load();
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative min-w-0 px-2"
        onPress={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <BellIcon size={16} weight="bold" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[90vw] rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-lg">
            <p className="border-b border-[color:var(--topo-line)] px-3 py-2 text-xs font-semibold text-[color:var(--topo-ink)]">
              Notifications
            </p>
            <ul className="max-h-64 overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-3 py-4 text-xs text-[color:var(--topo-muted)]">
                  No notifications yet.
                </li>
              ) : (
                items.map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-[color:var(--topo-line)]/50 px-3 py-2 text-xs last:border-0 ${
                      n.readAt ? "opacity-70" : "bg-[color:var(--topo-chip)]/30"
                    }`}
                  >
                    <p className="font-medium text-[color:var(--topo-ink)]">
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[color:var(--topo-muted)]">
                        {n.body}
                      </p>
                    ) : null}
                    {!n.readAt ? (
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-[color:var(--topo-accent)]"
                        onClick={() => void markRead(n.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
