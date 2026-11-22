import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { render } from "@/test/render";
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
  window.history.replaceState(null, "", "/cases");
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

    expect(new URLSearchParams(window.location.search).get("case")).toBe("AUTO-a::one");
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
  }, 15_000);

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
    const trigger = within(table).getByRole("combobox", { name: `Status for ${sampleCase.key}` });
    await user.selectOptions(trigger, "ready");

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
    expect(new URLSearchParams(window.location.search).get("case")).toBe("AUTO-a::one");

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

describe("CasesWorkspace CSV import", () => {
  it("dry-runs a CSV then imports and offers view-imported CTA", async () => {
    const user = userEvent.setup();
    const folderId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/custom-fields")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ fields: [] }),
        };
      }
      if (url === "/api/import/csv" && init?.method === "POST") {
        const body = init.body as FormData;
        const dryRun = String(body.get("dryRun")) === "true";
        if (dryRun) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              dryRun: true,
              wouldCreate: 1,
              wouldSkip: [],
              errors: [],
              customFieldKeys: ["owner"],
              sample: [
                {
                  key: "IMP-1",
                  title: "Imported case",
                  folder: "Import",
                  priority: "P2",
                  status: "draft",
                  customFields: { owner: "qa" },
                  structuredStepCount: 2,
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            dryRun: false,
            created: 1,
            skipped: [],
            primaryFolderId: folderId,
            folderIds: [folderId],
            cases: [{ id: "c1", key: "IMP-1", title: "Imported case", folderId }],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CasesWorkspace
        initialCases={[sampleCase]}
        folders={[{ id: folderId, name: "Import", parentId: null }]}
        initialViews={[]}
      />,
    );

    const fileInput = document.querySelector(
      'input[type="file"][accept=".csv,text/csv"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(
      ["key,title\nIMP-1,Imported case\n"],
      "cases.csv",
      { type: "text/csv" },
    );
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText("CSV import preview")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", {
        name: /Import from TestRail, Qase, Zephyr, or Xray/i,
      }),
    ).toHaveAttribute("href", "/cases/import");
    expect(screen.getByText("1 would create")).toBeInTheDocument();
    expect(screen.getByText("IMP-1")).toBeInTheDocument();
    expect(screen.getByText("owner=qa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Import 1 cases/i }));

    await waitFor(() => {
      expect(screen.getByText(/Imported 1 cases/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "View imported cases" }),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    const posts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url) === "/api/import/csv" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(2);
  });
});

describe("CasesWorkspace permissions and recovery", () => {
  it("blocks viewer creation, inline edits, deletion and dispatched create", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<CasesWorkspace initialCases={[sampleCase]} folders={[]} />, { actions: ["cases.view"] });
    expect(screen.getByRole("button", { name: "New case" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: `Delete ${sampleCase.key}` })) expect(button).toBeDisabled();
    act(() => dispatchShortcut("create"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => !String(url).includes("/api/custom-fields"),
      ),
    ).toHaveLength(0);
  });
  it("rolls back an optimistic inline edit on a rejected network request", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
    render(<CasesWorkspace initialCases={[sampleCase]} folders={[]} />);
    const status = screen.getAllByRole("combobox", { name: `Status for ${sampleCase.key}` })[0];
    await user.selectOptions(status, "ready");
    await waitFor(() => expect(screen.getByText("Network unavailable")).toBeInTheDocument());
    await waitFor(() => expect(status).toHaveValue("draft"));
  });
});
