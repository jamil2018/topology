import { describe, expect, it } from "vitest";
import {
  filterAndSortRuns,
  paginateRuns,
  runProgressPct,
  RUN_LIST_PAGE_SIZE,
  runListQueryFromSearchParams,
  type RunListItem,
} from "./run-list";

const runs: RunListItem[] = [
  {
    id: "aaaaaaaa-1111",
    name: "Smoke A",
    status: "planned",
    environment: "local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "bbbbbbbb-2222",
    name: "Regression B",
    status: "completed",
    environment: "local",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "cccccccc-3333",
    name: "Nightly C",
    status: "in_progress",
    environment: "ci",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-06T00:00:00.000Z",
  },
];

describe("filterAndSortRuns", () => {
  it("filters by name, id, and status text", () => {
    expect(filterAndSortRuns(runs, "regression", "name").map((r) => r.id)).toEqual([
      "bbbbbbbb-2222",
    ]);
    expect(filterAndSortRuns(runs, "cccccccc", "name").map((r) => r.id)).toEqual([
      "cccccccc-3333",
    ]);
    expect(filterAndSortRuns(runs, "in progress", "name").map((r) => r.id)).toEqual([
      "cccccccc-3333",
    ]);
  });

  it("sorts by updated, created, name, and status", () => {
    expect(filterAndSortRuns(runs, "", "updated").map((r) => r.name)).toEqual([
      "Nightly C",
      "Smoke A",
      "Regression B",
    ]);
    expect(filterAndSortRuns(runs, "", "created").map((r) => r.name)).toEqual([
      "Regression B",
      "Nightly C",
      "Smoke A",
    ]);
    expect(filterAndSortRuns(runs, "", "name").map((r) => r.name)).toEqual([
      "Nightly C",
      "Regression B",
      "Smoke A",
    ]);
    expect(filterAndSortRuns(runs, "", "status").map((r) => r.status)).toEqual([
      "completed",
      "in_progress",
      "planned",
    ]);
  });
});

describe("paginateRuns", () => {
  it("pages with size 10 and clamps page", () => {
    const many = Array.from({ length: 23 }, (_, i) => i);
    const p1 = paginateRuns(many, 1, RUN_LIST_PAGE_SIZE);
    expect(p1.items).toHaveLength(10);
    expect(p1.totalPages).toBe(3);
    expect(p1.page).toBe(1);

    const p3 = paginateRuns(many, 3, RUN_LIST_PAGE_SIZE);
    expect(p3.items).toEqual([20, 21, 22]);

    const overflow = paginateRuns(many, 99, RUN_LIST_PAGE_SIZE);
    expect(overflow.page).toBe(3);
  });
});

describe("runProgressPct", () => {
  it("uses executed over total and ignores empty runs", () => {
    expect(runProgressPct({ ...runs[0], passed: 4, failed: 1, untested: 5, total: 10 })).toBe(50);
    expect(runProgressPct(runs[0])).toBeNull();
  });
});

describe("runListQueryFromSearchParams", () => {
  it("reads existing UI query-string page params", () => {
    const query = runListQueryFromSearchParams(
      new URLSearchParams("page=2&q=smoke&kind=manual&sort=name&limit=25"),
    );
    expect(query.page).toBe(2);
    expect(query.search).toBe("smoke");
    expect(query.kind).toBe("manual");
    expect(query.sort).toBe("name");
    expect(query.limit).toBe(25);
  });
});
