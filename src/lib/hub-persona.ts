export type HubPersona = "em" | "qa" | "dev" | "pm";

export function parseHubPersona(
  raw: string | null | undefined,
): HubPersona | null {
  if (raw === "em" || raw === "qa" || raw === "dev" || raw === "pm") return raw;
  return null;
}
