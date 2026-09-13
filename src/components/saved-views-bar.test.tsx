import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedViewsBar } from "./saved-views-bar";

describe("SavedViewsBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("saves a view via POST /api/views and shows it in the bar", async () => {
    const user = userEvent.setup();
    const created = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Ready P0",
      entity: "cases" as const,
      config: {
        folderFilter: "all",
        search: "",
        statusFilter: "ready",
        priorityFilter: "P0",
        sort: "key",
        sortDir: "asc",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ view: created }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onSaved = vi.fn();
    render(
      <SavedViewsBar
        entity="cases"
        initialViews={[]}
        activeViewId={null}
        canSave
        buildConfig={() => created.config}
        onApply={() => undefined}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText("None saved")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save current" }));
    await user.type(screen.getByPlaceholderText("View name"), "Ready P0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/views",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body).toMatchObject({
      name: "Ready P0",
      entity: "cases",
      config: created.config,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ready P0" })).toBeTruthy();
      expect(screen.queryByText("None saved")).toBeNull();
    });
    expect(onSaved).toHaveBeenCalledWith(created);
  });

  it("surfaces API errors when Save fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Failed to save view" }),
      }),
    );

    render(
      <SavedViewsBar
        entity="cases"
        initialViews={[]}
        activeViewId={null}
        canSave
        buildConfig={() => ({})}
        onApply={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save current" }));
    await user.type(screen.getByPlaceholderText("View name"), "Broken");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to save view",
    );
  });
});
