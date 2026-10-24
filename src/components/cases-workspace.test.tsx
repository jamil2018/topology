import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CasesWorkspace } from "./cases-workspace";
import {
  nextCaseKey,
  projectKeyPrefix,
  selectionRangeIds,
} from "./cases-model";
import { dispatchShortcut } from "@/lib/shortcuts";

const refresh = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace: push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/cases",
}));

const caseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const sampleCase = {
  id: caseId,
  key: "AUTO-a::one",
  title: "Opens the suite",
  priority: "P2",
  status: "draft",
  tags: [],
  folder: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
  push.mockClear();
});

describe("case key helpers", () => {
  it("builds the next project-prefixed key", () => {
    expect(projectKeyPrefix("topology")).toBe("TOP");
    expect(nextCaseKey("TOP", ["TOP-1", "TOP-12", "OTHER-9"])).toBe("TOP-13");
  });

  it("builds an inclusive selection range", () => {
    expect(selectionRangeIds(["a", "b", "c"], 0, 2)).toEqual(["a", "b", "c"]);
    expect(selectionRangeIds(["a", "b", "c"], 2, 1)).toEqual(["b", "c"]);
  });
});

describe("CasesWorkspace delete", () => {
  it("confirms and deletes a case via DELETE /api/cases/:id", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/cases/${caseId}` && init?.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ case: { id: caseId } }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CasesWorkspace initialCases={[sampleCase]} folders={[]} initialViews={[]} />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Delete AUTO-a::one" })[0],
    );
    expect(
      screen.getByText(/Delete “AUTO-a::one”\? This cannot be undone/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete case" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/cases/${caseId}`, {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("AUTO-a::one")).not.toBeInTheDocument();
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the case when delete is denied", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Missing permission: cases.delete" }),
      })),
    );

    render(
      <CasesWorkspace initialCases={[sampleCase]} folders={[]} initialViews={[]} />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Delete AUTO-a::one" })[0],
    );
    await user.click(screen.getByRole("button", { name: "Delete case" }));

    await waitFor(() => {
      expect(
        screen.getByText("Missing permission: cases.delete"),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText("AUTO-a::one").length).toBeGreaterThan(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("CasesWorkspace authoring", () => {
  it("updates the URL when a case is opened from the list", async () => {
    const user = userEvent.setup();
    render(
      <CasesWorkspace initialCases={[sampleCase]} folders={[]} initialViews={[]} />,
    );

    await user.click(screen.getAllByRole("button", { name: "AUTO-a::one" })[0]);

    expect(push).toHaveBeenCalledWith("/cases/AUTO-a%3A%3Aone");
  });

  it("auto-fills the next key from the project prefix", async () => {
    const user = userEvent.setup();
    render(
      <CasesWorkspace
        initialCases={[
          { ...sampleCase, key: "TOP-5", title: "Existing" },
        ]}
        folders={[]}
        initialViews={[]}
        projectPrefix="TOP"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New case" }));
    expect(screen.getByDisplayValue("TOP-6")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 1 action")).toBeInTheDocument();
  });

  it("paginates at 50 rows", () => {
    const many = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-0000-0000-0000000000${String(index).padStart(2, "0")}`,
      key: `TOP-${index + 1}`,
      title: `Case ${index + 1}`,
      priority: "P2",
      status: "draft",
      tags: [],
      folder: null,
    }));

    render(
      <CasesWorkspace initialCases={many} folders={[]} initialViews={[]} />,
    );

    expect(screen.getByText("1–50 of 51")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    // Key sort is lexicographic, so TOP-9 lands on page 2.
    expect(screen.queryByText("TOP-9")).not.toBeInTheDocument();
  });

  it("asks before closing a dirty case peek", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/activity")) {
        return { ok: true, status: 200, json: async () => ({ activities: [] }) };
      }
      if (url === `/api/cases/${caseId}` && (!init || !init.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              ...sampleCase,
              description: "",
              preconditions: "",
              steps: "1. open",
              expectedResult: "",
              folderId: null,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CasesWorkspace
        initialCases={[sampleCase]}
        folders={[]}
        initialViews={[]}
        selectedCaseKey={sampleCase.key}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Opens the suite")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Title"), " edited");
    await user.click(screen.getByRole("button", { name: "Close case editor" }));

    expect(screen.getByText(/Discard unsaved changes/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByDisplayValue(/Opens the suite/)).toBeInTheDocument();
  });

  it("saves inline status edits via PATCH /api/cases/:id", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/cases/${caseId}` && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ case: { ...sampleCase, status: "ready" } }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CasesWorkspace initialCases={[sampleCase]} folders={[]} initialViews={[]} />,
    );

    const table = screen.getAllByRole("table")[0];
    const trigger = within(table).getByRole("button", { name: /draft/i });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /ready/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
    });
  });

  it("opens the focused case with Enter and toggles selection with X", async () => {
    const second = {
      ...sampleCase,
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      key: "AUTO-a::two",
      title: "Second case",
    };
    render(
      <CasesWorkspace
        initialCases={[sampleCase, second]}
        folders={[]}
        initialViews={[]}
      />,
    );

    act(() => {
      dispatchShortcut("open");
    });
    expect(push).toHaveBeenCalledWith("/cases/AUTO-a%3A%3Aone");

    act(() => {
      dispatchShortcut("select");
    });
    await waitFor(() => {
      expect(screen.getAllByLabelText("Select AUTO-a::one")[0]).toBeChecked();
    });

    act(() => {
      dispatchShortcut("nav-next-extend");
    });
    await waitFor(() => {
      expect(screen.getAllByLabelText("Select AUTO-a::one")[0]).toBeChecked();
      expect(screen.getAllByLabelText("Select AUTO-a::two")[0]).toBeChecked();
    });
  });

  it("closes the case peek from Escape and keeps the dirty guard", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/activity")) {
        return { ok: true, status: 200, json: async () => ({ activities: [] }) };
      }
      if (url === `/api/cases/${caseId}` && (!init || !init.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              ...sampleCase,
              description: "",
              preconditions: "",
              steps: "1. open",
              expectedResult: "",
              folderId: null,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CasesWorkspace
        initialCases={[sampleCase]}
        folders={[]}
        initialViews={[]}
        selectedCaseKey={sampleCase.key}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Opens the suite")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Title"), " edited");
    act(() => {
      dispatchShortcut("escape");
    });
    expect(screen.getByText(/Discard unsaved changes/i)).toBeInTheDocument();
  });
});
