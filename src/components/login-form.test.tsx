import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm, safeCallbackPath } from "./login-form";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("safeCallbackPath", () => {
  it("keeps a same-origin invite path and drops off-site targets", () => {
    expect(safeCallbackPath("/invite/abc")).toBe("/invite/abc");
    expect(safeCallbackPath("https://evil.example/phish")).toBe("/");
    expect(safeCallbackPath("//evil.example/phish")).toBe("/");
    expect(safeCallbackPath("/\\evil")).toBe("/");
  });
});

describe("LoginForm", () => {
  it("renders credentials fields without OAuth when providers are off", () => {
    render(
      <LoginForm oauth={{ github: false, google: false }} airGap />,
    );
    expect(screen.getByRole("heading", { name: "Topology" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.queryByText("Continue with GitHub")).toBeNull();
    expect(screen.queryByText("Continue with Google")).toBeNull();
    expect(
      screen.getByText(/Air-gapped mode\. Sign in with email/i),
    ).toBeTruthy();
  });

  it("shows mocked OAuth buttons when configured (no real IdP)", () => {
    render(
      <LoginForm oauth={{ github: true, google: true }} airGap={false} />,
    );
    expect(screen.getByText("Continue with GitHub")).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
  });
});
