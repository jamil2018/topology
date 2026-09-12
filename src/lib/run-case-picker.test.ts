import { describe, expect, it } from "vitest";
import {
  collectCaseTags,
  defaultReadySelection,
  filterPickerCases,
  sortPickerCases,
  visiblePickerCases,
  type PickerCase,
} from "@/lib/run-case-picker";

const cases: PickerCase[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    key: "TOP-1",
    title: "Login works",
    priority: "P0",
    status: "ready",
    tags: ["smoke", "auth"],
    folder: { id: "f1", name: "Smoke" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    key: "TOP-2",
    title: "Draft billing",
    priority: "P2",
    status: "draft",
    tags: ["billing"],
    folder: { id: "f2", name: "Billing" },
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    key: "TOP-3",
    title: "Auth MFA",
    priority: "P1",
    status: "ready",
    tags: ["auth"],
    folder: { id: "f1", name: "Smoke" },
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

const baseFilters = {
  search: "",
  status: "all",
  priority: "all",
  folderId: "all",
  tag: "all",
};

describe("run-case-picker", () => {
  it("defaults selection to ready cases only", () => {
    expect(defaultReadySelection(cases)).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "33333333-3333-3333-3333-333333333333",
    ]);
  });

  it("collects unique sorted tags", () => {
    expect(collectCaseTags(cases)).toEqual(["auth", "billing", "smoke"]);
  });

  it("filters by search across title, key, and tags", () => {
    expect(
      filterPickerCases(cases, { ...baseFilters, search: "mfa" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-3"]);
    expect(
      filterPickerCases(cases, { ...baseFilters, search: "billing" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-2"]);
    expect(
      filterPickerCases(cases, { ...baseFilters, search: "TOP-2" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-2"]);
  });

  it("filters by status, priority, folder, and tag", () => {
    expect(
      filterPickerCases(cases, { ...baseFilters, status: "ready" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-1", "TOP-3"]);
    expect(
      filterPickerCases(cases, { ...baseFilters, priority: "P0" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-1"]);
    expect(
      filterPickerCases(cases, { ...baseFilters, folderId: "f2" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-2"]);
    expect(
      filterPickerCases(cases, { ...baseFilters, tag: "auth" }).map(
        (c) => c.key,
      ),
    ).toEqual(["TOP-1", "TOP-3"]);
  });

  it("sorts by title, priority, and updated", () => {
    expect(sortPickerCases(cases, "title").map((c) => c.key)).toEqual([
      "TOP-3",
      "TOP-2",
      "TOP-1",
    ]);
    expect(sortPickerCases(cases, "priority").map((c) => c.key)).toEqual([
      "TOP-1",
      "TOP-3",
      "TOP-2",
    ]);
    expect(sortPickerCases(cases, "updated").map((c) => c.key)).toEqual([
      "TOP-2",
      "TOP-1",
      "TOP-3",
    ]);
  });

  it("composes filter + sort for the visible list", () => {
    expect(
      visiblePickerCases(
        cases,
        { ...baseFilters, status: "ready" },
        "priority",
      ).map((c) => c.key),
    ).toEqual(["TOP-1", "TOP-3"]);
  });
});
