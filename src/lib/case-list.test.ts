import { describe, expect, it } from "vitest";
import {
  CASE_LIST_PAGE_SIZE,
  filterAndSortCases,
  paginateCases,
  type CaseListItem,
} from "./case-list";

const cases: CaseListItem[] = [
  {
    id: "1",
    key: "TOP-2",
    title: "Logout works",
    priority: "P2",
    status: "draft",
    tags: ["auth"],
    folder: { id: "smoke", name: "Smoke" },
  },
  {
    id: "2",
    key: "TOP-1",
    title: "Login works",
    priority: "P0",
    status: "ready",
    tags: ["smoke", "auth"],
    folder: { id: "smoke", name: "Smoke" },
  },
  {
    id: "3",
    key: "TOP-3",
    title: "Regression path",
    priority: "P1",
    status: "ready",
    tags: ["regression"],
    folder: { id: "reg", name: "Regression" },
  },
];

describe("filterAndSortCases", () => {
  it("filters by folder and search across key/title/tags", () => {
    expect(
      filterAndSortCases(cases, "smoke", "", "key", "asc").map((c) => c.key),
    ).toEqual(["TOP-1", "TOP-2"]);
    expect(
      filterAndSortCases(cases, "all", "login", "key", "asc").map((c) => c.key),
    ).toEqual(["TOP-1"]);
    expect(
      filterAndSortCases(cases, "all", "regression", "key", "asc").map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-3"]);
  });

  it("sorts by priority and toggles direction", () => {
    expect(
      filterAndSortCases(cases, "all", "", "priority", "asc").map(
        (c) => c.priority,
      ),
    ).toEqual(["P0", "P1", "P2"]);
    expect(
      filterAndSortCases(cases, "all", "", "title", "desc").map((c) => c.title),
    ).toEqual(["Regression path", "Logout works", "Login works"]);
  });
});

describe("paginateCases", () => {
  it("pages with size 10 and clamps page", () => {
    const many = Array.from({ length: 23 }, (_, i) => i);
    const p1 = paginateCases(many, 1, CASE_LIST_PAGE_SIZE);
    expect(p1.items).toHaveLength(10);
    expect(p1.totalPages).toBe(3);
    expect(paginateCases(many, 99, CASE_LIST_PAGE_SIZE).page).toBe(3);
  });
});
