"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@heroui/react";
import { signOut } from "next-auth/react";
import {
  BugIcon,
  CaretRightIcon,
  ChartBarIcon,
  ChartLineIcon,
  CirclesFourIcon,
  FlagIcon,
  GearIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BrandMark } from "./brand-mark";
import { openCommandPalette } from "./command-palette";
import {
  ProjectSwitcher,
  type ProjectOption,
} from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof CirclesFourIcon;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/", label: "Hub", Icon: CirclesFourIcon }],
  },
  {
    id: "testing",
    label: "Testing",
    items: [
      { href: "/cases", label: "Test Cases", Icon: ListChecksIcon },
      { href: "/runs", label: "Test Runs", Icon: PlayCircleIcon },
      { href: "/automation", label: "Automation", Icon: ChartLineIcon },
      { href: "/milestones", label: "Milestones", Icon: FlagIcon },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", Icon: ChartBarIcon },
      { href: "/triage", label: "Triage", Icon: BugIcon },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [{ href: "/settings", label: "Settings", Icon: GearIcon }],
  },
];

const nav: NavItem[] = navGroups.flatMap((group) => group.items);

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({
  pathname,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav className="flex flex-col gap-4 px-2" aria-label="Primary">
      {navGroups.map((group, groupIndex) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          {groupIndex > 0 ? (
            <div
              className="mx-2 mb-2 border-t border-[color:var(--topo-line)]/70"
              aria-hidden
            />
          ) : null}
          {!collapsed ? (
            <p className="mb-1 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
              {group.label}
            </p>
          ) : (
            <span className="sr-only">{group.label}</span>
          )}
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors ${
                  collapsed ? "justify-center px-2 py-2" : "px-2.5 py-1.5"
                } ${
                  active
                    ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                {active && !collapsed ? (
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
                      ? "shrink-0 text-[color:var(--topo-accent)]"
                      : "shrink-0 text-[color:var(--topo-muted)] group-hover:text-[color:var(--topo-ink)]"
                  }
                />
                {!collapsed ? (
                  <span className="font-medium">{item.label}</span>
                ) : (
                  <span className="sr-only">{item.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarChrome({
  userEmail,
  pathname,
  onNavigate,
  collapsed = false,
  projects = [],
  activeProjectId = null,
}: {
  userEmail?: string | null;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  projects?: ProjectOption[];
  activeProjectId?: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center gap-2 px-3 py-3 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className={`flex min-w-0 ${collapsed ? "" : "flex-1"}`}
          title="Topology"
        >
          <BrandMark
            size={26}
            showWordmark={!collapsed}
            eyebrow={collapsed ? undefined : "TCM"}
            priority
          />
        </Link>
      </div>

      <ProjectSwitcher
        projects={projects}
        activeProjectId={activeProjectId}
        collapsed={collapsed}
      />

      <div className="flex-1 overflow-y-auto py-2">
        <NavLinks
          pathname={pathname}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
      </div>

      <div
        className={`space-y-2 border-t border-[color:var(--topo-line)]/70 p-3 ${
          collapsed ? "flex flex-col items-center" : ""
        }`}
      >
        {!collapsed ? <ThemeToggle /> : <ThemeToggle compact />}
        {!collapsed && userEmail ? (
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
          className={
            collapsed
              ? "min-w-0 px-2"
              : "w-full justify-start gap-2"
          }
          aria-label="Sign out"
          onPress={() => signOut({ callbackUrl: "/login" })}
        >
          <SignOutIcon size={14} weight="bold" />
          {!collapsed ? "Sign out" : null}
        </Button>
      </div>
    </div>
  );
}

export function HubShell({
  children,
  userEmail,
  projects = [],
  activeProjectId = null,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  projects?: ProjectOption[];
  activeProjectId?: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "b") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setDesktopCollapsed((value) => !value);
      } else {
        setMobileOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = nav.find((item) => isActivePath(pathname, item.href));
  const currentGroup = navGroups.find((group) =>
    group.items.some((item) => isActivePath(pathname, item.href)),
  );

  return (
    <div className="topology-shell flex min-h-[100dvh] bg-[color:var(--topo-paper)]">
      {/* Desktop sidebar — inset canvas companion */}
      <aside
        className={`sticky top-0 z-30 hidden h-[100dvh] shrink-0 transition-[width] duration-200 ease-out lg:block ${
          desktopCollapsed ? "w-[4.25rem]" : "w-56 xl:w-60"
        }`}
      >
        <SidebarChrome
          userEmail={userEmail}
          pathname={pathname}
          collapsed={desktopCollapsed}
          projects={projects}
          activeProjectId={activeProjectId}
        />
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
              <div className="absolute right-2 top-2 z-10">
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
                projects={projects}
                activeProjectId={activeProjectId}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Inset core-control panel */}
      <div className="flex min-w-0 flex-1 p-2 sm:p-2.5 lg:p-3 lg:pl-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[color:var(--topo-line)] px-2.5 sm:gap-3 sm:px-3">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Open sidebar"
              className="min-w-0 px-2 lg:hidden"
              onPress={() => setMobileOpen(true)}
            >
              <SidebarSimpleIcon size={16} weight="bold" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={
                desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              className="hidden min-w-0 px-2 lg:inline-flex"
              onPress={() => setDesktopCollapsed((value) => !value)}
            >
              <SidebarSimpleIcon size={16} weight="bold" />
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <span className="truncate text-[color:var(--topo-muted)]">
                {currentGroup?.label ?? "Topology"}
              </span>
              <CaretRightIcon
                size={12}
                weight="bold"
                className="shrink-0 text-[color:var(--topo-muted)] opacity-70"
              />
              <span className="truncate font-medium text-[color:var(--topo-ink)]">
                {current?.label ?? "App"}
              </span>
            </div>

            <span title="Search ⌘K">
              <Button
                size="sm"
                variant="secondary"
                aria-label="Search ⌘K"
                className="min-w-0 px-2"
                onPress={() => openCommandPalette()}
              >
                <MagnifyingGlassIcon size={16} weight="bold" />
              </Button>
            </span>
            <span className="lg:hidden">
              <ThemeToggle compact />
            </span>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
