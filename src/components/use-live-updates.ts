"use client";

import { useEffect, useRef, useState } from "react";
import { parseLiveEvent, type LiveEvent } from "@/lib/live-event";

export function useLiveUpdates(
  onEvent: (event: LiveEvent) => void,
  options: { runId?: string; enabled?: boolean; onReconnect?: () => void } = {},
) {
  const { runId, enabled = true, onReconnect } = options;
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const callbacks = useRef({ onEvent, onReconnect });
  useEffect(() => { callbacks.current = { onEvent, onReconnect }; }, [onEvent, onReconnect]);
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const params = new URLSearchParams();
    if (runId) params.set("runId", runId);
    const source = new EventSource(`/api/live?${params.toString()}`);
    let disconnected = false;
    source.onopen = () => {
      setStatus("live");
      if (disconnected) callbacks.current.onReconnect?.();
      disconnected = false;
    };
    source.onerror = () => { disconnected = true; setStatus("reconnecting"); };
    function onMessage(event: MessageEvent<string>) {
      const parsed = parseLiveEvent(event.data);
      if (parsed) callbacks.current.onEvent(parsed);
    }
    source.addEventListener("live", onMessage as EventListener);
    return () => { source.removeEventListener("live", onMessage as EventListener); source.close(); };
  }, [runId, enabled]);
  return status;
}
