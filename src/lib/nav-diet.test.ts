import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_HREFS,
  PALETTE_PAGES,
  QUALITY_GRAPH_HREFS,
  visibleNavGroups,
  visibleNavItems,
  visiblePalettePages,
} from "./nav-diet";

describe("nav diet", () => {
  it("shows the default TCM set and hides the quality graph", () => {
    const hrefs = visibleNavItems(false).map((item) => item.href);
    expect(hrefs).toEqual([...DEFAULT_NAV_HREFS]);
    for (const href of QUALITY_GRAPH_HREFS) {
      expect(hrefs).not.toContain(href);
    }
    const labels = visibleNavItems(false).map((item) => item.label);
    expect(labels).toEqual([
      "Hub",
      "Test cases",
      "Plans",
      "Test runs",
      "Automation",
      "Triage",
      "Reports",
      "Settings",
    ]);
  });

  it("reveals a Quality graph group when the toggle is on", () => {
    const groups = visibleNavGroups(true);
    expect(groups.map((g) => g.id)).toEqual([
      "overview",
      "testing",
      "insights",
      "quality-graph",
      "account",
    ]);
    const hrefs = visibleNavItems(true).map((item) => item.href);
    expect(hrefs).toContain("/intents");
    expect(hrefs).toContain("/impact");
    expect(hrefs).toContain("/milestones");
    expect(hrefs).toContain("/risks");
    expect(hrefs).toContain("/components");
    expect(hrefs).toContain("/proposals");
    expect(hrefs).toContain("/plans");
  });

  it("keeps the current quality-graph page in the sidebar so the user is not stranded", () => {
    const hrefs = visibleNavItems(false, "/impact").map((item) => item.href);
    expect(hrefs).toContain("/impact");
    expect(hrefs).not.toContain("/intents");
    expect(hrefs).toContain("/cases");
  });

  it("covers every palette destination including quality-graph pages and import is a separate action", () => {
    const hrefs = PALETTE_PAGES.map((p) => p.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/impact", "/milestones", "/risks", "/components", "/plans"]));
    expect(hrefs).not.toContain("/cases/import");
    expect(PALETTE_PAGES.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Test cases", "Test runs"]),
    );
  });

  it("hides quality-graph destinations from the palette when the toggle is off", () => {
    const hrefs = visiblePalettePages(false).map((p) => p.href);
    expect(hrefs).toContain("/cases");
    expect(hrefs).toContain("/connect");
    expect(hrefs).not.toContain("/intents");
    expect(hrefs).not.toContain("/impact");
    expect(visiblePalettePages(true).map((p) => p.href)).toContain("/intents");
  });
});
