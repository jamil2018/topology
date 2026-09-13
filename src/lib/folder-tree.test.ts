import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  flattenFolderTree,
  folderAncestors,
  folderPathLabel,
  wouldCreateFolderCycle,
} from "./folder-tree";

const folders = [
  { id: "a", name: "Smoke", parentId: null },
  { id: "b", name: "Auth", parentId: "a" },
  { id: "c", name: "Billing", parentId: null },
  { id: "d", name: "MFA", parentId: "b" },
];

describe("buildFolderTree", () => {
  it("nests children under parents and sorts by name", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.name)).toEqual(["Billing", "Smoke"]);
    expect(tree[1]!.children.map((n) => n.name)).toEqual(["Auth"]);
    expect(tree[1]!.children[0]!.children.map((n) => n.name)).toEqual(["MFA"]);
  });

  it("treats missing parents as roots", () => {
    const tree = buildFolderTree([
      { id: "x", name: "Orphan", parentId: "missing" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("Orphan");
  });
});

describe("flattenFolderTree", () => {
  it("preserves depth", () => {
    const flat = flattenFolderTree(buildFolderTree(folders));
    expect(flat.map((f) => [f.name, f.depth])).toEqual([
      ["Billing", 0],
      ["Smoke", 0],
      ["Auth", 1],
      ["MFA", 2],
    ]);
  });
});

describe("folderPathLabel / ancestors", () => {
  it("builds path labels", () => {
    expect(folderPathLabel(folders, "d")).toBe("Smoke / Auth / MFA");
  });

  it("returns ancestor chain root → leaf", () => {
    expect(folderAncestors(folders, "d").map((f) => f.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });
});

describe("wouldCreateFolderCycle", () => {
  it("detects self and descendant parents", () => {
    expect(wouldCreateFolderCycle(folders, "a", "a")).toBe(true);
    expect(wouldCreateFolderCycle(folders, "a", "d")).toBe(true);
    expect(wouldCreateFolderCycle(folders, "a", "c")).toBe(false);
    expect(wouldCreateFolderCycle(folders, "a", null)).toBe(false);
  });
});
