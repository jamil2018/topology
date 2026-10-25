"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  QUALITY_GRAPH_CHANGE,
  dismissQualityGraphExplainer,
  emitQualityGraphChange,
  readQualityGraphExplainerDismissed,
} from "@/lib/quality-graph-pref";

type QualityGraphContextValue = {
  workspaceId: string | null;
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  showExplainer: boolean;
  dismissExplainer: () => void;
};

const QualityGraphContext = createContext<QualityGraphContextValue | null>(
  null,
);

export function QualityGraphProvider({
  workspaceId,
  initialEnabled = false,
  children,
}: {
  workspaceId: string | null;
  initialEnabled?: boolean;
  children: React.ReactNode;
}) {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    setEnabledState(initialEnabled);
    setShowExplainer(false);
  }, [workspaceId, initialEnabled]);

  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { workspaceId?: string; enabled?: boolean }
        | undefined;
      if (!detail || detail.workspaceId !== workspaceId) return;
      setEnabledState(Boolean(detail.enabled));
    }
    window.addEventListener(QUALITY_GRAPH_CHANGE, onChange);
    return () => window.removeEventListener(QUALITY_GRAPH_CHANGE, onChange);
  }, [workspaceId]);

  const setEnabled = useCallback(
    (next: boolean) => {
      const previous = enabled;
      setEnabledState(next);
      if (next && !readQualityGraphExplainerDismissed()) {
        setShowExplainer(true);
      }
      if (!next) setShowExplainer(false);
      emitQualityGraphChange(workspaceId, next);
      if (!workspaceId) return;
      void fetch("/api/workspace/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualityGraphEnabled: next }),
      }).then((res) => {
        if (res.ok) return;
        setEnabledState(previous);
        emitQualityGraphChange(workspaceId, previous);
      });
    },
    [enabled, workspaceId],
  );

  const dismissExplainer = useCallback(() => {
    setShowExplainer(false);
    dismissQualityGraphExplainer();
  }, []);

  const value = useMemo(
    () => ({
      workspaceId,
      enabled,
      setEnabled,
      showExplainer,
      dismissExplainer,
    }),
    [workspaceId, enabled, setEnabled, showExplainer, dismissExplainer],
  );

  return (
    <QualityGraphContext.Provider value={value}>
      {children}
    </QualityGraphContext.Provider>
  );
}

export function useQualityGraph() {
  const ctx = useContext(QualityGraphContext);
  return (
    ctx ?? {
      workspaceId: null,
      enabled: false,
      setEnabled: () => {},
      showExplainer: false,
      dismissExplainer: () => {},
    }
  );
}
