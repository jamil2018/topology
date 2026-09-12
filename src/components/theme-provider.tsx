"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useSession } from "next-auth/react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "topology-theme";

type SetPreferenceOptions = {
  /** When false, skip PATCH /api/settings (e.g. hydrating from server). Default true. */
  syncServer?: boolean;
};

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (
    next: ThemePreference,
    options?: SetPreferenceOptions,
  ) => void;
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved = resolve(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

let preferenceSnapshot: ThemePreference = "system";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (preferenceSnapshot === "system") {
      applyTheme("system");
      emit();
    }
  };
  mq.addEventListener("change", onSystem);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      preferenceSnapshot = readPreference();
      applyTheme(preferenceSnapshot);
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ThemePreference {
  return preferenceSnapshot;
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

function bootstrapClient() {
  if (typeof window === "undefined") return;
  preferenceSnapshot = readPreference();
  applyTheme(preferenceSnapshot);
}

bootstrapClient();

async function persistThemeToServer(next: ThemePreference) {
  try {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: { themePreference: next },
      }),
    });
  } catch {
    // localStorage remains the fallback
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const hydratedFromServer = useRef(false);

  const preference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setPreference = useCallback(
    (next: ThemePreference, options?: SetPreferenceOptions) => {
      preferenceSnapshot = next;
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      applyTheme(next);
      emit();
      if (options?.syncServer !== false && status === "authenticated") {
        void persistThemeToServer(next);
      }
    },
    [status],
  );

  const cyclePreference = useCallback(() => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(preferenceSnapshot) + 1) % order.length];
    setPreference(next);
  }, [setPreference]);

  useEffect(() => {
    if (status !== "authenticated" || hydratedFromServer.current) return;
    hydratedFromServer.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          preferences?: { themePreference?: ThemePreference };
        };
        const serverTheme = data.preferences?.themePreference;
        if (
          serverTheme === "light" ||
          serverTheme === "dark" ||
          serverTheme === "system"
        ) {
          // Server wins for logged-in users; keep localStorage in sync
          setPreference(serverTheme, { syncServer: false });
        }
      } catch {
        // keep localStorage
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, setPreference]);

  const resolved = resolve(preference);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, cyclePreference }),
    [preference, resolved, setPreference, cyclePreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
