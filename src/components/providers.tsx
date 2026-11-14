"use client";

import { MotionConfig } from "motion/react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider><MotionConfig reducedMotion="user">{children}</MotionConfig></ThemeProvider>
    </SessionProvider>
  );
}
