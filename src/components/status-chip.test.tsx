import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { StatusChip } from "./status-chip";

const reduceMotion = vi.hoisted(() => vi.fn<() => boolean | null>(() => null));

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: () => reduceMotion(),
  };
});

afterEach(() => {
  cleanup();
  reduceMotion.mockReset();
  reduceMotion.mockReturnValue(null);
});

function glyphStyle(html: string) {
  const match = html.match(/aria-hidden="true"[^>]*/);
  return match?.[0] ?? "";
}

describe("StatusChip hydration", () => {
  it("does not branch the first render on reduced-motion or entrance styles", () => {
    reduceMotion.mockReturnValue(null);
    const serverHtml = renderToString(<StatusChip>Passed</StatusChip>);
    reduceMotion.mockReturnValue(false);
    const clientHtml = renderToString(<StatusChip>Passed</StatusChip>);

    expect(glyphStyle(clientHtml)).toBe(glyphStyle(serverHtml));
    expect(serverHtml).not.toContain("opacity:0");
    expect(serverHtml).not.toContain("scale(0.75)");
    expect(serverHtml).toContain("Passed");
  });

  it("does not start a spin when reduced motion is preferred", () => {
    reduceMotion.mockReturnValue(true);
    const { container } = render(<StatusChip>Running</StatusChip>);
    const glyph = container.querySelector("[aria-hidden]");
    expect(glyph?.getAttribute("style") ?? "").not.toMatch(/rotate/);
  });

  it("starts entrance motion after mount when motion is allowed", async () => {
    reduceMotion.mockReturnValue(false);
    const { container } = render(<StatusChip>Passed</StatusChip>);
    await waitFor(() => {
      const style = container.querySelector("[aria-hidden]")?.getAttribute("style") ?? "";
      expect(style).toMatch(/opacity|transform|scale/);
    });
  });

  it("spins in-progress icons after mount only when motion is allowed", async () => {
    reduceMotion.mockReturnValue(false);
    const { container } = render(<StatusChip>Running</StatusChip>);
    await waitFor(() => {
      const style = container.querySelector("[aria-hidden]")?.getAttribute("style") ?? "";
      expect(style).toMatch(/rotate/);
    });
  });
});
