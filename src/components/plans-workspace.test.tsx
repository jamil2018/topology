import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlansWorkspace } from "./plans-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("PlansWorkspace", () => {
  it("opens a New plan dialog with browser and OS presets instead of an always-on form", async () => {
    const user = userEvent.setup();
    render(<PlansWorkspace initialPlans={[]} environments={[]} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Release 1.2/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New plan" }));
    expect(
      await screen.findByRole("dialog", { name: /New plan/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firefox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Windows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create plan" })).toBeDisabled();
  });

  it("shows human status labels on plan rows", () => {
    render(
      <PlansWorkspace
        initialPlans={[
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            name: "Release 2.4 checkout",
            description: "",
            status: "in_progress",
            matrix: { browsers: [], operatingSystems: [], environmentIds: [] },
            caseCount: 12,
            runCount: 0,
          },
        ]}
        environments={[]}
      />,
    );

    expect(screen.getByText("In progress")).toBeInTheDocument();
  });
});
