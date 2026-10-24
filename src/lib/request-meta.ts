export function clientIp(request: Request | null | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 128) : null;
}

export function clientUserAgent(
  request: Request | null | undefined,
): string | null {
  if (!request) return null;
  const ua = request.headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : null;
}
