"use client";

import {
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useTheme, type ThemePreference } from "./theme-provider";

const label: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const modes = ["system", "light", "dark"] as const;

const Icon = {
  system: DesktopIcon,
  light: SunIcon,
  dark: MoonIcon,
} as const;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  const activeIndex = Math.max(0, modes.indexOf(preference));
  const iconSize = compact ? 13 : 14;

  return (
    <div
      className={`relative grid grid-cols-3 rounded-full border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-0.5 ${
        compact ? "h-8 w-[5.5rem]" : "h-9 w-[6.75rem]"
      }`}
      role="group"
      aria-label="Color theme"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-[color:var(--topo-panel)] shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {modes.map((mode) => {
        const ModeIcon = Icon[mode];
        const active = preference === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setPreference(mode)}
            className={`relative z-[1] flex items-center justify-center rounded-full transition-colors ${
              active
                ? "text-[color:var(--topo-ink)]"
                : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
            }`}
            aria-label={`${label[mode]} theme`}
            aria-pressed={active}
            title={label[mode]}
          >
            <ModeIcon size={iconSize} weight="bold" />
          </button>
        );
      })}
    </div>
  );
}
