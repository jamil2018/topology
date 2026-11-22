import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { abortCleanup, abortReason, isAbortError } from "./abort";

const SRC_ROOT = join(process.cwd(), "src");

function walkSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("abort helpers", () => {
  it("recognizes AbortError-named objects and DOMExceptions", () => {
    expect(isAbortError(abortReason())).toBe(true);
    expect(
      isAbortError(Object.assign(new Error("aborted"), { name: "AbortError" })),
    ).toBe(true);
    expect(isAbortError(new Error("network"))).toBe(false);
    expect(isAbortError("unmount")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it("abortCleanup sets an AbortError with empty message, never a string or unmount label", () => {
    const controller = new AbortController();
    abortCleanup(controller);
    expect(controller.signal.aborted).toBe(true);
    expect(typeof controller.signal.reason).toBe("object");
    expect(typeof controller.signal.reason).not.toBe("string");
    expect(isAbortError(controller.signal.reason)).toBe(true);
    const message = (controller.signal.reason as DOMException).message;
    expect(message).toBe("");
    expect(message).not.toMatch(/unmount/i);
    expect(message).not.toMatch(/NotificationsBell|ImpactPanel|RunProductivity/i);
    expect(message).not.toBe("signal is aborted without reason");
  });

  it("abortReason() has empty message that isAbortError still matches", () => {
    const reason = abortReason();
    expect(reason.name).toBe("AbortError");
    expect(reason.message).toBe("");
    expect(isAbortError(reason)).toBe(true);
  });

  it("source tree never passes string unmount reasons to abort/abortCleanup", () => {
    const offenders: string[] = [];
    for (const file of walkSourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (
        /abortCleanup\s*\(\s*[^,)\n]+,\s*["'`][^"'`]*unmount/i.test(text) ||
        /\.abort\s*\(\s*["'`][^"'`]*unmount/i.test(text) ||
        /abortCleanup\s*\(\s*[^,)\n]+,\s*["'`]/i.test(text)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
