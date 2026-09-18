/** Same-origin path only. Drops absolute, protocol-relative, and backslash URLs. */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\")
  ) {
    return "/";
  }
  if (raw.includes("\\") || raw.includes("://") || /[\u0000\r\n]/.test(raw)) {
    return "/";
  }
  return raw;
}
