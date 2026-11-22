import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/render";
import { ProjectSwitcher } from "./project-switcher";

vi.mock("@/lib/project-actions", () => ({
  selectActiveProject: vi.fn(async () => ({ ok: true as const })),
}));

afterEach(() => {
  cleanup();
});

const projects = [
  { id: "p1", name: "Alpha", slug: "alpha", role: "admin" },
  { id: "p2", name: "Beta", slug: "beta", role: "member" },
];

describe("ProjectSwitcher", () => {
  it("closes on Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" />,
    );

    const trigger = screen.getByRole("button", { name: /Alpha/i });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Search projects")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("filters projects by search query", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" />,
    );

    await user.click(screen.getByRole("button", { name: /Alpha/i }));
    await user.type(screen.getByLabelText("Search projects"), "beta");
    expect(screen.getByRole("option", { name: /Beta/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Alpha/i })).toBeNull();
  });

  it("shows New project for admins", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSwitcher
        projects={projects}
        activeProjectId="p1"
        canManage
      />,
    );

    await user.click(screen.getByRole("button", { name: /Alpha/i }));
    expect(
      screen.getByRole("option", { name: /New project/i }),
    ).toBeInTheDocument();
  });

  it("shows a compact New project affordance when collapsed with no projects", () => {
    render(
      <ProjectSwitcher
        projects={[]}
        activeProjectId={null}
        collapsed
        canManage
      />,
    );

    const link = screen.getByRole("link", { name: "New project" });
    expect(link).toHaveAttribute("href", "/settings?section=projects");
  });

  it("shows an empty marker when collapsed with no projects and no manage rights", () => {
    render(
      <ProjectSwitcher
        projects={[]}
        activeProjectId={null}
        collapsed
        canManage={false}
      />,
    );

    expect(screen.getByLabelText("No projects")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New project" }),
    ).not.toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ProjectSwitcher projects={projects} activeProjectId="p1" />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /Alpha/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
