import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, waitFor, screen, within } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { dispatchShortcut } from "@/lib/shortcuts";
import { RunExecutor } from "./run-executor";
import type { ResultRow, RunDetail } from "./run-executor-model";

vi.mock("./run-productivity-actions", () => ({ RunProductivityActions: () => null }));

const refresh = vi.hoisted(() => vi.fn());
const live = vi.hoisted(() => ({ reconnect: undefined as undefined | (() => Promise<void>) }));
vi.mock("./use-live-updates", () => ({ useLiveUpdates: (_onEvent: unknown, options: {onReconnect: () => Promise<void>}) => { live.reconnect = options.onReconnect; return "live"; } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const testerId = "44444444-4444-4444-4444-444444444444";

function result(overrides: Partial<ResultRow> & { key?: string; title?: string }): ResultRow {
  const key = overrides.key ?? "SMOKE-1";
  const title = overrides.title ?? "Loads";
  const { key: _key, title: _title, case: caseOverride, ...rest } = overrides;
  return {
    id: rest.id ?? "22222222-2222-2222-2222-222222222222",
    status: rest.status ?? "passed",
    notes: rest.notes ?? "",
    assigneeId: rest.assigneeId ?? null,
    linkedIssues: rest.linkedIssues ?? [],
    comments: rest.comments ?? [],
    attachments: rest.attachments ?? [],
    case: caseOverride ?? {
      id: "33333333-3333-3333-3333-333333333333",
      key,
      title,
      steps: "",
      expectedResult: "",
    },
    ...rest,
  };
}

const baseRun: RunDetail = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Smoke",
  status: "in_progress",
  description: "Check confirm",
  assigneeId: null,
  results: [result({})],
};

function multiRun(): RunDetail {
  return {
    ...baseRun,
    results: [
      result({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        status: "untested",
        key: "CASE-1",
        title: "First case",
        case: {
          id: "case-1",
          key: "CASE-1",
          title: "First case",
          steps: "",
          expectedResult: "",
        },
      }),
      result({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        status: "untested",
        key: "CASE-2",
        title: "Second case",
        case: {
          id: "case-2",
          key: "CASE-2",
          title: "Second case",
          steps: "",
          expectedResult: "",
        },
      }),
      result({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        status: "failed",
        assigneeId: testerId,
        key: "CASE-3",
        title: "Failed mine",
        case: {
          id: "case-3",
          key: "CASE-3",
          title: "Failed mine",
          steps: "",
          expectedResult: "",
        },
      }),
    ],
  };
}

describe("RunExecutor complete confirmation", () => {
  it("warns before completing and cancel aborts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RunExecutor run={baseRun} />);

    await user.click(screen.getByRole("button", { name: /^Complete$/ }));
    expect(
      screen.getByRole("heading", { name: "Complete this run?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Completing locks results and case structure/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Complete this run?" }),
    ).not.toBeInTheDocument();
  });

  it("locks result controls when the run is completed", () => {
    render(
      <RunExecutor
        run={{
          ...baseRun,
          status: "completed",
        }}
      />,
    );
    expect(screen.getByText(/completed and locked/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View report" })).toHaveAttribute(
      "href",
      `/reports/${baseRun.id}`,
    );
    expect(
      screen.queryByRole("button", { name: /^Complete$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark SMOKE-1 as passed" }),
    ).toBeDisabled();
  });
});

describe("RunExecutor abort confirmation", () => {
  it("warns before aborting and cancel does not mutate", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RunExecutor run={{ ...baseRun, status: "planned" }} />);

    await user.click(screen.getByText("More actions"));
    await user.click(screen.getByRole("button", { name: "Abort run" }));
    expect(
      screen.getByRole("heading", { name: "Abort this run?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/marks this run aborted/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Abort this run?" }),
    ).not.toBeInTheDocument();
  });

  it("aborts the run after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { status: "aborted" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RunExecutor run={{ ...baseRun, status: "planned" }} />);

    await user.click(screen.getByText("More actions"));
    await user.click(screen.getByRole("button", { name: "Abort run" }));
    await user.click(screen.getByRole("button", { name: "Abort run" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/runs/${baseRun.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "abort" }),
      }),
    );
  });

  it("locks an aborted run and hides start, complete, and abort", () => {
    render(
      <RunExecutor
        run={{
          ...baseRun,
          status: "aborted",
        }}
      />,
    );
    expect(screen.getByText(/aborted and is locked/i)).toBeInTheDocument();
    expect(screen.getByText(/^Aborted$/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Abort run$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Complete$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Start$/ }),
    ).toBeDisabled();
    expect(screen.queryByRole("link", { name: "View report" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mark SMOKE-1 as passed" }),
    ).toBeDisabled();
  });
});

describe("RunExecutor create issue", () => {
  it("shows the mock key from the API without waiting on refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issue: {
          id: "issue-1",
          provider: "mock",
          remoteKey: "MOCK-9",
          url: "https://example.test/MOCK-9",
          title: "Filed from SMOKE-1",
          remoteStatus: "open",
          needsRetest: 0,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RunExecutor
        run={{
          ...baseRun,
          results: [result({ status: "failed" })],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create issue" }));
    expect(await screen.findByText("MOCK-9")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issues",
      expect.objectContaining({ method: "POST" }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("RunExecutor list and detail", () => {
  it("shows a case list, filters, search, and focused detail", () => {
    render(
      <RunExecutor
        run={multiRun()}
        currentUserId={testerId}
        members={[{ id: testerId, name: "Ada", email: "ada@test" }]}
      />,
    );

    expect(screen.getByRole("list", { name: "Run cases" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Untested \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Failed \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Blocked \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Mine \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search cases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to case list/ })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Run progress" })).toBeInTheDocument();
  });

  it("filters the list and search, including Mine", async () => {
    const user = userEvent.setup();
    render(
      <RunExecutor
        run={multiRun()}
        currentUserId={testerId}
        members={[{ id: testerId, name: "Ada", email: "ada@test" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Failed \d+$/ }));
    const list = screen.getByRole("list", { name: "Run cases" });
    expect(within(list).getByText("CASE-3")).toBeInTheDocument();
    expect(within(list).queryByText("CASE-1")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failed mine" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Failed \d+$/ }));
    await user.click(screen.getByRole("button", { name: /^Mine \d+$/ }));
    expect(within(list).getByText("CASE-3")).toBeInTheDocument();
    expect(within(list).queryByText("CASE-2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Mine \d+$/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search cases" }), "Second");
    expect(within(list).getByText("CASE-2")).toBeInTheDocument();
    expect(within(list).queryByText("CASE-1")).not.toBeInTheDocument();
  });

  it("auto-advances to the next untested case after recording", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<RunExecutor run={multiRun()} />);

    expect(screen.getByRole("heading", { name: "First case" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark CASE-1 as passed" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second case" })).toBeInTheDocument());
  });

  it("moves focus with J/K and records with P", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<RunExecutor run={multiRun()} />);

    act(() => {
      dispatchShortcut("nav-next");
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second case" })).toBeInTheDocument());
    act(() => {
      dispatchShortcut("nav-prev");
    });
    expect(screen.getByRole("heading", { name: "First case" })).toBeInTheDocument();
    act(() => {
      dispatchShortcut("pass");
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second case" })).toBeInTheDocument());
  });

  it("paints selected statuses with semantic colors instead of accent", () => {
    render(<RunExecutor run={baseRun} />);
    const passed = screen.getByRole("button", { name: "Mark SMOKE-1 as passed" });
    expect(passed).toHaveAttribute("aria-pressed", "true");
    expect(passed.className).toMatch(/topo-success/);
    expect(passed.className).not.toMatch(/topo-accent/);

    const failed = screen.getByRole("button", { name: "Mark SMOKE-1 as failed" });
    expect(failed).toHaveAttribute("aria-pressed", "false");
    expect(failed.className).not.toMatch(/topo-accent/);
  });

  it("merges comments and uploads locally without refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/comments")) {
        return {
          ok: true,
          json: async () => ({
            comment: {
              id: "comment-1",
              body: "Looks flaky",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          }),
        };
      }
      if (url.endsWith("/attachments")) {
        return {
          ok: true,
          json: async () => ({
            attachment: {
              id: "att-1",
              filename: "shot.png",
              contentType: "image/png",
              sizeBytes: 2048,
              url: "/api/attachments/att-1",
            },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RunExecutor
        run={{
          ...baseRun,
          results: [result({ status: "failed" })],
        }}
        currentUser={{ id: testerId, name: "Ada", email: "ada@test" }}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/Add a comment/),
      "Looks flaky",
    );
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(await screen.findByText("Looks flaky")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();

    const file = new File(["xx"], "shot.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Attach file"), file);
    expect(await screen.findByAltText("shot.png")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("virtualizes long case lists", () => {
    const results = Array.from({ length: 80 }, (_, i) =>
      result({
        id: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa${String(i).padStart(2, "0")}`,
        status: "untested",
        key: `CASE-${i}`,
        title: `Case title ${i}`,
        case: {
          id: `case-${i}`,
          key: `CASE-${i}`,
          title: `Case title ${i}`,
          steps: "",
          expectedResult: "",
        },
      }),
    );
    render(<RunExecutor run={{ ...baseRun, results }} />);

    const list = screen.getByRole("list", { name: "Run cases" });
    expect(within(list).getByText("CASE-0")).toBeInTheDocument();
    expect(within(list).queryByText("CASE-79")).not.toBeInTheDocument();
  });
});


describe("run save ordering", () => {
  it("queues an explicit status after delayed notes autosave", async () => {
    const user = userEvent.setup();
    let finishNotes!: () => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishNotes = () => resolve({ok:true, json:async()=>({})}); }))
      .mockResolvedValue({ok:true, json:async()=>({})});
    vi.stubGlobal("fetch", fetchMock);
    render(<RunExecutor run={{...baseRun, results:[result({status:"untested"})]}} />);
    await user.type(screen.getByRole("textbox", {name:"Notes"}), "Keep these notes");
    await user.click(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"}));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finishNotes(); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({status:"passed", notes:"Keep these notes"});
    await waitFor(() => expect(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"})).toHaveAttribute("aria-pressed", "true"));
  });

  it("reconciles again instead of applying a stale reconnect snapshot", async () => {
    const user = userEvent.setup();
    const initial = {...baseRun, results:[result({status:"untested"})]};
    let finishRead!: () => void;
    let reads = 0;
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") return Promise.resolve({ok:true,json:async()=>({})});
      reads += 1;
      if (reads === 1) return new Promise(resolve => {finishRead = () => resolve({ok:true,json:async()=>({run:initial})});});
      return Promise.resolve({ok:true,json:async()=>({run:{...initial, results:[result({status:"passed"})]}})});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RunExecutor run={initial} />);
    let reconnect!: Promise<void>;
    await act(async () => { reconnect = live.reconnect!(); });
    await user.click(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"}));
    await act(async () => { finishRead(); await reconnect; });
    expect(reads).toBe(2);
    expect(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"})).toHaveAttribute("aria-pressed", "true");
  });
});

it("allows retrying Complete after a failed lifecycle request", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"Temporary outage"})})
    .mockResolvedValue({ok:true,json:async()=>({})});
  vi.stubGlobal("fetch", fetchMock);
  render(<RunExecutor run={baseRun} />);
  await user.click(screen.getByRole("button", {name:"Complete"}));
  await user.click(screen.getByRole("button", {name:"Complete run"}));
  await screen.findByText("Temporary outage");
  await user.click(await screen.findByRole("button", {name:"Complete run"}));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText(/completed and locked/i)).toBeVisible());
});

it("waits for writes queued while reconnect is awaiting an autosave", async () => {
  const user = userEvent.setup();
  const initial = {...baseRun, results:[result({status:"untested"})]};
  let finishNotes!: () => void;
  let finishStatus!: () => void;
  let writes = 0;
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      writes += 1;
      return new Promise(resolve => {
        const done = () => resolve({ok:true,json:async()=>({})});
        if (writes === 1) finishNotes = done; else finishStatus = done;
      });
    }
    reads += 1;
    return Promise.resolve({ok:true,json:async()=>({run:{...initial,results:[result({status:"passed",notes:"Draft"})]}})});
  }));
  render(<RunExecutor run={initial} />);
  await user.type(screen.getByRole("textbox", {name:"Notes"}), "Draft");
  await user.tab();
  let reconnect!: Promise<void>;
  await act(async () => { reconnect = live.reconnect!(); });
  await user.click(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"}));
  await act(async () => { finishNotes(); });
  expect(writes).toBe(2);
  expect(reads).toBe(0);
  await act(async () => { finishStatus(); await reconnect; });
  expect(reads).toBe(1);
  expect(screen.getByRole("button", {name:"Mark SMOKE-1 as passed"})).toHaveAttribute("aria-pressed", "true");
});

it("allows completing after reverting a failed notes draft to its saved value", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"Notes failed"})})
    .mockResolvedValue({ok:true,json:async()=>({})});
  vi.stubGlobal("fetch", fetchMock);
  render(<RunExecutor run={baseRun} />);
  const notes = screen.getByRole("textbox", {name:"Notes"});
  await user.type(notes, "Abandoned draft");
  await user.tab();
  await screen.findByText("Notes failed");
  await user.clear(notes);
  await user.click(screen.getByRole("button", {name:"Complete"}));
  await user.click(screen.getByRole("button", {name:"Complete run"}));
  await waitFor(() => expect(screen.getByText(/completed and locked/i)).toBeVisible());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});




