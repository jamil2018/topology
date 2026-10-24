export type NavItemDef = {
  href: string;
  label: string;
  hint?: string;
};

export type NavGroupDef = {
  id: string;
  label: string;
  items: NavItemDef[];
};

/** Always-on TCM nav. Plans stay here — they are core test management, not the quality graph. */
export const DEFAULT_NAV_HREFS = [
  "/",
  "/cases",
  "/plans",
  "/runs",
  "/automation",
  "/triage",
  "/reports",
  "/settings",
] as const;

/** Hidden until the per-workspace Quality graph toggle is on. */
export const QUALITY_GRAPH_HREFS = [
  "/intents",
  "/impact",
  "/milestones",
  "/releases",
  "/journeys",
  "/requirements",
  "/risks",
  "/components",
  "/proposals",
] as const;

export const DEFAULT_NAV_GROUPS: NavGroupDef[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/", label: "Hub", hint: "Pulse" }],
  },
  {
    id: "testing",
    label: "Testing",
    items: [
      { href: "/cases", label: "Test cases", hint: "Suites" },
      { href: "/plans", label: "Plans", hint: "Matrix" },
      { href: "/runs", label: "Test runs", hint: "Manual" },
      { href: "/automation", label: "Automation", hint: "CI" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { href: "/triage", label: "Triage", hint: "Failures" },
      { href: "/reports", label: "Reports", hint: "Charts" },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [{ href: "/settings", label: "Settings", hint: "Account" }],
  },
];

export const QUALITY_GRAPH_NAV_GROUP: NavGroupDef = {
  id: "quality-graph",
  label: "Quality graph",
  items: [
    { href: "/intents", label: "Intents", hint: "Behavior" },
    { href: "/impact", label: "Impact", hint: "Blast radius" },
    { href: "/milestones", label: "Milestones", hint: "Readiness" },
    { href: "/releases", label: "Releases", hint: "Control" },
    { href: "/journeys", label: "Journeys", hint: "Paths" },
    { href: "/requirements", label: "Requirements", hint: "Graph" },
    { href: "/risks", label: "Risks", hint: "Mitigations" },
    { href: "/components", label: "Components", hint: "Ownership" },
    { href: "/proposals", label: "Proposals", hint: "Review" },
  ],
};

/** Every destination the command palette must list, including quality-graph pages. */
export const PALETTE_PAGES: NavItemDef[] = [
  { href: "/", label: "Hub", hint: "Pulse" },
  { href: "/cases", label: "Test cases", hint: "Suites" },
  { href: "/plans", label: "Plans", hint: "Matrix" },
  { href: "/runs", label: "Test runs", hint: "Manual" },
  { href: "/automation", label: "Automation", hint: "CI" },
  { href: "/triage", label: "Triage", hint: "Failures" },
  { href: "/reports", label: "Reports", hint: "Charts" },
  { href: "/settings", label: "Settings", hint: "Account" },
  { href: "/intents", label: "Intents", hint: "Behavior" },
  { href: "/impact", label: "Impact", hint: "Blast radius" },
  { href: "/milestones", label: "Milestones", hint: "Readiness" },
  { href: "/releases", label: "Releases", hint: "Control" },
  { href: "/journeys", label: "Journeys", hint: "Paths" },
  { href: "/requirements", label: "Requirements", hint: "Graph" },
  { href: "/risks", label: "Risks", hint: "Mitigations" },
  { href: "/components", label: "Components", hint: "Ownership" },
  { href: "/proposals", label: "Proposals", hint: "Review" },
  { href: "/connect", label: "Connect", hint: "Agent" },
];

const QUALITY_SET = new Set<string>(QUALITY_GRAPH_HREFS);

export function isQualityGraphHref(href: string): boolean {
  return QUALITY_SET.has(href);
}

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Sidebar groups for the current workspace preference.
 * Quality-graph pages stay visible when the user is already on one so they
 * are not stranded after a refresh with the toggle off.
 */
export function visibleNavGroups(
  qualityGraphEnabled: boolean,
  pathname = "",
): NavGroupDef[] {
  const groups = DEFAULT_NAV_GROUPS.map((group) => ({
    ...group,
    items: [...group.items],
  }));
  const showQuality =
    qualityGraphEnabled ||
    QUALITY_GRAPH_NAV_GROUP.items.some((item) =>
      isActivePath(pathname, item.href),
    );
  if (showQuality) {
    const insertAt = groups.findIndex((g) => g.id === "account");
    const qualityGroup = {
      ...QUALITY_GRAPH_NAV_GROUP,
      items: qualityGraphEnabled
        ? [...QUALITY_GRAPH_NAV_GROUP.items]
        : QUALITY_GRAPH_NAV_GROUP.items.filter((item) =>
            isActivePath(pathname, item.href),
          ),
    };
    if (insertAt === -1) groups.push(qualityGroup);
    else groups.splice(insertAt, 0, qualityGroup);
  }
  return groups;
}

export function visibleNavItems(
  qualityGraphEnabled: boolean,
  pathname = "",
): NavItemDef[] {
  return visibleNavGroups(qualityGraphEnabled, pathname).flatMap(
    (group) => group.items,
  );
}

/** Palette destinations that respect the workspace quality-graph toggle. */
export function visiblePalettePages(
  qualityGraphEnabled: boolean,
): NavItemDef[] {
  if (qualityGraphEnabled) return [...PALETTE_PAGES];
  return PALETTE_PAGES.filter((page) => !isQualityGraphHref(page.href));
}
