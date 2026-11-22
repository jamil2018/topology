/** Cookie + helpers for SSR-safe Hub home/overview view preference. */

export type HubViewPref = "home" | "overview";

export const HUB_VIEW_COOKIE_PREFIX = "topology-hub-view-";

export function hubViewCookieName(projectId: string): string {
  return `${HUB_VIEW_COOKIE_PREFIX}${projectId}`;
}

export function parseHubViewPref(
  raw: string | null | undefined,
): HubViewPref {
  return raw === "overview" ? "overview" : "home";
}

export function readHubViewCookie(
  cookieStore: { get: (name: string) => { value: string } | undefined },
  projectId: string,
): HubViewPref | null {
  const raw = cookieStore.get(hubViewCookieName(projectId))?.value;
  if (raw === "overview" || raw === "home") return raw;
  return null;
}

/** Client-written, server-readable (not HttpOnly). */
export function writeHubViewCookie(projectId: string, view: HubViewPref): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${hubViewCookieName(projectId)}=${view}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
  } catch {
    /* Cookie write unavailable. */
  }
}
