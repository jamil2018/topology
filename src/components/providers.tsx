"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./theme-provider";
import { CommandPalette } from "./command-palette";
import { ShortcutLayer } from "./shortcut-layer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <CommandPalette />
        <ShortcutLayer />
      </ThemeProvider>
    </SessionProvider>
  );
}
