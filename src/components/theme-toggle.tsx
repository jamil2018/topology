"use client";

import {
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import type { Selection } from "@heroui/react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
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
  const iconSize = compact ? 13 : 14;

  return (
    <ToggleButtonGroup
      aria-label="Color theme"
      selectionMode="single"
      disallowEmptySelection
      size="sm"
      isDetached
      className={`rounded-full border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-0.5 ${
        compact ? "h-8 w-[5.5rem]" : "h-9 w-[6.75rem]"
      }`}
      selectedKeys={new Set([preference])}
      onSelectionChange={(keys: Selection) => {
        if (keys === "all") return;
        const next = [...keys][0];
        if (next == null) return;
        setPreference(String(next) as ThemePreference);
      }}
    >
      {modes.map((mode) => {
        const ModeIcon = Icon[mode];
        return (
          <ToggleButton
            key={mode}
            id={mode}
            aria-label={`${label[mode]} theme`}
            className="flex flex-1 items-center justify-center rounded-full px-0"
          >
            <ModeIcon size={iconSize} weight="bold" />
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
