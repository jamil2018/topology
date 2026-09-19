/** Canonical Settings pages (merged from the old per-panel tabs). */
export type SettingsPageId =
  | "account"
  | "projects"
  | "access"
  | "integrations";

export type SettingsAnchor =
  | "profile"
  | "preferences"
  | "members"
  | "roles"
  | "connections"
  | "ci"
  | "repositories"
  | "ai"
  | "webhooks";

export type ResolvedSettingsSection = {
  page: SettingsPageId;
  /** Optional in-page anchor for deep links / legacy tabs. */
  anchor?: SettingsAnchor;
};

export const SETTINGS_NAV: {
  id: SettingsPageId;
  label: string;
  hint: string;
}[] = [
  { id: "account", label: "Account", hint: "You" },
  { id: "projects", label: "Projects", hint: "Workspace" },
  { id: "access", label: "Access", hint: "Members + Roles" },
  { id: "integrations", label: "Integrations", hint: "Connect" },
];

const PAGE_IDS = new Set<string>(SETTINGS_NAV.map((item) => item.id));

/** Legacy `?section=` values and aliases → canonical page (+ optional anchor). */
const SECTION_ALIASES: Record<string, ResolvedSettingsSection> = {
  account: { page: "account" },
  profile: { page: "account", anchor: "profile" },
  preferences: { page: "account", anchor: "preferences" },
  projects: { page: "projects" },
  workspace: { page: "projects" },
  access: { page: "access" },
  members: { page: "access", anchor: "members" },
  roles: { page: "access", anchor: "roles" },
  integrations: { page: "integrations" },
  connections: { page: "integrations", anchor: "connections" },
  ci: { page: "integrations", anchor: "ci" },
  repositories: { page: "integrations", anchor: "repositories" },
  ai: { page: "integrations", anchor: "ai" },
  webhooks: { page: "integrations", anchor: "webhooks" },
};

export function resolveSettingsSection(
  value: string | null | undefined,
): ResolvedSettingsSection {
  if (!value) return { page: "account" };
  const mapped = SECTION_ALIASES[value];
  if (mapped) return mapped;
  if (PAGE_IDS.has(value)) return { page: value as SettingsPageId };
  return { page: "account" };
}

export function settingsHref(
  page: SettingsPageId,
  anchor?: SettingsAnchor,
): string {
  const base = `/settings?section=${page}`;
  return anchor ? `${base}#${anchor}` : base;
}

export function isLegacySettingsSection(value: string | null | undefined): boolean {
  if (!value) return false;
  return Boolean(SECTION_ALIASES[value] && !PAGE_IDS.has(value));
}
