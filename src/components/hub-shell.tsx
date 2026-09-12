"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@heroui/react";
import { signOut } from "next-auth/react";
import {
  BugIcon,
  ChartLineIcon,
  CirclesFourIcon,
  GearIcon,
  ListChecksIcon,
  PlayCircleIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { href: "/", label: "Hub", hint: "Pulse", Icon: CirclesFourIcon },
  { href: "/cases", label: "Test Cases", hint: "Suites", Icon: ListChecksIcon },
  { href: "/runs", label: "Test Runs", hint: "Manual", Icon: PlayCircleIcon },
  { href: "/reports", label: "Reports", hint: "Charts", Icon: ChartLineIcon },
  { href: "/triage", label: "Triage", hint: "Failures", Icon: BugIcon },
  { href: "/settings", label: "Settings", hint: "Account", Icon: GearIcon },
] as const;

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Primary">
      {nav.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.Icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                : "text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[color:var(--topo-accent)]"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <Icon
              size={16}
              weight={active ? "fill" : "regular"}
              className={
                active
                  ? "text-[color:var(--topo-accent)]"
                  : "text-[color:var(--topo-muted)] group-hover:text-[color:var(--topo-ink)]"
              }
            />
            <span className="flex-1 font-medium">{item.label}</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] opacity-70">
              {item.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarChrome({
  userEmail,
  pathname,
  onNavigate,
}: {
  userEmail?: string | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[color:var(--topo-line)] px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 flex-1"
        >
          <BrandMark size={26} showWordmark eyebrow="TCM" priority />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <p className="mb-1.5 px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
          Workspace
        </p>
        <NavLinks pathname={pathname} onNavigate={onNavigate} />
      </div>

      <div className="space-y-2 border-t border-[color:var(--topo-line)] p-3">
        <ThemeToggle />
        {userEmail ? (
          <p
            className="truncate font-mono text-[11px] text-[color:var(--topo-muted)]"
            title={userEmail}
          >
            {userEmail}
          </p>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-start gap-2"
          onPress={() => signOut({ callbackUrl: "/login" })}
        >
          <SignOutIcon size={14} weight="bold" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function HubShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openForPath, setOpenForPath] = useState(pathname);

  if (openForPath !== pathname) {
    setOpenForPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const current = nav.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  return (
    <div className="topology-shell flex min-h-[100dvh]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-30 hidden h-[100dvh] w-56 shrink-0 border-r border-[color:var(--topo-line)] bg-[color:var(--topo-sidebar)] lg:block xl:w-60">
        <SidebarChrome userEmail={userEmail} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] border-r border-[color:var(--topo-line)] bg-[color:var(--topo-sidebar)] shadow-xl lg:hidden"
              initial={{ x: -24, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
            >
              <div className="absolute right-2 top-2">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label="Close sidebar"
                  className="min-w-0 px-2"
                  onPress={() => setMobileOpen(false)}
                >
                  <XIcon size={14} weight="bold" />
                </Button>
              </div>
              <SidebarChrome
                userEmail={userEmail}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]/90 px-3 backdrop-blur-md lg:hidden">
          <Button
            size="sm"
            variant="secondary"
            aria-label="Open sidebar"
            className="min-w-0 px-2"
            onPress={() => setMobileOpen(true)}
          >
            <SidebarSimpleIcon size={16} weight="bold" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark size={22} showWordmark={false} />
            <div className="min-w-0">
              <div className="truncate font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                {current?.label ?? "App"}
              </div>
            </div>
          </div>
          <ThemeToggle compact />
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
