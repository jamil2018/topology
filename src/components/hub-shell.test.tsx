import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import { HubShell } from "./hub-shell";
import { resetQualityGraphPref } from "@/lib/quality-graph-pref";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("./command-palette", () => ({
  openCommandPalette: vi.fn(),
  CommandPalette: () => null,
}));

vi.mock("./shortcut-layer", () => ({
  openCheatSheet: vi.fn(),
  ShortcutLayer: () => null,
}));

vi.mock("./project-switcher", () => ({
  ProjectSwitcher: () => null,
}));

vi.mock("./notifications-bell", () => ({
  NotificationsBell: () => null,
}));

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("./brand-mark", () => ({
  BrandMark: () => <span>Topology</span>,
}));

const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

afterEach(() => {
  cleanup();
  resetQualityGraphPref();
});

describe("HubShell nav diet", () => {
  it("shows promoted core destinations and hides quality-graph by default", () => {
    render(
      <HubShell activeProjectId={workspaceId} userEmail="qa@example.com">
        <p>child</p>
      </HubShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Workspace");
    expect(nav).toHaveTextContent("Home");
    expect(nav).toHaveTextContent("Test cases");
    expect(nav).toHaveTextContent("Plans");
    expect(nav).toHaveTextContent("Test runs");
    expect(nav).toHaveTextContent("Milestones");
    expect(nav).toHaveTextContent("Triage");
    expect(nav).toHaveTextContent("Impact");
    expect(nav).toHaveTextContent("Proposals");
    expect(nav).not.toHaveTextContent("Intents");
    expect(nav).not.toHaveTextContent("Risks");
    expect(nav).not.toHaveTextContent("Components");
    expect(nav).not.toHaveTextContent("Releases");
    expect(
      screen.queryByRole("button", { name: "Quality graph" }),
    ).not.toBeInTheDocument();
  });

  it("reveals quality-graph destinations from the server workspace pref", () => {
    render(
      <HubShell
        activeProjectId={workspaceId}
        qualityGraphEnabled
        userEmail="qa@example.com"
      >
        <p>child</p>
      </HubShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Intents");
    expect(nav).toHaveTextContent("Impact");
    expect(nav).toHaveTextContent("Milestones");
    expect(nav).toHaveTextContent("Risks");
    expect(nav).toHaveTextContent("Components");
    expect(nav).toHaveTextContent("Proposals");
  });
});
