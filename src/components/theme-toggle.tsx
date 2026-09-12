"use client";

import { Button } from "@heroui/react";
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

const Icon = {
  system: DesktopIcon,
  light: SunIcon,
  dark: MoonIcon,
} as const;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference, cyclePreference } = useTheme();
  const Glyph = Icon[preference];

  if (compact) {
    return (
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Theme: ${label[preference]}. Click to cycle.`}
        onPress={cyclePreference}
        className="min-w-0 gap-1.5 px-2"
      >
        <Glyph size={14} weight="bold" />
        <span className="font-mono text-[10px] uppercase tracking-wide">
          {preference === "system" ? "sys" : preference.slice(0, 3)}
        </span>
      </Button>
    );
  }

  return (
    <div
      className="grid grid-cols-3 gap-0.5 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-0.5"
      role="group"
      aria-label="Color theme"
    >
      {(["system", "light", "dark"] as const).map((mode) => {
        const ModeIcon = Icon[mode];
        const active = preference === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setPreference(mode)}
            className={`flex items-center justify-center gap-1 rounded-[5px] px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
              active
                ? "bg-[color:var(--topo-panel)] text-[color:var(--topo-ink)] shadow-sm"
                : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
            }`}
            aria-pressed={active}
            title={label[mode]}
          >
            <ModeIcon size={12} weight="bold" />
            <span className="hidden xl:inline">{mode === "system" ? "Auto" : label[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
