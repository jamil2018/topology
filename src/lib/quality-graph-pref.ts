/** Client helpers for the quality-graph explainer. Enabled state lives on the workspace. */
export const QUALITY_GRAPH_CHANGE = "topology:quality-graph";
export const QUALITY_GRAPH_EXPLAINER_KEY = "topology-quality-graph-explainer";

const memory = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    /* jsdom / node without web storage */
  }
  return memory.get(key) ?? null;
}

function storageSet(key: string, value: string) {
  memory.set(key, value);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

export function readQualityGraphExplainerDismissed(): boolean {
  return storageGet(QUALITY_GRAPH_EXPLAINER_KEY) === "1";
}

export function dismissQualityGraphExplainer() {
  storageSet(QUALITY_GRAPH_EXPLAINER_KEY, "1");
}

export function emitQualityGraphChange(
  workspaceId: string | null,
  enabled: boolean,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(QUALITY_GRAPH_CHANGE, {
      detail: { workspaceId, enabled },
    }),
  );
}

export function resetQualityGraphPref() {
  memory.clear();
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(QUALITY_GRAPH_EXPLAINER_KEY);
    }
  } catch {
    /* ignore */
  }
}
