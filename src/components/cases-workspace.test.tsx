import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CasesWorkspace } from "./cases-workspace";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

    await user.click(screen.getByRole("button", { name: "Delete AUTO-a::one" }));
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

    await user.click(screen.getByRole("button", { name: "Delete AUTO-a::one" }));
    await user.click(screen.getByRole("button", { name: "Delete case" }));

    await waitFor(() => {
      expect(
        screen.getByText("Missing permission: cases.delete"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("AUTO-a::one")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
