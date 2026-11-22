"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Button, Modal } from "@heroui/react";
import { signOut } from "next-auth/react";
import {
  ArticleIcon,
  BugIcon,
  CaretRightIcon,
  ChartBarIcon,
  ChartLineIcon,
  CirclesFourIcon,
  CrosshairIcon,
  CubeIcon,
  FlagCheckeredIcon,
  FlagIcon,
  GearIcon,
  HouseIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  PlayCircleIcon,
  QuestionIcon,
  RocketLaunchIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SparkleIcon,
  TargetIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BrandMark } from "./brand-mark";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { ShortcutLayer, openCheatSheet } from "./shortcut-layer";
import {
  ProjectSwitcher,
  type ProjectOption,
} from "./project-switcher";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import {
  QualityGraphProvider,
  useQualityGraph,
} from "./quality-graph-provider";
import {
  isActivePath,
  visibleNavGroups,
  visibleNavItems,
  type NavGroupDef,
  type NavItemDef,
} from "@/lib/nav-diet";

const SIDEBAR_PREF = "topology:sidebar-collapsed";
function subscribeSidebar(listener: () => void) { window.addEventListener(SIDEBAR_PREF, listener); window.addEventListener("storage", listener); return () => { window.removeEventListener(SIDEBAR_PREF, listener); window.removeEventListener("storage", listener); }; }
function readSidebar() { try { return localStorage.getItem(SIDEBAR_PREF) === "1"; } catch { return false; } }
type NavIcon = typeof CirclesFourIcon;

/** Distinct icons per destination so collapsed icon-only mode never collides in-group. */
const NAV_ICONS: Record<string, NavIcon> = {
  "/": HouseIcon,
  "/cases": ListChecksIcon,
  "/plans": FlagIcon,
  "/runs": PlayCircleIcon,
  "/automation": ChartLineIcon,
  "/triage": BugIcon,
  "/reports": ChartBarIcon,
  "/settings": GearIcon,
  "/intents": TargetIcon,
  "/impact": CrosshairIcon,
  "/milestones": FlagCheckeredIcon,
  "/releases": RocketLaunchIcon,
  "/journeys": MapTrifoldIcon,
  "/requirements": ArticleIcon,
  "/risks": WarningIcon,
  "/components": CubeIcon,
  "/proposals": SparkleIcon,
};

function iconFor(href: string): NavIcon {
  return NAV_ICONS[href] ?? CirclesFourIcon;
}

const SUB_ROUTE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^\/cases\/import(?:\/|$)/, label: "Import" },
  { match: /^\/runs\/new(?:\/|$)/, label: "New run" },
  { match: /^\/releases\/compare(?:\/|$)/, label: "Compare" },
  { match: /^\/milestones\/[^/]+$/, label: "Detail" },
  { match: /^\/runs\/[^/]+$/, label: "Run" },
  { match: /^\/reports\/[^/]+$/, label: "Report" },
  { match: /^\/plans\/[^/]+$/, label: "Detail" },
];

function resolveSubRouteLabel(pathname: string, parentHref: string | null) {
  if (!parentHref || pathname === parentHref) return null;
  for (const entry of SUB_ROUTE_LABELS) {
    if (entry.match.test(pathname)) return entry.label;
  }
  const rest = pathname.slice(parentHref === "/" ? 0 : parentHref.length);
  if (!rest || rest === "/") return null;
  const segment = rest.replace(/^\//, "").split("/")[0];
  if (!segment || /^[0-9a-f-]{8,}$/i.test(segment)) return "Detail";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveBreadcrumb(
  pathname: string,
  nav: NavItemDef[],
  groups: NavGroupDef[],
) {
  const current =
    nav.find((item) => isActivePath(pathname, item.href)) ?? null;
  const currentGroup =
    groups.find((group) =>
      group.items.some((item) => isActivePath(pathname, item.href)),
    ) ?? null;
  const fallbackPages: Record<string, string> = {
    "/connect": "Connect",
  };
  const primary =
    current?.label ??
    fallbackPages[pathname] ??
    (pathname.startsWith("/connect") ? "Connect" : null) ??
    "App";
  const secondary = resolveSubRouteLabel(pathname, current?.href ?? null);
  return {
    groupLabel: currentGroup?.label ?? "Topology",
    primaryLabel: primary,
    secondaryLabel: secondary,
  };
}

function NavLinks({
  pathname,
  groups,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  groups: NavGroupDef[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav className="flex flex-col gap-4 px-2" aria-label="Primary">
      {groups.map((group, groupIndex) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          {groupIndex > 0 ? (
            <div
              className="mx-2 mb-2 border-t border-[color:var(--topo-line)]/70"
              aria-hidden
            />
          ) : null}
          {!collapsed ? (
            <p className="mb-1 px-2.5 text-xs font-medium text-[color:var(--topo-muted)]">
              {group.label}
            </p>
          ) : (
            <span className="sr-only">{group.label}</span>
          )}
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = iconFor(item.href);
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
  groups,
  onNavigate,
  collapsed = false,
  projects = [],
  activeProjectId = null,
}: {
  userEmail?: string | null;
  pathname: string;
  groups: NavGroupDef[];
  onNavigate?: () => void;
  collapsed?: boolean;
  projects?: ProjectOption[];
  activeProjectId?: string | null;
}) {
  const { showExplainer, dismissExplainer } = useQualityGraph();
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
          groups={groups}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
      </div>

      <div
        className={`space-y-2 border-t border-[color:var(--topo-line)]/70 p-3 ${
          collapsed ? "flex flex-col items-center" : ""
        }`}
      >
        {showExplainer && !collapsed ? (
          <div
            role="note"
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/40 p-2.5"
          >
            <p className="text-xs leading-relaxed text-[color:var(--topo-muted)]">
              Quality graph adds intents, releases, journeys, requirements,
              risks, and components — the model behind coverage analysis.
              Milestones, impact, and proposals stay in the main nav.
            </p>
            <button
              type="button"
              className="mt-1.5 text-xs font-medium text-[color:var(--topo-accent)] hover:underline"
              onClick={dismissExplainer}
            >
              Got it
            </button>
          </div>
        ) : null}
        {!collapsed ? <ThemeToggle /> : <ThemeToggle compact />}
        {!collapsed && userEmail ? (
          <p
            className="truncate font-mono text-xs text-[color:var(--topo-muted)]"
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
  qualityGraphEnabled = false,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  projects?: ProjectOption[];
  activeProjectId?: string | null;
  qualityGraphEnabled?: boolean;
}) {
  return (
    <QualityGraphProvider
      workspaceId={activeProjectId}
      initialEnabled={qualityGraphEnabled}
    >
      <CommandPalette />
      <ShortcutLayer />
      <HubShellInner
        userEmail={userEmail}
        projects={projects}
        activeProjectId={activeProjectId}
      >
        {children}
      </HubShellInner>
    </QualityGraphProvider>
  );
}

function HubShellInner({
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
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const groups = visibleNavGroups(qualityGraphEnabled, pathname);
  const nav = visibleNavItems(qualityGraphEnabled, pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopCollapsed = useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
  const setDesktopCollapsed = (next: boolean | ((previous: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(readSidebar()) : next;
    try { localStorage.setItem(SIDEBAR_PREF, value ? "1" : "0"); } catch { /* Storage unavailable. */ }
    window.dispatchEvent(new Event(SIDEBAR_PREF));
  };
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

  const breadcrumb = resolveBreadcrumb(pathname, nav, groups);

  return (
    <div className="topology-shell flex min-h-[100dvh] bg-[color:var(--topo-paper)]">
      <a href="#main-content" className="topo-skip-link">Skip to content</a>
      {/* Desktop sidebar — inset canvas companion */}
      <aside
        className={`sticky top-0 z-30 hidden h-[100dvh] shrink-0 transition-[width] duration-200 ease-out lg:block ${
          desktopCollapsed ? "w-[4.25rem]" : "w-56 xl:w-60"
        }`}
      >
        <SidebarChrome
          userEmail={userEmail}
          pathname={pathname}
          groups={groups}
          collapsed={desktopCollapsed}
          projects={projects}
          activeProjectId={activeProjectId}
        />
      </aside>

      {/* Mobile drawer */}
      <Modal.Backdrop isOpen={mobileOpen} onOpenChange={setMobileOpen} className="lg:hidden">
        <Modal.Container className="items-start justify-start p-0">
          <Modal.Dialog aria-label="Navigation" className="h-[100dvh] w-[min(18rem,88vw)] rounded-none bg-[color:var(--topo-sidebar)]">
            <Button size="sm" variant="tertiary" aria-label="Close sidebar" onPress={() => setMobileOpen(false)}><XIcon size={16} />Close</Button>
            <div className="h-[calc(100dvh-3rem)]"><SidebarChrome userEmail={userEmail} pathname={pathname} groups={groups} onNavigate={() => setMobileOpen(false)} projects={projects} activeProjectId={activeProjectId} /></div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Inset core-control panel — sits flush beside sidebar (gutter ≤ px-10) */}
      <div className="flex min-w-0 flex-1 p-2 pl-1 sm:p-2.5 sm:pl-1.5 lg:p-3 lg:pl-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
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
                {breadcrumb.secondaryLabel
                  ? breadcrumb.primaryLabel
                  : breadcrumb.groupLabel}
              </span>
              <CaretRightIcon
                size={12}
                weight="bold"
                className="shrink-0 text-[color:var(--topo-muted)] opacity-70"
              />
              <span className="truncate font-medium text-[color:var(--topo-ink)]">
                {breadcrumb.secondaryLabel ?? breadcrumb.primaryLabel}
              </span>
            </div>

            <NotificationsBell key={activeProjectId} />
            <span title="Keyboard shortcuts ?">
              <Button
                size="sm"
                variant="secondary"
                aria-label="Keyboard shortcuts"
                className="min-w-0 px-2"
                onPress={() => openCheatSheet()}
              >
                <QuestionIcon size={16} weight="bold" />
              </Button>
            </span>
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

          <main
            id="main-content" tabIndex={-1}
            key={activeProjectId ?? "none"}
            className="w-full max-w-none flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
