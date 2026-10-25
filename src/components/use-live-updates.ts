"use client";

import { useEffect } from "react";
import { parseLiveEvent, type LiveEvent } from "@/lib/live-event";

export function useLiveUpdates(
  onEvent: (event: LiveEvent) => void,
  options: { runId?: string; enabled?: boolean } = {},
) {
  const { runId, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    if (typeof EventSource === "undefined") return;
    const params = new URLSearchParams();
    if (runId) params.set("runId", runId);
    const source = new EventSource(`/api/live?${params.toString()}`);

    function onMessage(ev: MessageEvent<string>) {
      const event = parseLiveEvent(ev.data);
      if (event) onEvent(event);
    }

    source.addEventListener("live", onMessage as EventListener);
    return () => {
      source.removeEventListener("live", onMessage as EventListener);
      source.close();
    };
  }, [onEvent, runId, enabled]);
}
