import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CommandPalette,
  openCommandPalette,
  publishPaletteFocus,
} from "./command-palette";
import { QualityGraphProvider } from "./quality-graph-provider";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/cases",
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  publishPaletteFocus({ kind: "none" });
});

function renderPalette(qualityGraphEnabled = false) {
  return render(
    <QualityGraphProvider
      workspaceId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
      initialEnabled={qualityGraphEnabled}
    >
      <CommandPalette />
    </QualityGraphProvider>,
  );
}

describe("CommandPalette coverage", () => {
  it("lists core destinations and hides quality-graph pages when the toggle is off", async () => {
    renderPalette(false);
    openCommandPalette();

    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();

    const optionLabels = screen
      .getAllByRole("option")
      .map((el) => el.querySelector("span.min-w-0")?.textContent?.trim());
    for (const label of [
      "Hub",
      "Test cases",
      "Plans",
      "Test runs",
      "Automation",
      "Triage",
      "Reports",
      "Settings",
      "Import cases",
    ]) {
      expect(optionLabels).toContain(label);
    }
    expect(optionLabels).not.toContain("Intents");
    expect(optionLabels).not.toContain("Impact");
  });

  it("lists quality-graph destinations when the workspace toggle is on", async () => {
    const user = userEvent.setup();
    renderPalette(true);
    openCommandPalette();

    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();

    const optionLabels = screen
      .getAllByRole("option")
      .map((el) => el.querySelector("span.min-w-0")?.textContent?.trim());
    for (const label of [
      "Intents",
      "Impact",
      "Milestones",
      "Releases",
      "Journeys",
      "Requirements",
      "Risks",
      "Components",
      "Proposals",
    ]) {
      expect(optionLabels).toContain(label);
    }

    const impact = screen
      .getAllByRole("option")
      .find(
        (el) => el.querySelector("span.min-w-0")?.textContent?.trim() === "Impact",
      );
    expect(impact).toBeTruthy();
    await user.click(impact!);
    expect(push).toHaveBeenCalledWith("/impact");
  });

  it("lists contextual commands for the focused case", async () => {
    const user = userEvent.setup();
    publishPaletteFocus({
      kind: "case",
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      key: "TOP-1",
      title: "Opens the suite",
      status: "draft",
      priority: "P2",
      selectedIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });
    renderPalette(false);
    openCommandPalette();

    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();

    const optionLabels = screen
      .getAllByRole("option")
      .map((el) => el.querySelector("span.min-w-0")?.textContent?.trim());
    expect(optionLabels).toContain("Set TOP-1 status to Ready");
    expect(optionLabels).toContain("Start run with TOP-1");
    expect(optionLabels).not.toContain("Intents");

    const startRun = screen
      .getAllByRole("option")
      .find(
        (el) =>
          el.querySelector("span.min-w-0")?.textContent?.trim() ===
          "Start run with TOP-1",
      );
    expect(startRun).toBeTruthy();
    await user.click(startRun!);
    expect(push).toHaveBeenCalledWith(
      "/runs/new?cases=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
  });
});
