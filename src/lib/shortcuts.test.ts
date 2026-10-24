import { describe, expect, it } from "vitest";
import {
  hrefForGoShortcut,
  isCasesWorkspacePath,
  isGoPrefix,
  isRunExecutorPath,
  isRunsListPath,
  matchGoChord,
  matchShortcut,
  shouldIgnoreShortcutTarget,
} from "./shortcuts";

function keyEvent(
  key: string,
  target: EventTarget | null = null,
  extras: Partial<KeyboardEvent> = {},
): Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "target"
> {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: key === "?",
    repeat: false,
    target,
    ...extras,
  };
}

describe("shouldIgnoreShortcutTarget", () => {
  it("ignores inputs, textareas, selects, and contenteditable", () => {
    const input = { tagName: "INPUT", isContentEditable: false, closest: () => null };
    const textarea = {
      tagName: "TEXTAREA",
      isContentEditable: false,
      closest: () => null,
    };
    const select = {
      tagName: "SELECT",
      isContentEditable: false,
      closest: () => null,
    };
    const editable = {
      tagName: "DIV",
      isContentEditable: true,
      closest: () => null,
    };

    expect(shouldIgnoreShortcutTarget(input as unknown as Element)).toBe(true);
    expect(shouldIgnoreShortcutTarget(textarea as unknown as Element)).toBe(true);
    expect(shouldIgnoreShortcutTarget(select as unknown as Element)).toBe(true);
    expect(shouldIgnoreShortcutTarget(editable as unknown as Element)).toBe(true);
  });

  it("does not ignore ordinary buttons or the document body", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    expect(shouldIgnoreShortcutTarget(button as unknown as Element)).toBe(false);
    expect(shouldIgnoreShortcutTarget(null)).toBe(false);
  });
});

describe("matchShortcut", () => {
  it("returns null while focus is in an input", () => {
    const input = {
      tagName: "INPUT",
      isContentEditable: false,
      closest: () => null,
    };
    expect(
      matchShortcut(keyEvent("c", input as unknown as Element), "/cases"),
    ).toBeNull();
    expect(
      matchShortcut(keyEvent("p", input as unknown as Element), "/runs"),
    ).toBeNull();
    expect(
      matchShortcut(keyEvent("?", input as unknown as Element), "/cases"),
    ).toBeNull();
  });

  it("maps global single keys when focus is not in a field", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    const target = button as unknown as Element;
    expect(matchShortcut(keyEvent("c", target), "/cases")).toBe("create");
    expect(matchShortcut(keyEvent("j", target), "/cases")).toBe("nav-next");
    expect(matchShortcut(keyEvent("k", target), "/cases")).toBe("nav-prev");
    expect(matchShortcut(keyEvent("?", target), "/cases")).toBe("cheat-sheet");
  });

  it("scopes pass/fail/assign to the run executor and P/S on cases", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    const target = button as unknown as Element;
    const runPath = "/runs/11111111-1111-1111-1111-111111111111";
    expect(matchShortcut(keyEvent("p", target), "/cases")).toBe("priority");
    expect(matchShortcut(keyEvent("s", target), "/cases")).toBe("status");
    expect(matchShortcut(keyEvent("e", target), "/cases")).toBe("edit");
    expect(matchShortcut(keyEvent("Enter", target), "/cases")).toBe("open");
    expect(matchShortcut(keyEvent("x", target), "/cases")).toBe("select");
    expect(matchShortcut(keyEvent("f", target), "/runs")).toBeNull();
    expect(matchShortcut(keyEvent("p", target), runPath)).toBe("pass");
    expect(matchShortcut(keyEvent("s", target), runPath)).toBe("skipped");
    expect(matchShortcut(keyEvent("f", target), runPath)).toBe("fail");
    expect(matchShortcut(keyEvent("a", target), runPath)).toBe("assign");
    expect(matchShortcut(keyEvent("e", target), runPath)).toBeNull();
    expect(isRunExecutorPath(runPath)).toBe(true);
    expect(isRunExecutorPath("/runs/new")).toBe(false);
    expect(isCasesWorkspacePath("/cases")).toBe(true);
    expect(isCasesWorkspacePath("/cases/TOP-1")).toBe(true);
    expect(isCasesWorkspacePath("/cases/import")).toBe(false);
    expect(isRunsListPath("/runs")).toBe(true);
    expect(isRunsListPath(runPath)).toBe(false);
  });

  it("maps Shift+J/K to selection extend only on cases", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    const target = button as unknown as Element;
    expect(
      matchShortcut(keyEvent("j", target, { shiftKey: true }), "/cases"),
    ).toBe("nav-next-extend");
    expect(
      matchShortcut(keyEvent("k", target, { shiftKey: true }), "/cases"),
    ).toBe("nav-prev-extend");
    expect(
      matchShortcut(keyEvent("j", target, { shiftKey: true }), "/runs"),
    ).toBeNull();
  });

  it("matches Escape even while focus is in an input", () => {
    const input = {
      tagName: "INPUT",
      isContentEditable: false,
      closest: () => null,
    };
    expect(
      matchShortcut(keyEvent("Escape", input as unknown as Element), "/cases"),
    ).toBe("escape");
  });

  it("treats G as a go prefix and maps the second key", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    const target = button as unknown as Element;
    const input = {
      tagName: "INPUT",
      isContentEditable: false,
      closest: () => null,
    };
    expect(isGoPrefix(keyEvent("g", target))).toBe(true);
    expect(isGoPrefix(keyEvent("g", input as unknown as Element))).toBe(false);
    expect(matchGoChord(keyEvent("c", target))).toBe("go-cases");
    expect(matchGoChord(keyEvent("r", target))).toBe("go-runs");
    expect(matchGoChord(keyEvent("p", target))).toBe("go-plans");
    expect(matchGoChord(keyEvent("t", target))).toBe("go-triage");
    expect(matchGoChord(keyEvent("h", target))).toBe("go-hub");
    expect(matchGoChord(keyEvent("c", input as unknown as Element))).toBeNull();
    expect(hrefForGoShortcut("go-cases")).toBe("/cases");
    expect(hrefForGoShortcut("go-hub")).toBe("/");
  });

  it("ignores modifier combos so ⌘K and ⌘B stay with the palette and sidebar", () => {
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
      closest: () => null,
    };
    expect(
      matchShortcut(
        keyEvent("c", button as unknown as Element, { metaKey: true }),
        "/cases",
      ),
    ).toBeNull();
  });
});
