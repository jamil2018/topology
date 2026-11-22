import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";

function authorized(
  pathname: string,
  auth: { user?: { id: string } } | null,
): boolean {
  const callback = authConfig.callbacks?.authorized;
  if (!callback) throw new Error("authorized callback missing");
  return Boolean(
    callback({
      auth: auth as never,
      request: { nextUrl: { pathname } } as never,
    }),
  );
}

describe("authConfig.authorized", () => {
  it("allows login and nextauth routes without a session", () => {
    expect(authorized("/login", null)).toBe(true);
    expect(authorized("/setup", null)).toBe(true);
    expect(authorized("/api/setup", null)).toBe(true);
    expect(authorized("/api/auth/callback/github", null)).toBe(true);
  });

  it("allows CI, agent, executions, and releases APIs without a session (Bearer handled in-route)", () => {
    expect(authorized("/api/ci/junit", null)).toBe(true);
    expect(authorized("/api/ci/runs", null)).toBe(true);
    expect(authorized("/api/agent", null)).toBe(true);
    expect(authorized("/api/executions", null)).toBe(true);
    expect(authorized("/api/releases/analyze", null)).toBe(true);
    expect(authorized("/api/releases/compare", null)).toBe(true);
    expect(authorized("/api/webhooks/github", null)).toBe(true);
  });

  it("allows exact CLI bearer endpoints while keeping neighboring session APIs private", () => {
    for (const route of ["/api/affected", "/api/coverage", "/api/query", "/api/git/ingest"]) expect(authorized(route, null)).toBe(true);
    for (const route of ["/api/coverage/snapshots", "/api/query/admin", "/api/git/repositories"]) expect(authorized(route, null)).toBe(false);
  });

  it("allows only signed-report page, export, and attachment routes to validate their tokens", () => {
    expect(authorized("/share/reports/signed-token", null)).toBe(true);
    expect(authorized("/api/share/reports/signed-token/export", null)).toBe(true);
    expect(
      authorized(
        "/api/share/reports/signed-token/attachments/11111111-2222-4333-8444-555555555555",
        null,
      ),
    ).toBe(true);
    expect(authorized("/share/reports", null)).toBe(false);
    expect(authorized("/share/reports/token/admin", null)).toBe(false);
    expect(authorized("/api/share/reports/token", null)).toBe(false);
    expect(authorized("/api/share/reports/token/attachments", null)).toBe(false);
    expect(
      authorized("/api/share/reports/token/attachments/id/extra", null),
    ).toBe(false);
  });

  it("allows Next.js internals", () => {
    expect(authorized("/_next/static/chunks/app.js", null)).toBe(true);
  });

  it("requires a session for product pages and session APIs", () => {
    expect(authorized("/", null)).toBe(false);
    expect(authorized("/runs", null)).toBe(false);
    expect(authorized("/api/issues", null)).toBe(false);
    expect(authorized("/", { user: { id: "u1" } })).toBe(true);
  });
});
