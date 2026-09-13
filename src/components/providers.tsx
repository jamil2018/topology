"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./theme-provider";
import { CommandPalette } from "./command-palette";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <CommandPalette />
      </ThemeProvider>
    </SessionProvider>
  );
}
