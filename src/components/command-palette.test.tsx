import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
      "Home",
      "Test cases",
      "Plans",
      "Test runs",
      "Automation",
      "Milestones",
      "Triage",
      "Impact",
      "Proposals",
      "Reports",
      "Settings",
      "Import cases",
    ]) {
      expect(optionLabels).toContain(label);
    }
    expect(optionLabels).not.toContain("Intents");
    expect(optionLabels).not.toContain("Risks");
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

  it("routes Connect agent to integrations#agent", async () => {
    const user = userEvent.setup();
    renderPalette(false);
    openCommandPalette();

    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();

    const connectAgent = screen
      .getAllByRole("option")
      .find(
        (el) =>
          el.querySelector("span.min-w-0")?.textContent?.trim() ===
          "Connect agent",
      );
    expect(connectAgent).toBeTruthy();
    await user.click(connectAgent!);
    expect(push).toHaveBeenCalledWith("/settings?section=integrations#agent");
  });

  it("shows Searching status then surfaces search failures with retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    renderPalette(false);
    openCommandPalette();

    const input = await screen.findByRole("textbox", { name: "Command search" });
    await user.type(input, "pay");

    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        cases: [],
        runs: [],
        folders: [],
        comments: [],
        plans: [],
        milestones: [],
        triage: [],
        proposals: [],
      }),
    });
    const callsBeforeRetry = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
