/** Baseline response policy; HSTS is emitted only for a configured HTTPS origin. */
export function securityHeaders(origin: string | undefined, development = false) {
  let https = false;
  try { https = new URL(origin ?? "").protocol === "https:"; } catch { /* local HTTP default */ }
  return [
    { key: "Content-Security-Policy", value: [
      "default-src 'self'", `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
      `connect-src 'self'${development ? " ws: wss:" : ""}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join("; ") },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}
