import { expect, it } from "vitest";
import { securityHeaders } from "./security-headers";
it("restricts document/API responses and enables HSTS only for configured HTTPS", () => {
  const http = Object.fromEntries(securityHeaders("http://localhost:4317").map(({ key, value }) => [key, value]));
  expect(http["Content-Security-Policy"]).toContain("default-src 'self'");
  expect(http["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(http["Content-Security-Policy"]).not.toContain("unsafe-eval");
  expect(http["X-Content-Type-Options"]).toBe("nosniff");
  expect(http["X-Frame-Options"]).toBe("DENY");
  expect(http["Referrer-Policy"]).toBe("no-referrer");
  expect(http["Strict-Transport-Security"]).toBeUndefined();
  expect(securityHeaders("https://topology.example")).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  expect(securityHeaders(undefined).some(({ key }) => key === "Strict-Transport-Security")).toBe(false);
});
