import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseEditPanel } from "./case-edit-panel";

const caseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("CaseEditPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads a case and saves edits via PATCH /api/cases/:id", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();

    const detail = {
      id: caseId,
      key: "AUTO-a::one",
      title: "Original title",
      description: "",
      preconditions: "",
      steps: "1. open",
      expectedResult: "",
      priority: "P2",
      status: "draft",
      tags: ["smoke"],
      folderId: null,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/cases/${caseId}` && (!init || !init.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ case: detail }),
        };
      }
      if (url === `/api/cases/${caseId}` && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: { ...detail, ...body, updated: true },
            updated: true,
          }),
        };
      }
      if (url.includes("/activity")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ activities: [] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CaseEditPanel
        caseId={caseId}
        caseKey="AUTO-a::one"
        caseTitle="Original title"
        folders={[]}
        flatFolders={[]}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Original title")).toBeTruthy();
    });

    const titleInput = screen.getByDisplayValue("Original title");
    await user.clear(titleInput);
    await user.type(titleInput, "Edited title");

    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const patchCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]) === `/api/cases/${caseId}` &&
        (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse(String((patchCall?.[1] as RequestInit).body));
    expect(body.title).toBe("Edited title");
    expect(body.steps).toBe("1. open");
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
      id: caseId,
      title: "Edited title",
      key: "AUTO-a::one",
    });
  });

  it("surfaces permission errors as read-only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((!init || !init.method || init.method === "GET") && !url.includes("/activity")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              id: caseId,
              key: "K-1",
              title: "Locked",
              description: "",
              preconditions: "",
              steps: "",
              expectedResult: "",
              priority: "P2",
              status: "draft",
              tags: [],
              folderId: null,
            },
          }),
        };
      }
      if (init?.method === "PATCH") {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: "Missing permission: cases.edit" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ activities: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CaseEditPanel
        caseId={caseId}
        caseKey="K-1"
        caseTitle="Locked"
        folders={[]}
        flatFolders={[]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Locked")).toBeTruthy();
    });
    await user.clear(screen.getByDisplayValue("Locked"));
    await user.type(screen.getByLabelText("Title"), "Nope");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not have permission|Missing permission/i)).toBeTruthy();
      expect(screen.getByText(/Read-only/i)).toBeTruthy();
    });
  });
});
