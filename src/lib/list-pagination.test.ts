import { describe, expect, it } from "vitest";
import {
  buildPaginatedList,
  containsPattern,
  decodeListCursor,
  encodeListCursor,
  pageToOffset,
  parseLimitParam,
  paginateItems,
  parsePageParam,
  resolveListPagination,
  totalPagesFor,
} from "./list-pagination";

describe("list pagination helpers", () => {
  it("encodes and decodes a cursor", () => {
    const encoded = encodeListCursor({ sortValue: "TOP-1", id: "abc" });
    expect(decodeListCursor(encoded)).toEqual({
      sortValue: "TOP-1",
      id: "abc",
    });
    expect(decodeListCursor("not-valid")).toBeNull();
    expect(decodeListCursor("")).toBeNull();
  });

  it("parses page/limit and clamps", () => {
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("nope")).toBe(1);
    expect(parseLimitParam("25")).toBe(25);
    expect(parseLimitParam("9999")).toBe(100);
    expect(parseLimitParam(undefined, 10)).toBe(10);
    expect(pageToOffset(3, 10)).toBe(20);
    expect(totalPagesFor(23, 10)).toBe(3);
    expect(totalPagesFor(0, 10)).toBe(1);
  });

  it("prefers page over cursor so query-string page params keep working", () => {
    const cursor = encodeListCursor({ sortValue: "k", id: "id-1" });
    const fromPage = resolveListPagination({
      page: "3",
      limit: "10",
      cursor,
      defaultLimit: 10,
    });
    expect(fromPage.useCursor).toBe(false);
    expect(fromPage.page).toBe(3);
    expect(fromPage.offset).toBe(20);
    expect(fromPage.limit).toBe(10);

    const fromCursor = resolveListPagination({
      cursor,
      limit: "10",
      defaultLimit: 10,
    });
    expect(fromCursor.useCursor).toBe(true);
    expect(fromCursor.cursor).toEqual({ sortValue: "k", id: "id-1" });
    expect(fromCursor.offset).toBe(0);
  });

  it("builds nextCursor when more rows remain", () => {
    const page1 = buildPaginatedList(
      [
        { id: "a", key: "TOP-1" },
        { id: "b", key: "TOP-2" },
      ],
      5,
      1,
      2,
      (row) => row.key,
    );
    expect(page1.totalPages).toBe(3);
    expect(page1.nextCursor).toBe(
      encodeListCursor({ sortValue: "TOP-2", id: "b" }),
    );

    const last = buildPaginatedList(
      [{ id: "c", key: "TOP-3" }],
      5,
      3,
      2,
      (row) => row.key,
    );
    expect(last.nextCursor).toBeNull();
  });

  it("slices client lists and clamps out-of-range pages", () => {
    const many = Array.from({ length: 23 }, (_, i) => i);
    const page1 = paginateItems(many, 1, 10);
    expect(page1.items).toEqual(many.slice(0, 10));
    expect(page1.total).toBe(23);
    expect(page1.totalPages).toBe(3);
    expect(paginateItems(many, 99, 10).page).toBe(3);
    expect(paginateItems([], 4, 10)).toEqual({
      page: 1,
      totalPages: 1,
      total: 0,
      items: [],
    });
  });

  it("escapes ILIKE wildcards in search patterns", () => {
    expect(containsPattern("100%")).toBe("%100\\%%");
    expect(containsPattern("a_b")).toBe("%a\\_b%");
  });
});
