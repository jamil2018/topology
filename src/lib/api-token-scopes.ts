export const API_TOKEN_SCOPES = ["read", "ci-write", "agent"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

export function parseTokenScopes(raw: string | null | undefined): ApiTokenScope[] {
  const parts = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(isApiTokenScope);
  return [...new Set(parts)];
}

export function tokenHasScope(
  raw: string | null | undefined,
  required: ApiTokenScope,
): boolean {
  const scopes = parseTokenScopes(raw);
  if (required === "read") {
    return scopes.some(
      (scope) => scope === "read" || scope === "ci-write" || scope === "agent",
    );
  }
  return scopes.includes(required);
}

export function serializeTokenScopes(scopes: ApiTokenScope[]): string {
  const unique = [...new Set(scopes.filter(isApiTokenScope))];
  return unique.length > 0 ? unique.join(",") : "read";
}
